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
     * 115网盘转存逻辑 (分享转存)
     * 115 分享链接转存通常需要从 URL 中提取 share_code，然后调用 share/receive 接口
     */
    async saveTo115(cookie: string, shareUrl: string, targetFolderId: string = '0'): Promise<TransferResult> {
        try {
            console.log(`[CloudStorageService] Initiating 115 share receive for URL: ${shareUrl}`);
            
            // 1. 从分享链接中提取 share_code
            // 常见的 115 分享链接格式: https://115.com/s/sw35vv73xw3?password=xxxx
            const shareCodeMatch = shareUrl.match(/\/s\/([a-zA-Z0-9]+)/);
            if (!shareCodeMatch) {
                console.warn(`[CloudStorageService] Could not extract share_code from 115 URL: ${shareUrl}`);
                return { success: false, message: '无法从链接中提取分享码' };
            }
            const shareCode = shareCodeMatch[1];

            // 2. 提取提取码 (如果有)
            // 修改正则以支持冒号等特殊字符，提取 password= 之后到 & 之前或结尾的内容
            const passwordMatch = shareUrl.match(/password=([^&]+)/);
            const receiveCode = passwordMatch ? passwordMatch[1] : '';

            // 3. 获取域名用于 Header
            const urlObj = new URL(shareUrl);
            const domain = urlObj.origin;

            // 4. 调用 115 分享接收接口 (Share Receive)
            // 使用 webapi.115.com 接口通常比直接使用 115.com 更稳定，避免 404
            const response = await axios.post('https://webapi.115.com/share/receive', 
                `share_code=${shareCode}&receive_code=${receiveCode}&cid=${targetFolderId}`,
                {
                    headers: {
                        'Cookie': cookie,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                        'Origin': domain,
                        'Referer': shareUrl
                    },
                    timeout: 10000
                }
            );

            if (response.data && response.data.state === true) {
                console.log(`[CloudStorageService] 115 share receive successful for: ${shareCode}`);
                return { success: true, message: '115 分享转存成功', data: response.data };
            }

            const errorMsg = response.data?.error_msg || response.data?.msg || 'Unknown error';
            console.warn(`[CloudStorageService] 115 share receive failed for ${shareCode}: ${errorMsg}`);
            return { success: false, message: `115 转存失败: ${errorMsg}` };
        } catch (error: any) {
            console.error(`[CloudStorageService] 115 share receive exception for ${shareUrl}:`, error.message);
            return { success: false, message: `115 转存异常: ${error.message}` };
        }
    }

    /**
     * 夸克网盘转存逻辑
     * 夸克通常需要 share_id 和 pass_code，然后调用 save 接口
     */
    async saveToQuark(cookie: string, shareUrl: string, targetFolderId: string = '0'): Promise<TransferResult> {
        try {
            console.log(`[CloudStorageService] Initiating Quark transfer for URL: ${shareUrl}`);
            // 夸克转存逻辑较为复杂，通常涉及解析 share_id
            // 这里先写一个示意性的结构，后续根据实际抓包补全
            // 1. 解析 shareUrl 获取 pwd_id (share_id)
            const shareIdMatch = shareUrl.match(/s\/([a-zA-Z0-9]+)/);
            if (!shareIdMatch) {
                console.warn(`[CloudStorageService] Invalid Quark share URL: ${shareUrl}`);
                return { success: false, message: '无效的夸克分享链接' };
            }
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
                },
                timeout: 10000
            });

            if (response.data && response.data.code === 0) {
                console.log(`[CloudStorageService] Quark transfer successful for shareId: ${shareId}`);
                return { success: true, message: '夸克转存成功' };
            }
            console.warn(`[CloudStorageService] Quark transfer failed for ${shareId}: ${response.data.message || 'Unknown error'}`);
            return { success: false, message: response.data.message || '夸克转存失败' };
        } catch (error: any) {
            console.error(`[CloudStorageService] Quark transfer exception for ${shareUrl}:`, error.message);
            return { success: false, message: `夸克转存异常: ${error.message}` };
        }
    }
}
