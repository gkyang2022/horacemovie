import { Request, Response } from 'express';
import { getDb } from '../db/index.js';

export const getTasks = async (req: Request, res: Response) => {
    const db = getDb();
    try {
        const tasks = await db.all('SELECT * FROM tracker_tasks ORDER BY created_at DESC');
        res.json(tasks);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const createTask = async (req: Request, res: Response) => {
    const { name, keyword, interval_hours } = req.body;
    const db = getDb();
    try {
        await db.run(
            'INSERT INTO tracker_tasks (name, keyword, interval_hours) VALUES (?, ?, ?)',
            name, keyword, interval_hours || 6
        );
        res.json({ message: '追踪任务创建成功' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateTask = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, interval_hours } = req.body;
    const db = getDb();
    try {
        await db.run(
            'UPDATE tracker_tasks SET status = ?, interval_hours = ? WHERE id = ?',
            status, interval_hours, id
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
