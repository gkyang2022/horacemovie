import { Telegraf } from 'telegraf';
import { getDb } from '../db/index.js';
import { PansouService } from './pansou.service.js';

const pansouService = PansouService.getInstance();

export class TelegramService {
    private static instance: TelegramService;
    private bot: Telegraf | null = null;
    private initialized = false;
    private botUsername: string | null = null;

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
                    return next();
                });

                this.bot.command('search', async (ctx) => {
                    if (!(await this.isAuthorized(ctx))) {
                        return ctx.reply('无权限使用该命令');
                    }

                    const keyword = ctx.message.text.split(' ').slice(1).join(' ');
                    await this.replySearch(ctx, keyword);
                });

                this.bot.on('inline_query', async (ctx) => {
                    const { userIds } = await this.getTelegramConfig();
                    const requesterId = String(ctx.from?.id || '');
                    if (userIds.length > 0 && !userIds.includes(requesterId)) {
                        return ctx.answerInlineQuery([], { cache_time: 0, is_personal: true });
                    }
                    const keyword = (ctx.inlineQuery?.query || '').trim();
                    if (!keyword) {
                        return ctx.answerInlineQuery([], { cache_time: 0, is_personal: true });
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
                        return ctx.answerInlineQuery(items, { cache_time: 5, is_personal: true });
                    } catch (e: any) {
                        console.error(`[TelegramService] Inline search error for "${keyword}":`, e.message);
                        return ctx.answerInlineQuery([], { cache_time: 0, is_personal: true });
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
            const selected = this.pickTopResults(results, 10);
            if (selected.length === 0) {
                await cleanup();
                return ctx.reply('未找到相关资源');
            }
            
            let msg = `找到以下资源:\n`;
            selected.forEach((res, i) => {
                msg += `${i + 1}. ${this.truncateTitle(res.name)}\n🔗 ${res.url}\n\n`;
            });
            await cleanup();
            ctx.reply(msg);
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
