import { Telegraf } from 'telegraf';
import { getDb } from '../db/index.js';
import { PansouService } from './pansou.service.js';
import { CloudStorageService } from './cloud-storage.service.js';
import { OpenListService } from './openlist.service.js';

const pansouService = PansouService.getInstance();
const cloudService = CloudStorageService.getInstance();
const openlistService = OpenListService.getInstance();

export class TelegramService {
    private static instance: TelegramService;
    private bot: Telegraf | null = null;
    private initialized = false;
    private botUsername: string | null = null;
    private lastSearchResults = new Map<string, { items: any[]; createdAt: number; page: number; pageSize: number }>();
    private searchCacheTtlMs = 10 * 60 * 1000;
    private pendingTrackRequests = new Map<string, { item: any; createdAt: number }>();
    private trackRequestTtlMs = 10 * 60 * 1000;
    private pendingTransferRequests = new Map<string, { url: string; createdAt: number }>();
    private transferRequestTtlMs = 10 * 60 * 1000;

    private constructor() {
    }

    public static getInstance(): TelegramService {
        if (!TelegramService.instance) {
            TelegramService.instance = new TelegramService();
        }
        return TelegramService.instance;
    }

    public async init() {
        if (this.initialized) return;
        this.initialized = true;
        await this.initBot();
    }

    public async stop() {
        if (this.bot) {
            console.log('[TelegramService] Stopping Telegram Bot...');
            await this.bot.stop();
            this.bot = null;
            console.log('[TelegramService] Telegram Bot stopped');
        }
    }

