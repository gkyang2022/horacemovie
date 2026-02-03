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
            // 2. 自动触发 OpenList 同步
            const openlistPathKey = type === '115' ? 'openlist_path_115' : 'openlist_path_quark';
            const settingsRows2 = await db.all('SELECT key, value FROM settings WHERE key IN (?, ?)', [openlistPathKey, 'openlist_default_path']);
            const settings2: any = {};
            settingsRows2.forEach(row => {
                settings2[row.key] = row.value;
            });
            
            const openlistSourcePath = settings2[openlistPathKey];
            const openlistDefaultPath = settings2['openlist_default_path'];

            if (openlistSourcePath) {
                console.log(`[TransferController] Triggering auto-sync for ${mediaName} from ${openlistSourcePath} to ${openlistDefaultPath || 'default'}, names: ${result.names?.join(', ') || 'all'}`);
                // 注意：转存成功到 OpenList 能够看到文件可能有延迟，这里异步执行同步
                void openlistService.copyFile(openlistSourcePath, result.names || [], openlistDefaultPath)
                    .then(syncSuccess => {
                        console.log(`[TransferController] Auto-sync ${syncSuccess ? 'task submitted' : 'failed'} for ${mediaName}`);
                    })
                    .catch(err => {
                        console.error(`[TransferController] Auto-sync error for ${mediaName}:`, err.message);
                    });
            } else {
                console.log(`[TransferController] No OpenList source path configured for ${type}, skipping auto-sync`);
            }

            res.json({ message: '转存任务已提交', detail: result.message });
        } else {
            const status = result.errorType === 'user' ? 400 : 500;
            res.status(status).json({ error: result.message });
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
