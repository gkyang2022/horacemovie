import { Request, Response } from 'express';
import { CloudStorageService } from '../services/cloud-storage.service.js';
import { OpenListService } from '../services/openlist.service.js';
import { getDb } from '../db/index.js';

const cloudService = CloudStorageService.getInstance();
const openlistService = OpenListService.getInstance();

export const transferAndSync = async (req: Request, res: Response) => {
    const { shareUrl, type, mediaName } = req.body; // type: '115' or 'quark'
    const db = getDb();

    try {
        // 1. 获取网盘 Cookie 和 目标文件夹 ID
        const cookieKey = type === '115' ? 'cookie_115' : 'cookie_quark';
        const folderKey = type === '115' ? 'folder_id_115' : 'folder_id_quark';
        
        const settingsRows = await db.all('SELECT key, value FROM settings WHERE key IN (?, ?)', [cookieKey, folderKey]);
        const settings: any = {};
        settingsRows.forEach(row => {
            settings[row.key] = row.value;
        });

        const cookie = settings[cookieKey];
        const targetFolderId = settings[folderKey] || '0';

        if (!cookie) {
            return res.status(400).json({ error: `未配置 ${type} 网盘 Cookie` });
        }

        let result;
        if (type === '115') {
            result = await cloudService.saveTo115(cookie, shareUrl, targetFolderId);
        } else {
            result = await cloudService.saveToQuark(cookie, shareUrl, targetFolderId);
        }

        if (result.success) {
            // 2. 记录日志
            await db.run(
                'INSERT INTO sync_logs (media_name, source_url, status) VALUES (?, ?, ?)',
                mediaName, shareUrl, 'transferred'
            );

            res.json({ message: '转存任务已提交', detail: result.message });
        } else {
            res.status(500).json({ error: result.message });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const syncToNas = async (req: Request, res: Response) => {
    const { srcDir, names, dstDir } = req.body;
    
    try {
        const success = await openlistService.copyFile(srcDir, names, dstDir);
        if (success) {
            res.json({ message: '同步任务已发送至 OpenList' });
        } else {
            res.status(500).json({ error: 'OpenList 同步失败，请检查配置或 Token' });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
