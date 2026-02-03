import axios from 'axios';
import { getDb } from '../db/index.js';

export interface TransferResult {
    success: boolean;
    message: string;
    data?: any;
    names?: string[];
    errorType?: 'user' | 'system';
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
     * 获取分享链接的文件列表快照
     */
    async getShareSnap(type: '115' | 'quark', cookie: string, shareUrl: string): Promise<{ id: string, name: string }[]> {
        if (type === '115') {
            const shareCodeMatch = shareUrl.match(/\/s\/([a-zA-Z0-9]+)/);
            if (!shareCodeMatch) return [];
            const shareCode = shareCodeMatch[1];
            const passwordMatch = shareUrl.match(/password=([^&]+)/);
            const receiveCode = passwordMatch ? passwordMatch[1] : '';

            try {
                const snapRes = await axios.get(`https://webapi.115.com/share/snap?share_code=${shareCode}&receive_code=${receiveCode}`, {
                    headers: {
                        'Cookie': cookie,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
                    },
                    timeout: 30000
                });
                if (snapRes.data && snapRes.data.state && snapRes.data.data) {
                    const list = snapRes.data.data.list || [];
                    return list.map((item: any) => ({
                        id: item.file_id || item.pc || item.fid, // 115 的 ID 字段比较杂，pc 通常是文件夹/文件的唯一标识
                        name: item.file_name || item.n
                    }));
                }
            } catch (e) {
                console.error(`[CloudStorageService] Failed to get 115 snap:`, e);
            }
        } else if (type === 'quark') {
            const cleanUrl = shareUrl.trim().replace(/:+$/, '');
            const shareIdMatch = cleanUrl.match(/\/s\/([a-zA-Z0-9]+)/);
            const shareId = shareIdMatch ? shareIdMatch[1] : '';
            const passCodeMatch = cleanUrl.match(/[?&](pwd|code)=([a-zA-Z0-9]+)/);
            const passCode = passCodeMatch ? passCodeMatch[2] : '';

            if (!shareId) return [];

            try {
                const commonParams = `pr=ucpro&fr=pc&uc_param_str=&__t=${Date.now()}`;
                const getHeaders = () => ({
                    'Cookie': cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
                    'Referer': `https://pan.quark.cn/s/${shareId}`,
                });

                // 1. stoken
                const tokenRes = await axios.post(`https://drive-h.quark.cn/1/clouddrive/share/sharepage/token?${commonParams}&__dt=994`, {
                    pwd_id: shareId,
                    passcode: passCode
                }, { headers: getHeaders(), timeout: 30000 });

                if (tokenRes.data?.status === 200 && tokenRes.data.data?.stoken) {
                    const stoken = tokenRes.data.data.stoken;
                    // 2. detail
                    const detailRes = await axios.get(`https://drive-h.quark.cn/1/clouddrive/share/sharepage/detail?${commonParams}&stoken=${stoken}&pwd_id=${shareId}&_pdir_fid=0`, {
                        headers: getHeaders(),
                        timeout: 30000
                    });

                    if (detailRes.data?.status === 200 && detailRes.data.data?.list) {
                        return detailRes.data.data.list.map((item: any) => ({
                            id: item.fid,
                            name: item.file_name,
                            share_fid_token: item.share_fid_token // 夸克转存需要这个 token
                        }));
                    }
                }
            } catch (e) {
                console.error(`[CloudStorageService] Failed to get Quark snap:`, e);
            }
        }
        return [];
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
                return { success: false, message: '无法从链接中提取分享码', errorType: 'user' };
            }
            const shareCode = shareCodeMatch[1];

            // 2. 提取提取码 (如果有)
            // 修改正则以支持冒号等特殊字符，提取 password= 之后到 & 之前或结尾的内容
            const passwordMatch = shareUrl.match(/password=([^&]+)/);
            const receiveCode = passwordMatch ? passwordMatch[1] : '';

            // 3. 获取域名用于 Header
            const urlObj = new URL(shareUrl);
            const domain = urlObj.origin;

            // 4. 获取分享快照以提取文件名
            let names: string[] = [];
            try {
                const snapRes = await axios.get(`https://webapi.115.com/share/snap?share_code=${shareCode}&receive_code=${receiveCode}`, {
                    headers: {
                        'Cookie': cookie,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
                    },
                    timeout: 30000
                });
                if (snapRes.data && snapRes.data.state && snapRes.data.data) {
                    // 提取顶级文件/目录名
                    const list = snapRes.data.data.list || [];
                    names = list.map((item: any) => item.file_name || item.n);
                    console.log(`[CloudStorageService] Extracted 115 share names: ${names.join(', ')}`);
                }
            } catch (e: any) {
                console.warn(`[CloudStorageService] Failed to fetch 115 share snap: ${e.message}`);
            }

