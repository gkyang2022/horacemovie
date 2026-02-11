import cron from 'node-cron';
import { getDb, decryptSettingValue } from '../db/index.js';
import { CloudStorageService } from './cloud-storage.service.js';
import { TelegramService } from './telegram.service.js';
import { DiscordService } from './discord.service.js';
import { logger } from '../logger.js';

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
            logger.info('[TrackerService] Stopping scheduler task');
            this.scheduleTask.stop();
            this.scheduleTask = null;
        }
    }

    private startSchedule() {
        logger.info('[TrackerService] Starting resource tracking scheduler');
        if (this.scheduleTask) {
            this.scheduleTask.stop();
        }
        // 每10分钟检查一次任务
        this.scheduleTask = cron.schedule('*/10 * * * *', () => {
            void this.checkAllTasks().catch((err: any) => {
                logger.error('[TrackerService] Tracker scheduler tick failed', { error: err });
            });
        });
        logger.info('[TrackerService] Tracker scheduler started (running every 10 minutes)');
    }

    async checkAllTasks() {
        const db = getDb();
        try {
            const now = new Date();
            const tasks = await db.all('SELECT * FROM tracker_tasks WHERE status = "active"');
            logger.debug('[TrackerService] Checking active tracking tasks', { count: tasks.length });

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
                    logger.info('[TrackerService] Executing task', { taskName: task.name });
                    await this.executeTask(task);
                }
            }
        } catch (error: any) {
            logger.error('[TrackerService] Error during scheduled tasks check', { error });
        }
    }

    async executeTask(task: any) {
        logger.info('[TrackerService] Executing task logic', { taskName: task.name, mode: 'link-tracking' });
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
            logger.warn('[TrackerService] Task skipped: No share_url found', { taskName: task.name });
            await updateRun('failed', '分享链接为空');
            return;
        }

        try {
            // 获取网盘配置和同步设置
            const settingsRows = await db.all('SELECT key, value FROM settings WHERE key IN ("cookie_quark", "openlist_path_quark", "openlist_default_path")');
            const settings: any = {};
            settingsRows.forEach(row => {
                settings[row.key] = decryptSettingValue(row.key, row.value);
            });

            // --- 链接追踪模式 ---
            // 确定网盘类型、Cookie 和目标文件夹
            let type = task.pan_type || 'quark';
            const cookie = type === 'quark' ? settings.cookie_quark : null;
            const targetFolderId = task.target_folder_id;

            if (!cookie) {
                logger.warn('[TrackerService] Task skipped: No cookie found', { taskName: task.name, type });
                await updateRun('failed', `未配置${type} Cookie`);
                return;
            }

            if (!targetFolderId) {
                logger.warn('[TrackerService] Task skipped: No target folder found', { taskName: task.name });
                await updateRun('failed', '未配置目标目录');
                return;
            }

            // 获取当前分享内容的快照
            logger.debug('[TrackerService] Checking share snapshot', { taskName: task.name });
            const currentFiles = await cloudService.getShareSnap(type as 'quark', cookie, task.share_url);
            if (currentFiles.length === 0) {
                logger.warn('[TrackerService] Share link has no files', { taskName: task.name });
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
                    logger.info('[TrackerService] Found new items', { taskName: task.name, count: newFiles.length });
                    
                    // 过滤掉那些父目录也是新文件的项，避免重复转存（转存父目录会自动包含子项）
                    const topLevelNewFiles = newFiles.filter(file => {
                        // 如果父目录 ID 就在新文件列表中，说明当前文件会被其父目录的转存动作带走
                        return !newFiles.some(potentialParent => potentialParent.id === file.pid);
                    });

                    logger.debug('[TrackerService] Top-level new items to transfer', { taskName: task.name, count: topLevelNewFiles.length });
                    
                    // 执行转存 - 仅转存顶级新发现的项目
                    const transferRes = await cloudService.saveToQuark(cookie, task.share_url, targetFolderId, topLevelNewFiles);

                    if (transferRes.success) {
                        logger.info('[TrackerService] Transfer completed', { taskName: task.name, count: topLevelNewFiles.length });
                        
                        // 更新已转存文件 ID 列表
                        const updatedIds = [...new Set([...lastFileIds, ...currentFiles.map(f => f.id)])];
                        await db.run('UPDATE tracker_tasks SET last_file_ids = ? WHERE id = ?', JSON.stringify(updatedIds), task.id);
                        
                        // 自动同步 OpenList (如果配置了)
                        const openlistPathKey = 'openlist_path_quark';
                        const openlistSourcePath = settings[openlistPathKey];
                        const openlistDefaultPath = settings['openlist_default_path'];

                        if (openlistSourcePath) {
                            logger.info('[TrackerService] Triggering auto-sync', { taskName: task.name });
                            const openlistService = (await import('./openlist.service.js')).OpenListService.getInstance();
                            void openlistService.copyFile(openlistSourcePath, transferRes.names || [], openlistDefaultPath)
                                .catch(err => logger.error('[TrackerService] Auto-sync error', { error: err }));
                        }

                        await TelegramService.getInstance().notify(`追剧成功: ${task.name} 发现 ${newFiles.length} 个新内容，已转存到 ${type}`);
                        await DiscordService.getInstance().notify(`追剧成功: ${task.name} 发现 ${newFiles.length} 个新内容，已转存到 ${type}`);
                        const successMessage = transferRes.message
                            ? `${transferRes.message}，共${topLevelNewFiles.length}项`
                            : `已转存${topLevelNewFiles.length}项`;
                        await updateRun('success', successMessage);
                    } else {
                        logger.warn('[TrackerService] Transfer failed', { taskName: task.name, message: transferRes.message });
                        await updateRun('failed', transferRes.message || '转存失败');
                    }
                } else {
                    logger.debug('[TrackerService] No new items for task', { taskName: task.name });
                    await updateRun('success', '无新内容');
                }
            }
        } catch (error: any) {
            logger.error('[TrackerService] Task failed', { taskName: task.name, error });
            await updateRun('failed', error.message || '运行失败');
        }
    }
}
