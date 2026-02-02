import { Request, Response } from 'express';
import { getDb } from '../db/index.js';

export const getSettings = async (req: Request, res: Response) => {
    const db = getDb();
    const rows = await db.all('SELECT key, value FROM settings');
    const settings: any = {};
    rows.forEach(row => {
        settings[row.key] = row.value;
    });
    res.json(settings);
};

export const updateSettings = async (req: Request, res: Response) => {
    const settings = req.body;
    const db = getDb();

    try {
        for (const [key, value] of Object.entries(settings)) {
            // 如果 value 是 undefined 或 null，跳过
            if (value === undefined || value === null) continue;
            
            await db.run(
                'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
                key, String(value), String(value)
            );
        }
        res.json({ message: 'Settings updated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
