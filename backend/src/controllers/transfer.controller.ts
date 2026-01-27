import { Request, Response } from 'express';
import { CloudStorageService } from '../services/cloud-storage.service.js';
import { OpenListService } from '../services/openlist.service.js';
import { getDb } from '../db/index.js';

const cloudService = CloudStorageService.getInstance();
const openlistService = OpenListService.getInstance();

export const transferAndSync = async (req: Request, res: Response) => {
    const { shareUrl, type, mediaName } = req.body; // type: '115' or 'quark'
    const db = getDb();

    // 1. 获取网盘 Cookie
    const account = await db.get('SELECT cookie FROM cloud_accounts WHERE type = ? ORDER BY updated_at DESC LIMIT 1', type);
    if (!account) {
        return res.status(400).json({ error: `未配置 ${type} 网盘账号` });
    }

    try {
        let result;
        if (type === '115') {
            result = await cloudService.saveTo115(account.cookie, shareUrl);
        } else {
            result = await cloudService.saveToQuark(account.cookie, shareUrl);
        }

        if (result.success) {
            // 2. 记录日志
            await db.run(
                'INSERT INTO sync_logs (media_name, source_url, status) VALUES (?, ?, ?)',
                mediaName, shareUrl, 'transferred'
            );

            // 3. 触发 OpenList 同步 (可选，或者由用户手动触发)
            // 这里为了演示，先尝试同步
            // 注意：转存后文件可能不会立即在 OpenList 刷新，通常需要一点延迟
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
