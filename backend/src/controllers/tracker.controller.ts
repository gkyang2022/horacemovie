import { Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { TrackerService } from '../services/tracker.service.js';
import { CloudStorageService } from '../services/cloud-storage.service.js';
import { logger } from '../logger.js';

const cloudService = CloudStorageService.getInstance();

const resolvePanType = (shareUrl: string, panType?: string) => {
    if (shareUrl.includes('quark.cn')) return 'quark';
    if (shareUrl.includes('115cdn.com') || shareUrl.includes('115.com') || shareUrl.includes('anxia.com')) return '115';
    return panType || 'quark';
};

const extractShareCode = (shareUrl: string) => {
    const match = shareUrl.match(/\/s\/([a-zA-Z0-9]+)/);
    if (match) return match[1];
    const shareIdMatch = shareUrl.match(/[?&]share_id=([a-zA-Z0-9]+)/);
    if (shareIdMatch) return shareIdMatch[1];
    const shareCodeMatch = shareUrl.match(/[?&]share_code=([a-zA-Z0-9]+)/);
    if (shareCodeMatch) return shareCodeMatch[1];
    return '';
};

const buildTrackerName = (shareUrl: string, panType?: string) => {
    const resolvedType = resolvePanType(shareUrl, panType);
    const shareCode = extractShareCode(shareUrl);
    return `${resolvedType}-${shareCode || 'unknown'}`;
};

export const getTasks = async (req: Request, res: Response) => {
    const db = getDb();
    try {
        const tasks = await db.all('SELECT * FROM tracker_tasks ORDER BY created_at DESC');
        const updates: Array<{ id: number; name: string }> = [];
        const normalizedTasks = tasks.map((task: any) => {
            const shareUrl = task.share_url || '';
            const nextName = buildTrackerName(shareUrl, task.pan_type);
            if (nextName && nextName !== task.name) {
                updates.push({ id: task.id, name: nextName });
                return { ...task, name: nextName };
            }
            return task;
        });
        if (updates.length > 0) {
            await Promise.all(updates.map(item => db.run('UPDATE tracker_tasks SET name = ? WHERE id = ?', item.name, item.id)));
        }
        res.json(normalizedTasks);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const runTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDb();
    try {
        const task = await db.get('SELECT * FROM tracker_tasks WHERE id = ?', id);
        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }
        
        const trackerService = TrackerService.getInstance();
        // 异步运行，不阻塞响应
        void trackerService.executeTask(task).catch(err => {
            logger.error('[TrackerController] Manual run failed', {
                requestId: (req as any).requestId,
                taskId: id,
                error: err
            });
        });
        
        res.json({ message: '任务已启动' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createTask = async (req: Request, res: Response) => {
    const { share_url, target_folder_id, pan_type, interval_value, interval_unit } = req.body;
    
    // 验证网盘类型
    if (share_url.includes('115.com')) {
        return res.status(400).json({ error: '115网盘不支持追剧功能（链接为快照形式，无法检测更新）' });
    }
    if (!share_url.includes('quark.cn')) {
        return res.status(400).json({ error: '目前追剧功能仅支持夸克网盘' });
    }

    const db = getDb();
    try {
        // 获取设置以填充默认文件夹和 Cookie
        const settingsRows = await db.all('SELECT key, value FROM settings WHERE key IN ("cookie_quark", "folder_id_quark")');
        const settings: any = {};
        settingsRows.forEach(row => {
            settings[row.key] = row.value;
        });

        const cookie = settings.cookie_quark;
        const finalFolderId = target_folder_id || settings.folder_id_quark;

        if (!cookie) {
            return res.status(400).json({ error: '未配置夸克 Cookie，无法创建任务' });
        }
        if (!finalFolderId) {
            return res.status(400).json({ error: '未配置默认转存目录，且未指定目标目录，无法创建任务' });
        }

        // 初始化快照：获取当前分享内容的文件 ID 列表，确保只追新剧
        const taskName = buildTrackerName(share_url, pan_type);
        logger.info('[TrackerController] Initializing snapshot for new task', {
            requestId: (req as any).requestId,
            taskName
        });
        const currentFiles = await cloudService.getShareSnap('quark', cookie, share_url);
        
        if (!currentFiles || currentFiles.length === 0) {
            return res.status(400).json({ error: '无法获取分享链接内容，请检查链接是否有效或提取码是否正确' });
        }

        const lastFileIds = JSON.stringify(currentFiles.map(f => f.id));
        const now = new Date().toLocaleString('sv-SE');

        await db.run(
            'INSERT INTO tracker_tasks (name, keyword, share_url, target_folder_id, pan_type, interval_value, interval_unit, last_file_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            taskName, '', share_url, finalFolderId, pan_type || 'quark', interval_value || 6, interval_unit || 'hour', lastFileIds, now
        );
        res.json({ message: '追踪任务创建成功' });
    } catch (error: any) {
        logger.error('[TrackerController] Failed to create task', {
            requestId: (req as any).requestId,
            error
        });
        res.status(500).json({ error: error.message });
    }
};

export const updateTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { share_url, status, interval_value, interval_unit } = req.body;

    // 验证网盘类型 (如果提供了新 URL)
    if (share_url) {
        if (share_url.includes('115.com')) {
            return res.status(400).json({ error: '115网盘不支持追剧功能（链接为快照形式，无法检测更新）' });
        }
        if (!share_url.includes('quark.cn')) {
            return res.status(400).json({ error: '目前追剧功能仅支持夸克网盘' });
        }
    }

    const db = getDb();
    try {
        const existing = await db.get('SELECT share_url, pan_type FROM tracker_tasks WHERE id = ?', id);
        if (!existing) {
            return res.status(404).json({ error: '任务不存在' });
        }
        const nextShareUrl = share_url || existing.share_url || '';
        const nextPanType = resolvePanType(nextShareUrl, existing.pan_type);
        const taskName = buildTrackerName(nextShareUrl, nextPanType);
        await db.run(
            'UPDATE tracker_tasks SET name = ?, share_url = COALESCE(?, share_url), status = COALESCE(?, status), interval_value = COALESCE(?, interval_value), interval_unit = COALESCE(?, interval_unit) WHERE id = ?',
            taskName, share_url, status, interval_value, interval_unit, id
        );
        res.json({ message: '任务更新成功' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getDb();
    try {
        await db.run('DELETE FROM tracker_tasks WHERE id = ?', id);
        res.json({ message: '任务已删除' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
