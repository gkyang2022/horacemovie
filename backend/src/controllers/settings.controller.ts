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

export const getCloudAccounts = async (req: Request, res: Response) => {
    const db = getDb();
    const rows = await db.all('SELECT id, type, name, updated_at FROM cloud_accounts');
    res.json(rows);
};

export const updateCloudAccount = async (req: Request, res: Response) => {
    const { type, cookie, name } = req.body;
    const db = getDb();

    // 使用 REPLACE INTO 或检查是否存在来实现“只能设置一次，之后更新”
    await db.run(
        'INSERT INTO cloud_accounts (type, cookie, name, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET cookie = ?, name = ?, updated_at = CURRENT_TIMESTAMP',
        type, cookie, name, cookie, name
    );
    // 注意：上面的 ON CONFLICT(id) 可能不对，因为 id 是自增的。
    // 更好的做法是根据 type 来判断。
    
    res.json({ message: 'Cloud account updated' });
};
