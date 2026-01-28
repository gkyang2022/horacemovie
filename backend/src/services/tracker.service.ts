import cron from 'node-cron';
import { getDb } from '../db/index.js';
import { PansouService } from './pansou.service.js';
import { CloudStorageService } from './cloud-storage.service.js';
import { Telegraf } from 'telegraf';

const pansouService = PansouService.getInstance();
const cloudService = CloudStorageService.getInstance();

export class TrackerService {
    private static instance: TrackerService;
    private bot: Telegraf | null = null;
    private scheduleTask: ReturnType<typeof cron.schedule> | null = null;

    private constructor() {
        this.initBot();
        this.startSchedule();
    }

    public static getInstance(): TrackerService {
        if (!TrackerService.instance) {
            TrackerService.instance = new TrackerService();
        }
        return TrackerService.instance;
    }

    public async stop() {
        if (this.scheduleTask) {
            console.log('[TrackerService] Stopping scheduler task...');
            this.scheduleTask.stop();
            this.scheduleTask = null;
        }
        if (this.bot) {
            console.log('[TrackerService] Stopping Telegram Bot...');
            await this.bot.stop();
            this.bot = null;
            console.log('[TrackerService] Telegram Bot stopped');
        }
    }

    private async initBot() {
        const db = getDb();
        try {
            const token = await db.get('SELECT value FROM settings WHERE key = ?', 'telegram_bot_token');
            if (token && token.value) {
                console.log('[TrackerService] Initializing Telegram Bot with token from DB');
                this.bot = new Telegraf(token.value);
                
                // 搜索命令: /search keyword
                this.bot.command('search', async (ctx) => {
                    const keyword = ctx.message.text.split(' ').slice(1).join(' ');
                    if (!keyword) return ctx.reply('请输入搜索关键词, 例如: /search 肖申克的救赎');
                    
                    console.log(`[TrackerService] Bot received /search command for: "${keyword}"`);
                    ctx.reply(`正在搜索: ${keyword}...`);
                    try {
                        const results = await pansouService.search(keyword);
                        console.log(`[TrackerService] Bot search for "${keyword}" returned ${results.length} results`);
                        if (results.length === 0) return ctx.reply('未找到相关资源');
                        
                        let msg = `找到以下资源:\n`;
                        results.slice(0, 10).forEach((res, i) => {
                            msg += `${i + 1}. ${res.name}\n🔗 ${res.url}\n\n`;
                        });
                        ctx.reply(msg);
                    } catch (e: any) {
                        console.error(`[TrackerService] Bot search error for "${keyword}":`, e.message);
                        ctx.reply(`搜索出错: ${e.message}`);
                    }
                });

                // 追踪命令: /track keyword
                this.bot.command('track', async (ctx) => {
                    const keyword = ctx.message.text.split(' ').slice(1).join(' ');
                    if (!keyword) return ctx.reply('请输入追踪关键词, 例如: /track 凡人修仙传');
                    
                    console.log(`[TrackerService] Bot received /track command for: "${keyword}"`);
                    try {
                        await db.run(
                            'INSERT INTO tracker_tasks (name, keyword) VALUES (?, ?)',
                            keyword, keyword
                        );
                        console.log(`[TrackerService] Successfully added tracking task for: "${keyword}"`);
                        ctx.reply(`已开启追踪: ${keyword}`);
                    } catch (e: any) {
                        console.error(`[TrackerService] Bot track error for "${keyword}":`, e.message);
                        ctx.reply(`开启追踪失败: ${e.message}`);
                    }
                });

                // 帮助命令
                this.bot.help((ctx) => ctx.reply('HoraceMovie Bot 命令:\n/search <关键词> - 搜索网盘资源\n/track <关键词> - 开启资源追踪\n/help - 显示此帮助'));

                // Disable telegraf signal handling to avoid conflict with tsx/manual handlers
                (this.bot.launch as any)({
                    handleSignals: false
                }).catch((err: any) => console.error('[TrackerService] TG Bot launch failed:', err));
                console.log('[TrackerService] Telegram Bot initialized and launched');
            } else {
                console.log('[TrackerService] No Telegram Bot token found in settings, bot will not start');
            }
        } catch (error: any) {
            console.error('[TrackerService] Failed to initialize bot:', error.message);
        }
    }

