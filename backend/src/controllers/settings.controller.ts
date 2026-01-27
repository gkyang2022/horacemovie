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

    for (const [key, value] of Object.entries(settings)) {
        await db.run(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
            key, value, value
        );
    }

    res.json({ message: 'Settings updated successfully' });
};

export const getCloudAccounts = async (req: Request, res: Response) => {
    const db = getDb();
    const rows = await db.all('SELECT id, type, name, updated_at FROM cloud_accounts');
    res.json(rows);
};

export const updateCloudAccount = async (req: Request, res: Response) => {
    const { type, cookie, name } = req.body;
    const db = getDb();

    await db.run(
        'INSERT INTO cloud_accounts (type, cookie, name, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        type, cookie, name
    );

    res.json({ message: 'Cloud account updated' });
};
