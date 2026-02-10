import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, GatewayIntentBits, Partials } from 'discord.js';
import { getDb } from '../db/index.js';
import { PansouService } from './pansou.service.js';
import { CloudStorageService } from './cloud-storage.service.js';
import { OpenListService } from './openlist.service.js';

const pansouService = PansouService.getInstance();
const cloudService = CloudStorageService.getInstance();
const openlistService = OpenListService.getInstance();

type SearchCache = { items: any[]; createdAt: number; page: number; pageSize: number };

export class DiscordService {
    private static instance: DiscordService;
    private client: Client | null = null;
    private initialized = false;
    private lastSearchResults = new Map<string, SearchCache>();
    private searchCacheTtlMs = 10 * 60 * 1000;
    private pendingTrackRequests = new Map<string, { item: any; createdAt: number }>();
    private trackRequestTtlMs = 10 * 60 * 1000;
    private pendingTransferRequests = new Map<string, { url: string; createdAt: number }>();
    private transferRequestTtlMs = 10 * 60 * 1000;

    private constructor() {}

    public static getInstance(): DiscordService {
        if (!DiscordService.instance) {
            DiscordService.instance = new DiscordService();
        }
        return DiscordService.instance;
    }

    public async init() {
        if (this.initialized) return;
        this.initialized = true;
        await this.initClient();
    }

