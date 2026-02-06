import { Telegraf } from 'telegraf';
import { getDb } from '../db/index.js';
import { PansouService } from './pansou.service.js';

const pansouService = PansouService.getInstance();

export class TelegramService {
    private static instance: TelegramService;
    private bot: Telegraf | null = null;
    private initialized = false;

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

                this.bot.command('search', async (ctx) => {
                    const { userIds } = await this.getTelegramConfig();
                    const requesterId = String(ctx.from?.id || '');
                    if (userIds.length > 0 && !userIds.includes(requesterId)) {
                        return ctx.reply('无权限使用该命令');
                    }

                    const keyword = ctx.message.text.split(' ').slice(1).join(' ');
                    if (!keyword) return ctx.reply('请输入搜索关键词, 例如: /search 肖申克的救赎');
                    
                    console.log(`[TelegramService] Bot received /search command for: "${keyword}"`);
                    ctx.reply(`正在搜索: ${keyword}...`);
                    try {
                        const results = await pansouService.search(keyword);
                        console.log(`[TelegramService] Bot search for "${keyword}" returned ${results.length} results`);
                        if (results.length === 0) return ctx.reply('未找到相关资源');
                        
                        let msg = `找到以下资源:\n`;
                        results.slice(0, 10).forEach((res, i) => {
                            msg += `${i + 1}. ${res.name}\n🔗 ${res.url}\n\n`;
                        });
                        ctx.reply(msg);
                    } catch (e: any) {
                        console.error(`[TelegramService] Bot search error for "${keyword}":`, e.message);
                        ctx.reply(`搜索出错: ${e.message}`);
                    }
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
