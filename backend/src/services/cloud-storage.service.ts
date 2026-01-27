import axios from 'axios';
import { getDb } from '../db/index.js';

export interface TransferResult {
    success: boolean;
    message: string;
    data?: any;
}

export class CloudStorageService {
    private static instance: CloudStorageService;

    private constructor() {}

    public static getInstance(): CloudStorageService {
        if (!CloudStorageService.instance) {
            CloudStorageService.instance = new CloudStorageService();
        }
        return CloudStorageService.instance;
    }

    /**
     * 115网盘转存逻辑
     * 参考: 115转存通常需要 cid (目录ID), pick_code 或 离线下载接口
     */
    async saveTo115(cookie: string, shareUrl: string, targetFolderId: string = '0'): Promise<TransferResult> {
        try {
            // 这里通常是调用115的离线下载接口
            // 接口: https://115.com/web/lixian/?ct=lixian&ac=add_task_url
            // 需要处理 cookie 和 payload
            const response = await axios.post('https://115.com/web/lixian/?ct=lixian&ac=add_task_url', 
                `url=${encodeURIComponent(shareUrl)}&wp_path_id=${targetFolderId}`,
                {
                    headers: {
                        'Cookie': cookie,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
                    }
                }
            );

            if (response.data && response.data.state) {
                return { success: true, message: '115 转存任务已提交', data: response.data };
            }
            return { success: false, message: response.data.error_msg || '115 转存失败' };
        } catch (error: any) {
            return { success: false, message: `115 转存异常: ${error.message}` };
        }
    }

    /**
     * 夸克网盘转存逻辑
     * 夸克通常需要 share_id 和 pass_code，然后调用 save 接口
     */
    async saveToQuark(cookie: string, shareUrl: string, targetFolderId: string = '0'): Promise<TransferResult> {
        try {
            // 夸克转存逻辑较为复杂，通常涉及解析 share_id
            // 这里先写一个示意性的结构，后续根据实际抓包补全
            // 1. 解析 shareUrl 获取 pwd_id (share_id)
            const shareIdMatch = shareUrl.match(/s\/([a-zA-Z0-9]+)/);
            if (!shareIdMatch) return { success: false, message: '无效的夸克分享链接' };
            const shareId = shareIdMatch[1];

            // 2. 调用夸克 API (示例接口)
            // POST https://pan.quark.cn/1/clouddrive/share/save
            const response = await axios.post('https://pan.quark.cn/1/clouddrive/share/save', {
                fid_list: [], // 如果是转存整个分享，通常有特定标识
                share_id: shareId,
                to_p_id: targetFolderId
            }, {
                headers: {
                    'Cookie': cookie,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.code === 0) {
                return { success: true, message: '夸克转存成功' };
            }
            return { success: false, message: response.data.message || '夸克转存失败' };
        } catch (error: any) {
            return { success: false, message: `夸克转存异常: ${error.message}` };
        }
    }
}
