import { Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { TrackerService } from '../services/tracker.service.js';
import { CloudStorageService } from '../services/cloud-storage.service.js';

const cloudService = CloudStorageService.getInstance();

export const getTasks = async (req: Request, res: Response) => {
    const db = getDb();
    try {
        const tasks = await db.all('SELECT * FROM tracker_tasks ORDER BY created_at DESC');
        res.json(tasks);
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
            console.error(`[TrackerController] Manual run failed for task ${id}:`, err.message);
        });
        
        res.json({ message: '任务已启动' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createTask = async (req: Request, res: Response) => {
    const { name, share_url, target_folder_id, pan_type, interval_value, interval_unit } = req.body;
    
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
        console.log(`[TrackerController] Initializing snapshot for new task: ${name}`);
        const currentFiles = await cloudService.getShareSnap('quark', cookie, share_url);
        
        if (!currentFiles || currentFiles.length === 0) {
            return res.status(400).json({ error: '无法获取分享链接内容，请检查链接是否有效或提取码是否正确' });
        }

        const lastFileIds = JSON.stringify(currentFiles.map(f => f.id));
        const now = new Date().toLocaleString('sv-SE');

        await db.run(
            'INSERT INTO tracker_tasks (name, keyword, share_url, target_folder_id, pan_type, interval_value, interval_unit, last_file_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            name, '', share_url, finalFolderId, pan_type || 'quark', interval_value || 6, interval_unit || 'hour', lastFileIds, now
        );
        res.json({ message: '追踪任务创建成功' });
    } catch (error: any) {
        console.error(`[TrackerController] Failed to create task:`, error.message);
        res.status(500).json({ error: error.message });
    }
};

export const updateTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, share_url, status, interval_value, interval_unit } = req.body;

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
        await db.run(
            'UPDATE tracker_tasks SET name = COALESCE(?, name), share_url = COALESCE(?, share_url), status = COALESCE(?, status), interval_value = COALESCE(?, interval_value), interval_unit = COALESCE(?, interval_unit) WHERE id = ?',
            name, share_url, status, interval_value, interval_unit, id
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