    private async initBot() {
        const db = getDb();
        try {
            const token = await db.get('SELECT value FROM settings WHERE key = ?', 'telegram_bot_token');
            if (token && token.value) {
                console.log('[TelegramService] Initializing Telegram Bot with token from DB');
                this.bot = new Telegraf(token.value);
                try {
                    const me = await this.bot.telegram.getMe();
                    this.botUsername = me.username ? `@${me.username}` : null;
                } catch (error: any) {
                    console.error('[TelegramService] Failed to load bot username:', error.message);
                }

                this.bot.on('message', async (ctx, next) => {
                    const userId = String(ctx.from?.id || '');
                    const username = ctx.from?.username || '';
                    const firstName = ctx.from?.first_name || '';
                    const lastName = ctx.from?.last_name || '';
                    const text = 'text' in ctx.message ? ctx.message.text || '' : '';
                    console.log(`[TelegramService] Incoming message from ${userId} ${username} ${firstName} ${lastName}: ${text}`);
                    if (text && this.botUsername && text.includes(this.botUsername)) {
                        if (!(await this.isAuthorized(ctx))) {
                            return ctx.reply('无权限使用该命令');
                        }
                        const keyword = text.replace(this.botUsername, '').trim();
                        await this.replySearch(ctx, keyword);
                        return;
                    }
                    const trimmed = text.trim();
                    if (/^\d+$/.test(trimmed)) {
                        if (!(await this.isAuthorized(ctx))) {
                            return ctx.reply('无权限使用该命令');
                        }
                        const selection = Number(trimmed);
                        await this.handleSelection(ctx, selection);
                        return;
                    }
                    const link = this.extractCloudUrl(text);
                    if (link) {
                        if (!(await this.isAuthorized(ctx))) {
                            return ctx.reply('无权限使用该命令');
                        }
                        this.cacheTransferRequest(ctx, link);
                        await ctx.reply('检测到网盘链接，是否转存？', {
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '是', callback_data: 'transfer_yes' },
                                        { text: '否', callback_data: 'transfer_no' }
                                    ]
                                ]
                            }
                        });
                        return;
                    }
                    return next();
                });

                this.bot.command('search', async (ctx) => {
                    if (!(await this.isAuthorized(ctx))) {
                        return ctx.reply('无权限使用该命令');
                    }

                    const keyword = ctx.message.text.split(' ').slice(1).join(' ');
                    await this.replySearch(ctx, keyword);
                });

                this.bot.action('search_prev', async (ctx) => {
                    if (!(await this.isAuthorized(ctx))) {
                        await ctx.answerCbQuery('无权限使用该命令');
                        return;
                    }
                    await this.handleSearchPage(ctx, -1);
                });

                this.bot.action('search_next', async (ctx) => {
                    if (!(await this.isAuthorized(ctx))) {
                        await ctx.answerCbQuery('无权限使用该命令');
                        return;
                    }
                    await this.handleSearchPage(ctx, 1);
                });

                this.bot.action('transfer_yes', async (ctx) => {
                    if (!(await this.isAuthorized(ctx))) {
                        await ctx.answerCbQuery('无权限使用该命令');
                        return;
                    }
                    await this.handleTransferDecision(ctx, true);
                });

                this.bot.action('transfer_no', async (ctx) => {
                    if (!(await this.isAuthorized(ctx))) {
                        await ctx.answerCbQuery('无权限使用该命令');
                        return;
                    }
                    await this.handleTransferDecision(ctx, false);
                });

                this.bot.action('track_yes', async (ctx) => {
                    if (!(await this.isAuthorized(ctx))) {
                        await ctx.answerCbQuery('无权限使用该命令');
                        return;
                    }
                    await this.handleTrackDecision(ctx, true);
                });

                this.bot.action('track_no', async (ctx) => {
                    if (!(await this.isAuthorized(ctx))) {
                        await ctx.answerCbQuery('无权限使用该命令');
                        return;
                    }
                    await this.handleTrackDecision(ctx, false);
                });

                this.bot.on('inline_query', async (ctx) => {
                    const { userIds } = await this.getTelegramConfig();
                    const requesterId = String(ctx.from?.id || '');
                    if (userIds.length > 0 && !userIds.includes(requesterId)) {
                        return this.safeAnswerInlineQuery(ctx, [], { cache_time: 0, is_personal: true });
                    }
                    const keyword = (ctx.inlineQuery?.query || '').trim();
                    if (!keyword) {
                        return this.safeAnswerInlineQuery(ctx, [], { cache_time: 0, is_personal: true });
                    }
                    try {
                        const results = await pansouService.search(keyword);
                        const selected = this.pickTopResults(results, 10);
                        const items = selected.map((res, index) => ({
                            type: 'article' as const,
                            id: `${index}-${res.url}`,
                            title: this.truncateTitle(res.name),
                            description: res.url,
                            input_message_content: {
                                message_text: `${this.truncateTitle(res.name)}\n${res.url}`
                            }
                        }));
                        return this.safeAnswerInlineQuery(ctx, items, { cache_time: 5, is_personal: true });
                    } catch (e: any) {
                        console.error(`[TelegramService] Inline search error for "${keyword}":`, e.message);
                        return this.safeAnswerInlineQuery(ctx, [], { cache_time: 0, is_personal: true });
                    }
                });

                this.bot.start(async (ctx) => {
                    const { userIds } = await this.getTelegramConfig();
                    const requesterId = String(ctx.from?.id || '');
                    if (userIds.length > 0 && !userIds.includes(requesterId)) {
                        return ctx.reply('无权限使用该命令');
                    }
                    ctx.reply(
                        '欢迎使用 HoraceMovie Bot，请点击按钮开始搜索。',
                        {
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '开始搜索', switch_inline_query_current_chat: '' }]
                                ]
                            }
                        }
                    );
                });

                this.bot.help(async (ctx) => {
                    const { userIds } = await this.getTelegramConfig();
                    const requesterId = String(ctx.from?.id || '');
                    if (userIds.length > 0 && !userIds.includes(requesterId)) {
                        return ctx.reply('无权限使用该命令');
                    }
                    ctx.reply('HoraceMovie Bot 命令:\n/search <关键词> - 搜索网盘资源\n/help - 显示此帮助');
                });

                this.bot.catch((err: any, ctx: any) => {
                    if (this.isInlineQueryTooOld(err)) {
                        return;
                    }
                    console.error('[TelegramService] Bot error:', err);
                });

                (this.bot.launch as any)({
                    handleSignals: false
                }).catch((err: any) => console.error('[TelegramService] TG Bot launch failed:', err));
                console.log('[TelegramService] Telegram Bot initialized and launched');
            } else {
                console.log('[TelegramService] No Telegram Bot token found in settings, bot will not start');
            }
        } catch (error: any) {
            console.error('[TelegramService] Failed to initialize bot:', error.message);
        }
    }

    private async isAuthorized(ctx: any) {
        const { userIds } = await this.getTelegramConfig();
        const requesterId = String(ctx.from?.id || '');
        return userIds.length === 0 || userIds.includes(requesterId);
    }

    private async replySearch(ctx: any, keyword: string) {
        if (!keyword) return ctx.reply('请输入搜索关键词, 例如: /search 肖申克的救赎');
        console.log(`[TelegramService] Bot received search for: "${keyword}"`);
        const loadingMsg = await ctx.reply(`正在搜索: ${keyword}...`);
        const cleanup = async () => {
            if (loadingMsg?.message_id) {
                try {
                    await ctx.deleteMessage(loadingMsg.message_id);
                } catch {}
            }
        };
        try {
            const results = await pansouService.search(keyword);
            console.log(`[TelegramService] Bot search for "${keyword}" returned ${results.length} results`);
            const ordered = this.pickTopResults(results, results.length);
            if (ordered.length === 0) {
                await cleanup();
                return ctx.reply('未找到相关资源');
            }
            this.cacheSearchResults(ctx, ordered, 1, 10);
            const msg = this.buildSearchMessage(ordered, 1, 10);
            const totalPages = Math.ceil(ordered.length / 10);
            await cleanup();
            ctx.reply(msg, this.buildPaginationKeyboard(1, totalPages));
        } catch (e: any) {
            console.error(`[TelegramService] Bot search error for "${keyword}":`, e.message);
            await cleanup();
            ctx.reply(`搜索出错: ${e.message}`);
        }
    }

    private pickTopResults(results: any[], limit: number) {
        const normalizeType = (value?: string) => (value || '').toLowerCase();
        const is115 = (item: any) => normalizeType(item.type) === '115';
        const isQuark = (item: any) => normalizeType(item.type) === 'quark';
        const top115 = results.filter(is115).slice(0, 5);
        const topQuark = results.filter(isQuark).slice(0, 5);
        const combined = [...top115, ...topQuark];
        const seen = new Set<string>();
        combined.forEach(item => {
            seen.add(item.url || item.name || '');
        });
        if (combined.length >= limit) {
            return combined.slice(0, limit);
        }
        const remaining = results.filter(item => {
            const key = item.url || item.name || '';
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return combined.concat(remaining).slice(0, limit);
    }

    private truncateTitle(title?: string, maxLength = 100) {
        const value = (title || '').trim();
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength)}...`;
    }

    private isInlineQueryTooOld(err: any) {
        const description = err?.response?.description || err?.message || '';
        return typeof description === 'string' && description.includes('query is too old');
    }

    private async safeAnswerInlineQuery(ctx: any, results: any[], options: any) {
        try {
            return await ctx.answerInlineQuery(results, options);
        } catch (err: any) {
            if (this.isInlineQueryTooOld(err)) {
                return;
            }
            throw err;
        }
    }

    private getSearchKey(ctx: any) {
        const chatId = ctx.chat?.id ?? ctx.message?.chat?.id ?? ctx.callbackQuery?.message?.chat?.id ?? 'unknown';
        const userId = ctx.from?.id ?? 'unknown';
        return `${chatId}:${userId}`;
    }

    private cacheSearchResults(ctx: any, items: any[], page: number, pageSize: number) {
        const key = this.getSearchKey(ctx);
        this.lastSearchResults.set(key, { items, createdAt: Date.now(), page, pageSize });
    }

    private getCachedResults(ctx: any) {
        const key = this.getSearchKey(ctx);
        const record = this.lastSearchResults.get(key);
        if (!record) return null;
        if (Date.now() - record.createdAt > this.searchCacheTtlMs) {
            this.lastSearchResults.delete(key);
            return null;
        }
        return record;
    }

    private buildSearchMessage(items: any[], page: number, pageSize: number) {
        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, total);
        let msg = `找到以下资源(第 ${page}/${totalPages} 页):\n`;
        items.slice(startIndex, endIndex).forEach((res, i) => {
            const index = startIndex + i + 1;
            msg += `${index}. ${this.truncateTitle(res.name)}\n🔗 ${res.url}\n\n`;
        });
        msg += `请输入序号转存(1-${total})`;
        return msg;
    }

    private buildPaginationKeyboard(page: number, totalPages: number) {
        if (totalPages <= 1) return undefined;
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '上一页', callback_data: 'search_prev' },
                        { text: '下一页', callback_data: 'search_next' }
                    ]
                ]
            }
        };
    }

    private async handleSearchPage(ctx: any, direction: number) {
        const cached = this.getCachedResults(ctx);
        if (!cached) {
            await ctx.answerCbQuery('没有可用的搜索结果');
            return;
        }
        const { items, page, pageSize } = cached;
        const totalPages = Math.ceil(items.length / pageSize);
        const nextPage = page + direction;
        if (nextPage < 1 || nextPage > totalPages) {
            await ctx.answerCbQuery('没有更多结果');
            return;
        }
        this.cacheSearchResults(ctx, items, nextPage, pageSize);
        const msg = this.buildSearchMessage(items, nextPage, pageSize);
        const keyboard = this.buildPaginationKeyboard(nextPage, totalPages);
        try {
            await ctx.editMessageText(msg, keyboard);
        } catch {
            await ctx.reply(msg, keyboard);
        }
        await ctx.answerCbQuery();
    }

    private extractCloudUrl(text: string) {
        if (!text) return '';
        const urls = text.match(/https?:\/\/\S+/g) || [];
        const match = urls.find(url => url.includes('115cdn.com') || url.includes('115.com') || url.includes('anxia.com') || url.includes('quark.cn'));
        return match || '';
    }

    private async handleTransferDecision(ctx: any, accepted: boolean) {
        try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch {}
        if (!accepted) {
            this.clearTransferRequest(ctx);
            try {
                await ctx.deleteMessage();
            } catch {}
            await ctx.answerCbQuery('已取消');
            return;
        }
        const url = this.getTransferRequest(ctx);
        if (!url) {
            await ctx.answerCbQuery('请求已过期');
            return;
        }
        this.clearTransferRequest(ctx);
        await this.transferByResult(ctx, { url });
        await ctx.answerCbQuery();
    }

    private resolveResourceType(item: any): '115' | 'quark' | '' {
        const type = (item?.type || '').toLowerCase();
        if (type === '115' || type === 'quark') return type as '115' | 'quark';
        const url = item?.url || '';
        if (url.includes('115.com') || url.includes('anxia.com')) return '115';
        if (url.includes('quark.cn')) return 'quark';
        return '';
    }

    private async handleSelection(ctx: any, selection: number) {
        const cached = this.getCachedResults(ctx);
        if (!cached || cached.items.length === 0) {
            return ctx.reply('没有可用的搜索结果，请先搜索');
        }
        if (!Number.isFinite(selection) || selection < 1 || selection > cached.items.length) {
            return ctx.reply(`请输入 1-${cached.items.length} 范围内的序号`);
        }
        const item = cached.items[selection - 1];
        await this.transferByResult(ctx, item);
    }

    private async transferByResult(ctx: any, item: any) {
        const type = this.resolveResourceType(item);
        if (!type) {
            return ctx.reply('无法识别该资源的网盘类型');
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
            return ctx.reply(`未配置 ${type} 网盘 Cookie`);
        }

        let result;
        if (type === '115') {
            result = await cloudService.saveTo115(cookie, item.url, targetFolderId);
        } else {
            result = await cloudService.saveToQuark(cookie, item.url, targetFolderId);
        }

        if (!result.success) {
            return ctx.reply(`转存失败: ${result.message}`);
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

        let message = `转存成功: ${result.message}${syncMsg}`;
        if (type === 'quark') {
            message += '\n是否追剧？';
            this.cacheTrackRequest(ctx, item);
            await ctx.reply(message, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '是', callback_data: 'track_yes' },
                            { text: '否', callback_data: 'track_no' }
                        ]
                    ]
                }
            });
            return;
        }
        await ctx.reply(message);
        return;
    }

    private getTransferKey(ctx: any) {
        return this.getSearchKey(ctx);
    }

    private cacheTransferRequest(ctx: any, url: string) {
        const key = this.getTransferKey(ctx);
        this.pendingTransferRequests.set(key, { url, createdAt: Date.now() });
    }

    private getTransferRequest(ctx: any) {
        const key = this.getTransferKey(ctx);
        const record = this.pendingTransferRequests.get(key);
        if (!record) return null;
        if (Date.now() - record.createdAt > this.transferRequestTtlMs) {
            this.pendingTransferRequests.delete(key);
            return null;
        }
        return record.url;
    }

    private clearTransferRequest(ctx: any) {
        const key = this.getTransferKey(ctx);
        this.pendingTransferRequests.delete(key);
    }

    private getTrackKey(ctx: any) {
        return this.getSearchKey(ctx);
    }

    private cacheTrackRequest(ctx: any, item: any) {
        const key = this.getTrackKey(ctx);
        this.pendingTrackRequests.set(key, { item, createdAt: Date.now() });
    }

    private getTrackRequest(ctx: any) {
        const key = this.getTrackKey(ctx);
        const record = this.pendingTrackRequests.get(key);
        if (!record) return null;
        if (Date.now() - record.createdAt > this.trackRequestTtlMs) {
            this.pendingTrackRequests.delete(key);
            return null;
        }
        return record.item;
    }

    private clearTrackRequest(ctx: any) {
        const key = this.getTrackKey(ctx);
        this.pendingTrackRequests.delete(key);
    }

    private async handleTrackDecision(ctx: any, accepted: boolean) {
        try {
            await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch {}
        if (!accepted) {
            this.clearTrackRequest(ctx);
            await ctx.answerCbQuery('已取消');
            return;
        }
        const item = this.getTrackRequest(ctx);
        if (!item) {
            await ctx.answerCbQuery('请求已过期');
            return;
        }
        this.clearTrackRequest(ctx);
        await this.createTrackerTask(ctx, item);
        await ctx.answerCbQuery();
    }

    private async createTrackerTask(ctx: any, item: any) {
        const shareUrl = item?.url || '';
        if (!shareUrl.includes('quark.cn')) {
            return ctx.reply('追剧功能仅支持夸克网盘');
        }
        const db = getDb();
        const existing = await db.get('SELECT id FROM tracker_tasks WHERE share_url = ?', shareUrl);
        if (existing) {
            return ctx.reply('追剧任务已存在');
        }
        const settingsRows = await db.all('SELECT key, value FROM settings WHERE key IN ("cookie_quark", "folder_id_quark")');
        const settings: any = {};
        settingsRows.forEach(row => {
            settings[row.key] = row.value;
        });
        const cookie = settings.cookie_quark;
        const targetFolderId = settings.folder_id_quark;
        if (!cookie) {
            return ctx.reply('未配置夸克 Cookie，无法创建追剧任务');
        }
        if (!targetFolderId) {
            return ctx.reply('未配置默认转存目录，无法创建追剧任务');
        }
        const currentFiles = await cloudService.getShareSnap('quark', cookie, shareUrl);
        if (!currentFiles || currentFiles.length === 0) {
            return ctx.reply('无法获取分享链接内容，请检查链接是否有效或提取码是否正确');
        }
        const lastFileIds = JSON.stringify(currentFiles.map((f: any) => f.id));
        const now = new Date().toLocaleString('sv-SE');
        const name = this.truncateTitle(item?.name || '未命名资源', 80);
        await db.run(
            'INSERT INTO tracker_tasks (name, keyword, share_url, target_folder_id, pan_type, interval_value, interval_unit, last_file_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            name, '', shareUrl, targetFolderId, 'quark', 6, 'hour', lastFileIds, now
        );
        return ctx.reply('追剧任务创建成功');
    }

    public async notify(message: string) {
        if (this.bot) {
            try {
                const { chatIds } = await this.getTelegramConfig();
                if (chatIds.length > 0) {
                    console.log(`[TelegramService] Sending Telegram notification: ${message.substring(0, 50)}...`);
                    for (const chatId of chatIds) {
                        this.bot.telegram.sendMessage(chatId, message).catch(err => console.error('[TelegramService] Notify failed:', err));
                    }
                } else {
                    console.warn('[TelegramService] telegram_chat_ids not configured, cannot send notification');
                }
            } catch (error: any) {
                console.error('[TelegramService] Failed to fetch chat_id for notification:', error.message);
            }
        }
    }

    private parseIdList(value?: string | null) {
        if (!value) return [];
        return value
            .split(/[\s,]+/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    private async getTelegramConfig() {
        const db = getDb();
        const rows = await db.all('SELECT key, value FROM settings WHERE key IN ("telegram_chat_id", "telegram_chat_ids", "telegram_user_ids")');
        const settings: any = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });

        const chatIds = new Set<string>([
            ...this.parseIdList(settings.telegram_chat_ids),
            ...this.parseIdList(settings.telegram_chat_id)
        ]);

        return {
            chatIds: Array.from(chatIds),
            userIds: this.parseIdList(settings.telegram_user_ids)
        };
    }
}
