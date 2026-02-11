import { Request, Response } from 'express';
import { getDb, decryptSettingValue, encryptSettingValue } from '../db/index.js';
import { TelegramService } from '../services/telegram.service.js';
import { DiscordService } from '../services/discord.service.js';
import { logger } from '../logger.js';

export const getSettings = async (req: Request, res: Response) => {
    const db = getDb();
    const rows = await db.all('SELECT key, value FROM settings');
    const settings: any = {};
    rows.forEach(row => {
        settings[row.key] = decryptSettingValue(row.key, row.value);
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
            const rawValue = String(value);
            const storedValue = encryptSettingValue(key, rawValue);
            await db.run(
                'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
                key, storedValue, storedValue
            );
        }
        const reloadTasks: Promise<any>[] = [];
        if (Object.prototype.hasOwnProperty.call(settings, 'telegram_bot_token')) {
            reloadTasks.push(TelegramService.getInstance().reload());
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'discord_bot_token')) {
            reloadTasks.push(DiscordService.getInstance().reload());
        }
        if (reloadTasks.length > 0) {
            try {
                await Promise.all(reloadTasks);
            } catch (error: any) {
                logger.error('[SettingsController] Bot reload failed', { error });
            }
        }
        res.json({ message: 'Settings updated successfully' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