    public async stop() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
        }
    }

    private async initClient() {
        const db = getDb();
        const tokenRow = await db.get('SELECT value FROM settings WHERE key = ?', 'discord_bot_token');
        const token = tokenRow?.value;
        if (!token) {
            console.log('[DiscordService] No Discord token found in settings, bot will not start');
            return;
        }

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel]
        });

        this.client.on('clientReady', () => {
            console.log(`[DiscordService] Discord Bot logged in as ${this.client?.user?.tag}`);
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            const content = message.content.trim();
            const mentionInfo = this.extractMentionKeyword(content, this.client?.user?.id);
            const link = this.extractCloudUrl(content);
            const isCommand = this.isCommandMessage(content) || mentionInfo.isMention || Boolean(link);
            const isDirectMessage = message.channel?.type === ChannelType.DM;
            const helpText = 'HoraceMovie Bot 命令:\n!help - 显示本消息\n!search <关键词> - 搜索网盘资源\n直接回复序号 - 转存资源';
            const cachedSelection = this.getCachedResults(message.channelId, message.author.id);
            const selectionHint = cachedSelection && cachedSelection.items.length > 0
                ? `请输入序号转存(1-${cachedSelection.items.length})`
                : '';

            const { userIds } = await this.getDiscordConfig();
            if (userIds.length > 0 && !userIds.includes(message.author.id)) {
                if (isCommand) {
                    await message.reply('无权限使用该命令');
                }
                return;
            }

            if (mentionInfo.isMention) {
                if (!mentionInfo.keyword) {
                    await message.reply('请输入搜索关键词, 例如: @Bot 肖申克的救赎');
                    return;
                }
                await this.replySearch(message, mentionInfo.keyword);
                return;
            }

            if (content.startsWith('!search')) {
                const keyword = content.replace('!search', '').trim();
                await this.replySearch(message, keyword);
                return;
            }

            if (/^\d+$/.test(content)) {
                const selection = Number(content);
                await this.handleSelection(message, selection);
                return;
            }

            if (content === '!help') {
                await message.reply(helpText);
                return;
            }

            if (link) {
                this.cacheTransferRequest(message.channelId, message.author.id, link);
                await message.reply({ content: '检测到网盘链接，是否转存？', components: this.buildTransferComponents(message.author.id) });
                return;
            }

            if (this.isTrackReply(content)) {
                const pendingTransfer = this.getTransferRequest(message.channelId, message.author.id);
                if (pendingTransfer) {
                    await this.handleTransferReply(message, content);
                    return;
                }
                const pendingTrack = this.getTrackRequest(message.channelId, message.author.id);
                if (pendingTrack) {
                    await this.handleTrackReply(message, content);
                    return;
                }
                if (isDirectMessage) {
                    await message.reply(selectionHint || helpText);
                }
                return;
            }

            if (isDirectMessage) {
                await message.reply(selectionHint || helpText);
                return;
            }

            await this.handleTrackReply(message, content);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            const { userIds } = await this.getDiscordConfig();
            if (userIds.length > 0 && !userIds.includes(interaction.user.id)) {
                await interaction.reply({ content: '无权限使用该命令', ephemeral: true });
                return;
            }
            const [action, targetUserId] = interaction.customId.split(':');
            if (targetUserId && targetUserId !== interaction.user.id) {
                await interaction.reply({ content: '仅发起人可操作', ephemeral: true });
                return;
            }
            if (action === 'search_prev' || action === 'search_next') {
                await this.handleSearchPage(interaction, action === 'search_next' ? 1 : -1);
                return;
            }
            if (action === 'transfer_yes' || action === 'transfer_no') {
                await this.handleTransferButton(interaction, action === 'transfer_yes');
                return;
            }
            if (action === 'track_yes' || action === 'track_no') {
                await this.handleTrackButton(interaction, action === 'track_yes');
            }
        });

        await this.client.login(token);
        console.log('[DiscordService] Discord Bot initialized and launched');
    }

    public async notify(message: string) {
        if (!this.client) return;
        const { channelIds } = await this.getDiscordConfig();
        if (channelIds.length === 0) {
            console.warn('[DiscordService] discord_channel_ids not configured, cannot send notification');
            return;
        }
        for (const channelId of channelIds) {
            try {
                const channel = await this.client.channels.fetch(channelId);
                if (channel && channel.isTextBased() && 'send' in channel) {
                    await channel.send(message);
                }
            } catch (error: any) {
                console.error('[DiscordService] Notify failed:', error.message);
            }
        }
    }

    private getSearchKey(channelId: string, userId: string) {
        return `${channelId}:${userId}`;
    }

    private cacheSearchResults(channelId: string, userId: string, items: any[], page: number, pageSize: number) {
        const key = this.getSearchKey(channelId, userId);
        this.lastSearchResults.set(key, { items, createdAt: Date.now(), page, pageSize });
    }

    private getCachedResults(channelId: string, userId: string) {
        const key = this.getSearchKey(channelId, userId);
        const record = this.lastSearchResults.get(key);
        if (!record) return null;
        if (Date.now() - record.createdAt > this.searchCacheTtlMs) {
            this.lastSearchResults.delete(key);
            return null;
        }
        return record;
    }

    private truncateTitle(title?: string, maxLength = 100) {
        const value = (title || '').trim();
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength)}...`;
    }

    private pickTopResults(items: any[], maxCount: number) {
        const top115 = items.filter(r => r.type === '115').slice(0, 5);
        const topQuark = items.filter(r => r.type === 'quark').slice(0, 5);
        const selected = [...top115, ...topQuark];
        const remaining = items.filter(r => !selected.includes(r));
        while (selected.length < maxCount && remaining.length > 0) {
            selected.push(remaining.shift() as any);
        }
        return selected.slice(0, maxCount);
    }

    private buildSearchMessage(items: any[], page: number, pageSize: number) {
        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, total);
        let msg = `找到以下资源(第 ${page}/${totalPages} 页):\n`;
        items.slice(startIndex, endIndex).forEach((res, i) => {
            const index = startIndex + i + 1;
            msg += `${index}. ${this.truncateTitle(res.name)}\n${res.url}\n\n`;
        });
        msg += `请输入序号转存(1-${total})`;
        return msg;
    }

    private isCommandMessage(content: string) {
        if (!content) return false;
        if (content.startsWith('!search') || content === '!help') return true;
        if (/^\d+$/.test(content)) return true;
        return this.isTrackReply(content);
    }

    private isTrackReply(content: string) {
        if (!content) return false;
        return ['是', '否', 'yes', 'no', 'y', 'n'].includes(content.toLowerCase());
    }

    private extractMentionKeyword(content: string, botId?: string) {
        if (!content || !botId) return { isMention: false, keyword: '' };
        const pattern = new RegExp(`<@!?${botId}>`, 'g');
        if (!pattern.test(content)) {
            return { isMention: false, keyword: '' };
        }
        const keyword = content.replace(pattern, '').trim();
        return { isMention: true, keyword };
    }

    private extractCloudUrl(text: string) {
        if (!text) return '';
        const urls = text.match(/https?:\/\/\S+/g) || [];
        const match = urls.find(url => url.includes('115.com') || url.includes('anxia.com') || url.includes('quark.cn'));
        return match || '';
    }

    private buildSearchComponents(page: number, totalPages: number, userId: string) {
        if (totalPages <= 1) return [];
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`search_prev:${userId}`)
                .setLabel('上一页')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`search_next:${userId}`)
                .setLabel('下一页')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages)
        );
        return [row];
    }

    private buildTrackComponents(userId: string) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`track_yes:${userId}`).setLabel('是').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`track_no:${userId}`).setLabel('否').setStyle(ButtonStyle.Secondary)
        );
        return [row];
    }

    private buildTransferComponents(userId: string) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`transfer_yes:${userId}`).setLabel('是').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`transfer_no:${userId}`).setLabel('否').setStyle(ButtonStyle.Secondary)
        );
        return [row];
    }

    private async handleSearchPage(interaction: any, direction: number) {
        const cached = this.getCachedResults(interaction.channelId, interaction.user.id);
        if (!cached || cached.items.length === 0) {
            await interaction.reply({ content: '没有可用的搜索结果，请先搜索', ephemeral: true });
            return;
        }
        const totalPages = Math.ceil(cached.items.length / cached.pageSize);
        const nextPage = cached.page + direction;
        if (nextPage < 1 || nextPage > totalPages) {
            await interaction.reply({ content: '没有更多结果', ephemeral: true });
            return;
        }
        const msg = this.buildSearchMessage(cached.items, nextPage, cached.pageSize);
        this.cacheSearchResults(interaction.channelId, interaction.user.id, cached.items, nextPage, cached.pageSize);
        await interaction.update({ content: msg, components: this.buildSearchComponents(nextPage, totalPages, interaction.user.id) });
    }

    private async handleTrackButton(interaction: any, accepted: boolean) {
        const item = this.getTrackRequest(interaction.channelId, interaction.user.id);
        if (!item) {
            await interaction.reply({ content: '追剧请求已过期', ephemeral: true });
            return;
        }
        this.clearTrackRequest(interaction.channelId, interaction.user.id);
        if (!accepted) {
            await interaction.update({ content: `${interaction.message.content}\n已取消`, components: [] });
            return;
        }
        const result = await this.createTrackerTaskByItem(item);
        await interaction.update({ content: `${interaction.message.content}\n${result.message}`, components: [] });
    }

    private resolveResourceType(item: any) {
        if (item?.type === '115' || item?.type === 'quark') {
            return item.type;
        }
        const url = item?.url || '';
        if (url.includes('115.com') || url.includes('anxia.com')) return '115';
        if (url.includes('quark.cn')) return 'quark';
        return '';
    }

    private async replySearch(message: any, keyword: string) {
        if (!keyword) {
            await message.reply('请输入搜索关键词, 例如: !search 肖申克的救赎');
            return;
        }
        const loading = await message.reply(`正在搜索: ${keyword}...`);
        try {
            const results = await pansouService.search(keyword);
            const ordered = this.pickTopResults(results, results.length);
            if (ordered.length === 0) {
                await loading.edit('未找到相关资源');
                return;
            }
            this.cacheSearchResults(message.channelId, message.author.id, ordered, 1, 10);
            const msg = this.buildSearchMessage(ordered, 1, 10);
            const totalPages = Math.ceil(ordered.length / 10);
            await loading.edit({ content: msg, components: this.buildSearchComponents(1, totalPages, message.author.id) });
        } catch (e: any) {
            await loading.edit(`搜索出错: ${e.message}`);
        }
    }

    private async handleSelection(message: any, selection: number) {
        const cached = this.getCachedResults(message.channelId, message.author.id);
        if (!cached || cached.items.length === 0) {
            await message.reply('没有可用的搜索结果，请先搜索');
            return;
        }
        if (!Number.isFinite(selection) || selection < 1 || selection > cached.items.length) {
            await message.reply(`请输入 1-${cached.items.length} 范围内的序号`);
            return;
        }
        const item = cached.items[selection - 1];
        await this.transferByResult(message, item);
    }

    private async transferByResult(message: any, item: any) {
        const type = this.resolveResourceType(item);
        if (!type) {
            await message.reply('无法识别该资源的网盘类型');
            return;
        }

        const db = getDb();
        const cookieKey = type === '115' ? 'cookie_115' : 'cookie_quark';
        const folderKey = type === '115' ? 'folder_id_115' : 'folder_id_quark';
        const openlistPathKey = type === '115' ? 'openlist_path_115' : 'openlist_path_quark';
        const settingsRows = await db.all(
            'SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)',
            [cookieKey, folderKey, openlistPathKey, 'openlist_default_path']
        );
        const settings: any = {};
        settingsRows.forEach(row => {
            settings[row.key] = row.value;
        });

        const cookie = settings[cookieKey];
        const targetFolderId = settings[folderKey] || '0';
        const openlistSourcePath = settings[openlistPathKey];
        const openlistDefaultPath = settings['openlist_default_path'];

        if (!cookie) {
            await message.reply(`未配置 ${type} 网盘 Cookie`);
            return;
        }

        let result;
        if (type === '115') {
            result = await cloudService.saveTo115(cookie, item.url, targetFolderId);
        } else {
            result = await cloudService.saveToQuark(cookie, item.url, targetFolderId);
        }

        if (!result.success) {
            await message.reply(`转存失败: ${result.message}`);
            return;
        }

        let syncMsg = '';
        if (openlistSourcePath) {
            const { taskId, error } = await openlistService.copyFile(openlistSourcePath, result.names || [], openlistDefaultPath);
            if (taskId) {
                syncMsg = `\nOpenList 同步任务创建成功`;
            } else if (error) {
                syncMsg = `\nOpenList 同步失败: ${error}`;
            }
        }

        let replyMsg = `转存成功: ${result.message}${syncMsg}`;
        if (type === 'quark') {
            replyMsg += '\n是否追剧？';
            this.cacheTrackRequest(message.channelId, message.author.id, item);
            await message.reply({ content: replyMsg, components: this.buildTrackComponents(message.author.id) });
            return;
        }
        await message.reply(replyMsg);
    }

    private cacheTransferRequest(channelId: string, userId: string, url: string) {
        const key = this.getSearchKey(channelId, userId);
        this.pendingTransferRequests.set(key, { url, createdAt: Date.now() });
    }

    private getTransferRequest(channelId: string, userId: string) {
        const key = this.getSearchKey(channelId, userId);
        const record = this.pendingTransferRequests.get(key);
        if (!record) return null;
        if (Date.now() - record.createdAt > this.transferRequestTtlMs) {
            this.pendingTransferRequests.delete(key);
            return null;
        }
        return record.url;
    }

    private clearTransferRequest(channelId: string, userId: string) {
        const key = this.getSearchKey(channelId, userId);
        this.pendingTransferRequests.delete(key);
    }

    private cacheTrackRequest(channelId: string, userId: string, item: any) {
        const key = this.getSearchKey(channelId, userId);
        this.pendingTrackRequests.set(key, { item, createdAt: Date.now() });
    }

    private getTrackRequest(channelId: string, userId: string) {
        const key = this.getSearchKey(channelId, userId);
        const record = this.pendingTrackRequests.get(key);
        if (!record) return null;
        if (Date.now() - record.createdAt > this.trackRequestTtlMs) {
            this.pendingTrackRequests.delete(key);
            return null;
        }
        return record.item;
    }

    private clearTrackRequest(channelId: string, userId: string) {
        const key = this.getSearchKey(channelId, userId);
        this.pendingTrackRequests.delete(key);
    }

    private async handleTransferButton(interaction: any, accepted: boolean) {
        const url = this.getTransferRequest(interaction.channelId, interaction.user.id);
        if (!url) {
            await interaction.reply({ content: '转存请求已过期', ephemeral: true });
            return;
        }
        this.clearTransferRequest(interaction.channelId, interaction.user.id);
        if (!accepted) {
            try {
                await interaction.message.delete();
            } catch {}
            return;
        }
        await interaction.update({ content: `${interaction.message.content}\n开始转存...`, components: [] });
        await this.transferByResult(
            {
                channelId: interaction.channelId,
                author: interaction.user,
                reply: (payload: any) => interaction.followUp(payload)
            },
            { url }
        );
    }

    private async handleTransferReply(message: any, content: string) {
        if (!this.isTrackReply(content)) return;
        const accepted = ['是', 'yes', 'y'].includes(content.toLowerCase());
        const url = this.getTransferRequest(message.channelId, message.author.id);
        if (!url) return;
        this.clearTransferRequest(message.channelId, message.author.id);
        if (!accepted) {
            await message.reply('已取消');
            return;
        }
        await this.transferByResult(message, { url });
    }

    private async handleTrackReply(message: any, content: string) {
        if (!['是', '否', 'yes', 'no', 'y', 'n'].includes(content.toLowerCase())) return;
        const accepted = ['是', 'yes', 'y'].includes(content.toLowerCase());
        const item = this.getTrackRequest(message.channelId, message.author.id);
        if (!item) return;
        this.clearTrackRequest(message.channelId, message.author.id);
        if (!accepted) {
            await message.reply('已取消');
            return;
        }
        await this.createTrackerTask(message, item);
    }

    private extractShareCode(shareUrl: string) {
        const match = shareUrl.match(/\/s\/([a-zA-Z0-9]+)/);
        if (match) return match[1];
        const shareIdMatch = shareUrl.match(/[?&]share_id=([a-zA-Z0-9]+)/);
        if (shareIdMatch) return shareIdMatch[1];
        const shareCodeMatch = shareUrl.match(/[?&]share_code=([a-zA-Z0-9]+)/);
        if (shareCodeMatch) return shareCodeMatch[1];
        return '';
    }

    private buildTrackerName(shareUrl: string, panType: 'quark' | '115') {
        const shareCode = this.extractShareCode(shareUrl);
        return `${panType}-${shareCode || 'unknown'}`;
    }

    private async createTrackerTask(message: any, item: any) {
        const result = await this.createTrackerTaskByItem(item);
        await message.reply(result.message);
    }

    private async createTrackerTaskByItem(item: any) {
        const shareUrl = item?.url || '';
        if (!shareUrl.includes('quark.cn')) {
            return { success: false, message: '追剧功能仅支持夸克网盘' };
        }
        const db = getDb();
        const existing = await db.get('SELECT id FROM tracker_tasks WHERE share_url = ?', shareUrl);
        if (existing) {
            return { success: false, message: '追剧任务已存在' };
        }
        const settingsRows = await db.all('SELECT key, value FROM settings WHERE key IN ("cookie_quark", "folder_id_quark")');
        const settings: any = {};
        settingsRows.forEach(row => {
            settings[row.key] = row.value;
        });
        const cookie = settings.cookie_quark;
        const targetFolderId = settings.folder_id_quark;
        if (!cookie) {
            return { success: false, message: '未配置夸克 Cookie，无法创建追剧任务' };
        }
        if (!targetFolderId) {
            return { success: false, message: '未配置默认转存目录，无法创建追剧任务' };
        }
        const currentFiles = await cloudService.getShareSnap('quark', cookie, shareUrl);
        if (!currentFiles || currentFiles.length === 0) {
            return { success: false, message: '无法获取分享链接内容，请检查链接是否有效或提取码是否正确' };
        }
        const lastFileIds = JSON.stringify(currentFiles.map((f: any) => f.id));
        const now = new Date().toLocaleString('sv-SE');
        const name = this.buildTrackerName(shareUrl, 'quark');
        await db.run(
            'INSERT INTO tracker_tasks (name, keyword, share_url, target_folder_id, pan_type, interval_value, interval_unit, last_file_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            name, '', shareUrl, targetFolderId, 'quark', 6, 'hour', lastFileIds, now
        );
        return { success: true, message: '追剧任务创建成功' };
    }

    private parseIdList(value?: string | null) {
        if (!value) return [];
        return value
            .split(/[\s,]+/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    private async getDiscordConfig() {
        const db = getDb();
        const rows = await db.all('SELECT key, value FROM settings WHERE key IN ("discord_bot_token", "discord_channel_ids", "discord_user_ids")');
        const settings: any = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        return {
            channelIds: this.parseIdList(settings.discord_channel_ids),
            userIds: this.parseIdList(settings.discord_user_ids)
        };
    }
}
