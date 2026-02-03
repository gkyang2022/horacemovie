import { Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { TrackerService } from '../services/tracker.service.js';

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
    const { name, share_url, target_folder_id, target_folder_name, pan_type, interval_hours, interval_unit } = req.body;
    const db = getDb();
    try {
        await db.run(
            'INSERT INTO tracker_tasks (name, keyword, share_url, target_folder_id, target_folder_name, pan_type, interval_hours, interval_unit, last_file_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            name, '', share_url, target_folder_id, target_folder_name, pan_type, interval_hours || 6, interval_unit || 'hour', '[]'
        );
        res.json({ message: '追踪任务创建成功' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, interval_hours, interval_unit } = req.body;
    const db = getDb();
    try {
        await db.run(
            'UPDATE tracker_tasks SET status = ?, interval_hours = ?, interval_unit = ? WHERE id = ?',
            status, interval_hours, interval_unit, id
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