    private startSchedule() {
        console.log('[TrackerService] Starting resource tracking scheduler...');
        if (this.scheduleTask) {
            this.scheduleTask.stop();
        }
        this.scheduleTask = cron.schedule('0 * * * *', () => {
            console.log('[TrackerService] Running scheduled task check...');
            void this.checkAllTasks().catch((err: any) => {
                console.error('[TrackerService] Tracker scheduler tick failed:', err?.message || err);
            });
        });
        console.log('[TrackerService] Tracker scheduler started (running every hour)');
    }

    async checkAllTasks() {
        const db = getDb();
        try {
            const now = new Date();
            const tasks = await db.all('SELECT * FROM tracker_tasks WHERE status = "active"');
            console.log(`[TrackerService] Checking ${tasks.length} active tracking tasks`);

            for (const task of tasks) {
                const lastRun = task.last_run_at ? new Date(task.last_run_at) : new Date(0);
                const intervalMs = (task.interval_hours || 6) * 60 * 60 * 1000;

                if (now.getTime() - lastRun.getTime() >= intervalMs) {
                    console.log(`[TrackerService] Executing task: "${task.keyword}"`);
                    await this.executeTask(task);
                }
            }
        } catch (error: any) {
            console.error('[TrackerService] Error during scheduled tasks check:', error.message);
        }
    }

    async executeTask(task: any) {
        console.log(`[TrackerService] Executing task logic for: ${task.name} (${task.keyword})`);
        const db = getDb();

        try {
            // 1. 搜索资源
            const results = await pansouService.search(task.keyword);
            
            // 2. 获取已转存历史 (简单对比文件名)
            const history = await db.all('SELECT media_name FROM sync_logs WHERE media_name LIKE ?', `%${task.keyword}%`);
            const historyNames = history.map(h => h.media_name);

            // 3. 找出未转存的新资源
            const newResources = results.filter(r => !historyNames.includes(r.name));

            if (newResources.length > 0) {
                console.log(`[TrackerService] Found ${newResources.length} new resources for task: ${task.name}`);
                
                // 获取默认网盘账号
                const account = await db.get('SELECT type, cookie FROM cloud_accounts ORDER BY updated_at DESC LIMIT 1');
                
                if (account) {
                    for (const res of newResources) {
                        console.log(`[TrackerService] Auto-transferring: ${res.name} to ${account.type}`);
                        // 自动转存第一个匹配项（或者根据过滤规则）
                        const transferRes = account.type === '115' 
                            ? await cloudService.saveTo115(account.cookie, res.url)
                            : await cloudService.saveToQuark(account.cookie, res.url);

                        if (transferRes.success) {
                            await db.run(
                                'INSERT INTO sync_logs (media_name, source_url, status) VALUES (?, ?, ?)',
                                res.name, res.url, 'auto_transferred'
                            );
                            console.log(`[TrackerService] Successfully auto-transferred: ${res.name}`);
                            this.notify(`[HoraceMovie] 追剧成功: ${res.name} 已自动转存到 ${account.type}`);
                        } else {
                            console.warn(`[TrackerService] Auto-transfer failed for ${res.name}: ${transferRes.message}`);
                        }
                    }
                } else {
                    console.warn('[TrackerService] No cloud account configured for auto-transfer');
                }
            } else {
                console.log(`[TrackerService] No new resources found for task: ${task.name}`);
            }

            // 更新最后运行时间
            await db.run('UPDATE tracker_tasks SET last_run_at = ? WHERE id = ?', new Date().toISOString(), task.id);
        } catch (error: any) {
            console.error(`[TrackerService] Task ${task.name} failed:`, error.message);
        }
    }

    private async notify(message: string) {
        if (this.bot) {
            const db = getDb();
            try {
                const chatId = await db.get('SELECT value FROM settings WHERE key = ?', 'telegram_chat_id');
                if (chatId && chatId.value) {
                    console.log(`[TrackerService] Sending Telegram notification: ${message.substring(0, 50)}...`);
                    this.bot.telegram.sendMessage(chatId.value, message).catch(err => console.error('[TrackerService] Notify failed:', err));
                } else {
                    console.warn('[TrackerService] telegram_chat_id not configured, cannot send notification');
                }
            } catch (error: any) {
                console.error('[TrackerService] Failed to fetch chat_id for notification:', error.message);
            }
        }
    }
}
