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

                // 帮助命令
                this.bot.help((ctx) => ctx.reply('HoraceMovie Bot 命令:\n/search <关键词> - 搜索网盘资源\n/help - 显示此帮助'));

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
                
                // 计算间隔时间（毫秒）
                let intervalMs = (task.interval_hours || 6) * 60 * 60 * 1000;
                const unit = task.interval_unit || 'hour';
                
                if (unit === 'minute') {
                    intervalMs = (task.interval_hours || 30) * 60 * 1000;
                } else if (unit === 'day') {
                    intervalMs = (task.interval_hours || 1) * 24 * 60 * 60 * 1000;
                } else if (unit === 'month') {
                    intervalMs = (task.interval_hours || 1) * 30 * 24 * 60 * 60 * 1000;
                }

                if (now.getTime() - lastRun.getTime() >= intervalMs) {
                    console.log(`[TrackerService] Executing task: "${task.name}"`);
                    await this.executeTask(task);
                }
            }
        } catch (error: any) {
            console.error('[TrackerService] Error during scheduled tasks check:', error.message);
        }
    }

    async executeTask(task: any) {
        console.log(`[TrackerService] Executing task logic for: ${task.name} (link-tracking)`);
        const db = getDb();

        if (!task.share_url) {
            console.warn(`[TrackerService] Task ${task.name} skipped: No share_url found`);
            return;
        }

        try {
            // 获取默认网盘配置
            const settingsRows = await db.all('SELECT key, value FROM settings WHERE key IN ("cookie_quark", "folder_id_quark", "cookie_115", "folder_id_115", "openlist_path_115", "openlist_path_quark", "openlist_default_path")');
            const settings: any = {};
            settingsRows.forEach(row => {
                settings[row.key] = row.value;
            });

            // --- 链接追踪模式 ---
            // 确定网盘类型、Cookie 和目标文件夹
            let type = task.pan_type;
            if (!type) {
                if (task.share_url.includes('115.com')) type = '115';
                else if (task.share_url.includes('quark.cn')) type = 'quark';
            }
            
            const cookie = type === '115' ? settings.cookie_115 : settings.cookie_quark;
            const targetFolderId = task.target_folder_id || (type === '115' ? settings.folder_id_115 : settings.folder_id_quark) || '0';

            if (!type || !cookie) {
                console.warn(`[TrackerService] Task ${task.name} skipped: No cloud account or type configured for ${type}`);
                return;
            }

            // 获取当前分享内容的快照
            const currentFiles = await cloudService.getShareSnap(type as '115' | 'quark', cookie, task.share_url);
            if (currentFiles.length === 0) {
                console.log(`[TrackerService] No files found in share link for task: ${task.name}`);
            } else {
                let lastFileIds: string[] = [];
                try {
                    lastFileIds = JSON.parse(task.last_file_ids || '[]');
                } catch (e) {
                    lastFileIds = [];
                }

                const newFiles = currentFiles.filter(f => !lastFileIds.includes(f.id));

                if (newFiles.length > 0) {
                    console.log(`[TrackerService] Found ${newFiles.length} new items for task: ${task.name}`);
                    
                    // 执行转存
                    const transferRes = type === '115' 
                        ? await cloudService.saveTo115(cookie, task.share_url, targetFolderId)
                        : await cloudService.saveToQuark(cookie, task.share_url, targetFolderId);

                    if (transferRes.success) {
                        console.log(`[TrackerService] Successfully transferred new items for: ${task.name}`);
                        
                        // 更新已转存文件 ID 列表
                        const updatedIds = [...new Set([...lastFileIds, ...currentFiles.map(f => f.id)])];
                        await db.run('UPDATE tracker_tasks SET last_file_ids = ? WHERE id = ?', JSON.stringify(updatedIds), task.id);
                        
                        // 自动同步 OpenList (如果配置了)
                        const openlistPathKey = type === '115' ? 'openlist_path_115' : 'openlist_path_quark';
                        const openlistSourcePath = settings[openlistPathKey];
                        const openlistDefaultPath = settings['openlist_default_path'];

                        if (openlistSourcePath) {
                            console.log(`[TrackerService] Triggering auto-sync for ${task.name}`);
                            const openlistService = (await import('./openlist.service.js')).OpenListService.getInstance();
                            void openlistService.copyFile(openlistSourcePath, transferRes.names || [], openlistDefaultPath)
                                .catch(err => console.error(`[TrackerService] Auto-sync error:`, err.message));
                        }

                        this.notify(`[HoraceMovie] 追剧成功: ${task.name} 发现 ${newFiles.length} 个新内容，已转存到 ${type}`);
                    } else {
                        console.warn(`[TrackerService] Transfer failed for ${task.name}: ${transferRes.message}`);
                    }
                } else {
                    console.log(`[TrackerService] No new items for task: ${task.name}`);
                }
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