            // 5. 调用 115 分享接收接口 (Share Receive)
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
                    timeout: 30000
                }
            );

            if (response.data && response.data.state === true) {
                console.log(`[CloudStorageService] 115 share receive successful for: ${shareCode}`);
                return { success: true, message: '115 分享转存成功', data: response.data, names };
            }

            const rawError = response.data?.error_msg || response.data?.msg || response.data?.error || response.data?.message || (response.data?.state === false ? '操作失败' : 'Unknown error');
            const errorText = String(rawError || '');
            const errno = Number(response.data?.errno);
             const isUserError = /(分享已取消|分享不存在|链接不存在|访问码|提取码|密码|口令|无效)/.test(errorText) || 
                                [4100008, 4100010, 4100011, 4100012, 4100013, 4100018, 4100024].includes(errno);
             
             console.warn(`[CloudStorageService] 115 share receive failed for ${shareCode}. Response:`, JSON.stringify(response.data));
             
             // 1. 如果是明确的用户错误（如链接失效、密码错误、已转存等），直接返回失败，不触发后续 OpenList 逻辑
             if (isUserError) {
                 return { success: false, message: `115 转存失败: ${errorText}`, errorType: 'user' };
             }

             // 2. 特殊处理：部分非阻塞错误（目前 4100024 已移入 isUserError，此处保留文本匹配作为兜底）
             if (errorText.includes('已接收') || errorText.includes('已经接收')) {
                 return { success: true, message: '资源已在网盘中，无需重复转存', data: response.data, names };
             }

            return { success: false, message: `115 转存失败: ${errorText || '操作失败'}`, errorType: 'system' };
        } catch (error: any) {
            console.error(`[CloudStorageService] 115 share receive exception for ${shareUrl}:`, error.message);
            return { success: false, message: `115 转存异常: ${error.message}`, errorType: 'system' };
        }
    }

    /**
     * 夸克网盘转存逻辑
     * 夸克通常需要 share_id 和 pass_code，然后调用 save 接口
     */
    async saveToQuark(cookie: string, shareUrl: string, targetFolderId: string = '0'): Promise<TransferResult> {
        try {
            // 清理 URL，去除末尾可能存在的冒号或其他非法字符
            const cleanUrl = shareUrl.trim().replace(/:+$/, '');
            console.log(`[CloudStorageService] Initiating Quark transfer for URL: ${cleanUrl}`);

            // 1. 解析 shareId 和 passCode
            const shareIdMatch = cleanUrl.match(/\/s\/([a-zA-Z0-9]+)/);
            const shareId = shareIdMatch ? shareIdMatch[1] : '';
            const passCodeMatch = cleanUrl.match(/[?&](pwd|code)=([a-zA-Z0-9]+)/);
            const passCode = passCodeMatch ? passCodeMatch[2] : '';

            if (!shareId) {
                console.warn(`[CloudStorageService] Invalid Quark share URL: ${cleanUrl}`);
                return { success: false, message: '解析夸克分享 ID 失败' };
            }

            if (!cookie || cookie.trim() === '') {
                console.warn(`[CloudStorageService] Quark cookie is missing.`);
                return { success: false, message: '夸克 Cookie 未配置，请在设置中添加' };
            }

            // 统一的请求头生成函数
            const getHeaders = (apiDomain: string) => ({
                'Cookie': cookie,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
                'Origin': 'https://pan.quark.cn',
                'Referer': `https://pan.quark.cn/s/${shareId}`,
                'Sec-Ch-Ua': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'Priority': 'u=1, i'
            });

            const domain = 'https://drive-h.quark.cn';
            const backupDomain = 'https://pan.quark.cn';
            const commonParams = `pr=ucpro&fr=pc&uc_param_str=&__t=${Date.now()}`;

            // 2. 获取 stoken (sharepage/token)
            let stoken = '';
            let fetchTokenError = '';
            
            const tryFetchToken = async (targetDomain: string) => {
                console.log(`[CloudStorageService] Step 1: Fetching Quark stoken from ${targetDomain}`);
                const tokenRes = await axios.post(`${targetDomain}/1/clouddrive/share/sharepage/token?${commonParams}&__dt=994`, {
                    pwd_id: shareId,
                    passcode: passCode
                }, {
                    headers: getHeaders(targetDomain),
                    timeout: 30000
                });

                if (tokenRes.data && tokenRes.data.status === 200 && tokenRes.data.data) {
                    return tokenRes.data.data.stoken;
                } else {
                    throw new Error(tokenRes.data?.message || '获取 token 失败');
                }
            };

            try {
                stoken = await tryFetchToken(domain);
            } catch (e: any) {
                console.warn(`[CloudStorageService] Primary domain failed for token: ${e.message}. Trying backup...`);
                try {
                    stoken = await tryFetchToken(backupDomain);
                } catch (e2: any) {
                    fetchTokenError = e2.message;
                    console.error(`[CloudStorageService] Backup domain also failed for token: ${e2.message}`);
                }
            }

            if (!stoken) {
                return { success: false, message: `获取夸克分享 Token 失败: ${fetchTokenError || '可能是提取码错误或 Cookie 失效'}` };
            }

            // 3. 获取分享详情 (sharepage/detail)
            let detailData: any = null;
            let fetchDetailError = '';

            const tryFetchDetail = async (targetDomain: string) => {
                console.log(`[CloudStorageService] Step 2: Fetching Quark details from ${targetDomain}`);
                const detailRes = await axios.get(`${targetDomain}/1/clouddrive/share/sharepage/detail?${commonParams}&stoken=${stoken}&pwd_id=${shareId}&_pdir_fid=0`, {
                    headers: getHeaders(targetDomain),
                    timeout: 30000
                });

                if (detailRes.data && detailRes.data.status === 200 && detailRes.data.data) {
                    return detailRes.data.data;
                } else {
                    throw new Error(detailRes.data?.message || '获取分享详情失败');
                }
            };

            try {
                detailData = await tryFetchDetail(domain);
            } catch (e: any) {
                console.warn(`[CloudStorageService] Primary domain failed for detail: ${e.message}. Trying backup...`);
                try {
                    detailData = await tryFetchDetail(backupDomain);
                } catch (e2: any) {
                    fetchDetailError = e2.message;
                    console.error(`[CloudStorageService] Backup domain also failed for detail: ${e2.message}`);
                }
            }

            if (!detailData) {
                return { success: false, message: `获取夸克分享详情失败: ${fetchDetailError || '未知错误'}` };
            }

            const fidList = detailData.list?.map((item: any) => item.fid) || [];
            const fidTokenList = detailData.list?.map((item: any) => item.share_fid_token) || [];
            const names = detailData.list?.map((item: any) => item.file_name) || [];

            if (fidList.length === 0) {
                return { success: false, message: '未找到可转存的文件' };
            }

            // 4. 执行转存 (sharepage/save)
            const saveParams = {
                fid_list: fidList,
                fid_token_list: fidTokenList,
                to_pdir_fid: targetFolderId,
                pwd_id: shareId,
                stoken: stoken,
                pdir_fid: '0',
                scene: 'link'
            };

            const trySave = async (targetDomain: string) => {
                console.log(`[CloudStorageService] Step 3: Executing Quark save via ${targetDomain}`);
                return await axios.post(`${targetDomain}/1/clouddrive/share/sharepage/save?${commonParams}`, saveParams, {
                    headers: getHeaders(targetDomain),
                    timeout: 30000
                });
            };

            try {
                let response;
                try {
                    response = await trySave(domain);
                } catch (e: any) {
                    console.warn(`[CloudStorageService] Primary domain failed for save: ${e.message}. Trying backup...`);
                    response = await trySave(backupDomain);
                }

                if (response.data && (response.data.status === 200 || response.data.code === 0)) {
                    console.log(`[CloudStorageService] Quark transfer successful for shareId: ${shareId}, names: ${names.join(', ')}`);
                    return { success: true, message: '夸克转存成功', names };
                }
                
                const errorMsg = response.data?.message || '夸克转存失败';
                if (response.data?.status === 401 || response.data?.code === 31001) {
                    return { success: false, message: '夸克登录失效，请更新 Cookie' };
                }
                return { success: false, message: errorMsg };
            } catch (e: any) {
                console.error(`[CloudStorageService] Quark save failed: ${e.message}`);
                if (e.response?.status === 401) {
                    return { success: false, message: '夸克登录失效，请重新设置 Cookie' };
                }
                return { success: false, message: `转存失败: ${e.message}` };
            }
            } catch (error: any) {
            console.error(`[CloudStorageService] Quark transfer exception for ${shareUrl}:`, error.message);
            if (error.response) {
                console.error(`[CloudStorageService] Error Response Data:`, JSON.stringify(error.response.data));
                return { success: false, message: `夸克转存失败 (${error.response.status}): ${error.response.data?.message || error.message}` };
            }
            return { success: false, message: `夸克转存异常: ${error.message}` };
        }
    }
}
