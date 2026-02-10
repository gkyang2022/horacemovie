import cron from 'node-cron';
import { getDb } from '../db/index.js';
import { CloudStorageService } from './cloud-storage.service.js';
import { TelegramService } from './telegram.service.js';
import { DiscordService } from './discord.service.js';

const cloudService = CloudStorageService.getInstance();

export class TrackerService {
    private static instance: TrackerService;
    private scheduleTask: ReturnType<typeof cron.schedule> | null = null;

    private constructor() {
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
    }

    private startSchedule() {
        console.log('[TrackerService] Starting resource tracking scheduler...');
        if (this.scheduleTask) {
            this.scheduleTask.stop();
        }
        // 每分钟检查一次任务，而不是每小时
        this.scheduleTask = cron.schedule('* * * * *', () => {
            void this.checkAllTasks().catch((err: any) => {
                console.error('[TrackerService] Tracker scheduler tick failed:', err?.message || err);
            });
        });
        console.log('[TrackerService] Tracker scheduler started (running every minute)');
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
                let intervalMs = (task.interval_value || 6) * 60 * 60 * 1000;
                const unit = task.interval_unit || 'hour';
                
                if (unit === 'minute') {
                    intervalMs = (task.interval_value || 30) * 60 * 1000;
                } else if (unit === 'day') {
                    intervalMs = (task.interval_value || 1) * 24 * 60 * 60 * 1000;
                } else if (unit === 'month') {
                    intervalMs = (task.interval_value || 1) * 30 * 24 * 60 * 60 * 1000;
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
        const updateRun = async (status: 'success' | 'failed' | 'skipped', message: string) => {
            const now = new Date().toLocaleString('sv-SE');
            await db.run(
                'UPDATE tracker_tasks SET last_run_at = ?, last_run_status = ?, last_run_message = ? WHERE id = ?',
                now,
                status,
                message,
                task.id
            );
        };

        if (!task.share_url) {
            console.warn(`[TrackerService] Task ${task.name} skipped: No share_url found`);
            await updateRun('failed', '分享链接为空');
            return;
        }

        try {
            // 获取网盘配置和同步设置
            const settingsRows = await db.all('SELECT key, value FROM settings WHERE key IN ("cookie_quark", "openlist_path_quark", "openlist_default_path")');
            const settings: any = {};
            settingsRows.forEach(row => {
                settings[row.key] = row.value;
            });

            // --- 链接追踪模式 ---
            // 确定网盘类型、Cookie 和目标文件夹
            let type = task.pan_type || 'quark';
            const cookie = type === 'quark' ? settings.cookie_quark : null;
            const targetFolderId = task.target_folder_id;

            if (!cookie) {
                console.warn(`[TrackerService] Task ${task.name} skipped: No cookie found for ${type}`);
                await updateRun('failed', `未配置${type} Cookie`);
                return;
            }

            if (!targetFolderId) {
                console.warn(`[TrackerService] Task ${task.name} skipped: No target_folder_id found in task record`);
                await updateRun('failed', '未配置目标目录');
                return;
            }

            // 获取当前分享内容的快照
            console.log(`[TrackerService] Checking share snapshot for task: ${task.name}`);
            const currentFiles = await cloudService.getShareSnap(type as 'quark', cookie, task.share_url);
            if (currentFiles.length === 0) {
                console.log(`[TrackerService] No files found in share link for task: ${task.name}`);
                await updateRun('failed', '分享链接无内容或无法访问');
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
                    
                    // 过滤掉那些父目录也是新文件的项，避免重复转存（转存父目录会自动包含子项）
                    const topLevelNewFiles = newFiles.filter(file => {
                        // 如果父目录 ID 就在新文件列表中，说明当前文件会被其父目录的转存动作带走
                        return !newFiles.some(potentialParent => potentialParent.id === file.pid);
                    });

                    console.log(`[TrackerService] Top-level new items to transfer: ${topLevelNewFiles.length}`);
                    
                    // 执行转存 - 仅转存顶级新发现的项目
                    const transferRes = await cloudService.saveToQuark(cookie, task.share_url, targetFolderId, topLevelNewFiles);

                    if (transferRes.success) {
                        console.log(`[TrackerService] Successfully transferred new items for: ${task.name}`);
                        
                        // 更新已转存文件 ID 列表
                        const updatedIds = [...new Set([...lastFileIds, ...currentFiles.map(f => f.id)])];
                        await db.run('UPDATE tracker_tasks SET last_file_ids = ? WHERE id = ?', JSON.stringify(updatedIds), task.id);
                        
                        // 自动同步 OpenList (如果配置了)
                        const openlistPathKey = 'openlist_path_quark';
                        const openlistSourcePath = settings[openlistPathKey];
                        const openlistDefaultPath = settings['openlist_default_path'];

                        if (openlistSourcePath) {
                            console.log(`[TrackerService] Triggering auto-sync for ${task.name}`);
                            const openlistService = (await import('./openlist.service.js')).OpenListService.getInstance();
                            void openlistService.copyFile(openlistSourcePath, transferRes.names || [], openlistDefaultPath)
                                .catch(err => console.error(`[TrackerService] Auto-sync error:`, err.message));
                        }

                        await TelegramService.getInstance().notify(`追剧成功: ${task.name} 发现 ${newFiles.length} 个新内容，已转存到 ${type}`);
                        await DiscordService.getInstance().notify(`追剧成功: ${task.name} 发现 ${newFiles.length} 个新内容，已转存到 ${type}`);
                        const successMessage = transferRes.message
                            ? `${transferRes.message}，共${topLevelNewFiles.length}项`
                            : `已转存${topLevelNewFiles.length}项`;
                        await updateRun('success', successMessage);
                    } else {
                        console.warn(`[TrackerService] Transfer failed for ${task.name}: ${transferRes.message}`);
                        await updateRun('failed', transferRes.message || '转存失败');
                    }
                } else {
                    console.log(`[TrackerService] No new items for task: ${task.name}`);
                    await updateRun('success', '无新内容');
                }
            }
        } catch (error: any) {
            console.error(`[TrackerService] Task ${task.name} failed:`, error.message);
            await updateRun('failed', error.message || '运行失败');
        }
    }
}
