import axios from 'axios';

export interface TransferResult {
    success: boolean;
    message: string;
    data?: any;
    names?: string[];
    errorType?: 'user' | 'system';
}

export interface QuarkFile {
    id: string;
    name: string;
    share_fid_token: string;
    file_type?: number; // 1: file, 0: folder
    pid?: string; // parent folder id
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

    private extractQuarkInfo(url: string) {
        const cleanUrl = url.trim().replace(/:+$/, '');
        const shareIdMatch = cleanUrl.match(/\/s\/([a-zA-Z0-9]+)/);
        const shareId = shareIdMatch ? shareIdMatch[1] : '';
        const passCodeMatch = cleanUrl.match(/[?&](pwd|code)=([a-zA-Z0-9]+)/);
        const passCode = passCodeMatch ? passCodeMatch[2] : '';

        // 尝试从 URL 中提取 pdir_fid (32位十六进制字符串)
        // Quark 分享子目录链接格式通常为 .../s/shareId/fid-name 或 .../s/shareId#/list/share/fid-name
        const fidMatch = cleanUrl.match(/[#/]([a-f0-9]{32})/);
        const pdirFid = fidMatch ? fidMatch[1] : '0';

        return { shareId, passCode, pdirFid };
    }

    private getQuarkHeaders(cookie: string, shareId: string) {
        return {
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
        };
    }

    /**
     * 获取夸克分享页面的 Token
     */
    private async getQuarkStoken(cookie: string, shareId: string, passCode: string): Promise<string> {
        const domains = ['https://drive-h.quark.cn', 'https://pan.quark.cn'];
        const commonParams = `pr=ucpro&fr=pc&__t=${Date.now()}`;
        
        for (const domain of domains) {
            try {
                const body: any = { pwd_id: shareId };
                if (passCode) {
                    body.passcode = passCode;
                }

                const res = await axios.post(`${domain}/1/clouddrive/share/sharepage/token?${commonParams}&__dt=994`, body, {
                    headers: this.getQuarkHeaders(cookie, shareId),
                    timeout: 15000
                });

                if (res.data?.status === 200 && res.data.data?.stoken) {
                    return res.data.data.stoken;
                } else if (res.data?.status === 403 || res.data?.status === 40001) {
                    const msg = res.data?.message || '提取码错误或链接失效';
                    throw new Error(msg);
                }
            } catch (e: any) {
                if (e.message.includes('提取码') || e.message.includes('失效')) throw e;
                console.warn(`[CloudStorageService] Failed to fetch Quark stoken from ${domain}: ${e.message}`);
            }
        }
        throw new Error('获取夸克分享 Token 失败，请检查提取码或 Cookie');
    }

    /**
     * 获取夸克分享的文件列表（支持分页和递归）
     */
    private async getQuarkFileList(cookie: string, shareId: string, stoken: string, pdirFid: string, recursive: boolean = false): Promise<QuarkFile[]> {
        const domains = ['https://drive-h.quark.cn', 'https://pan.quark.cn'];
        const commonParams = `pr=ucpro&fr=pc&__t=${Date.now()}`;
        let allFiles: QuarkFile[] = [];
        let page = 1;

        while (true) {
            let hasMore = false;
            let success = false;

            for (const domain of domains) {
                try {
                    const encodedToken = encodeURIComponent(stoken);
                    const url = `${domain}/1/clouddrive/share/sharepage/detail?${commonParams}&stoken=${encodedToken}&pwd_id=${shareId}&pdir_fid=${pdirFid}&_page=${page}&_size=50&_sort=file_name:asc&__dt=994`;
                    
                    const res = await axios.get(url, {
                        headers: this.getQuarkHeaders(cookie, shareId),
                        timeout: 15000
                    });

                    if (res.data?.status === 200 && res.data.data?.list) {
                        const list = res.data.data.list.map((item: any) => ({
                            id: item.fid,
                            name: item.file_name,
                            share_fid_token: item.share_fid_token,
                            file_type: item.file_type,
                            pid: pdirFid
                        }));
                        allFiles = allFiles.concat(list);
                        
                        // 检查是否还有下一页
                        if (list.length === 50) {
                            hasMore = true;
                        }
                        success = true;
                        break;
                    }
                } catch (e: any) {
                    console.warn(`[CloudStorageService] Failed to fetch Quark details from ${domain} (page ${page}): ${e.message}`);
                }
            }
            
            if (!success || !hasMore) {
                break; 
            }
            page++;
        }

        // 如果需要递归，抓取所有子文件夹的内容
        if (recursive) {
            const folders = allFiles.filter(f => f.file_type !== 1);
            for (const folder of folders) {
                console.log(`[CloudStorageService] Recursing into Quark folder: ${folder.name} (${folder.id})`);
                const subFiles = await this.getQuarkFileList(cookie, shareId, stoken, folder.id, true);
                allFiles = allFiles.concat(subFiles);
            }
        }

        return allFiles;
    }

    /**
     * 获取分享链接的文件列表快照
     */
    async getShareSnap(type: '115' | 'quark', cookie: string, shareUrl: string): Promise<QuarkFile[]> {
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
                        id: item.file_id || item.pc || item.fid,
                        name: item.file_name || item.n,
                        share_fid_token: ''
                    }));
                }
            } catch (e) {
                console.error(`[CloudStorageService] Failed to get 115 snap:`, e);
            }
        } else if (type === 'quark') {
            const { shareId, passCode, pdirFid } = this.extractQuarkInfo(shareUrl);
            if (!shareId) return [];

            try {
                const stoken = await this.getQuarkStoken(cookie, shareId, passCode);
                // 获取文件列表（递归）
                console.log(`[CloudStorageService] Fetching recursive share list for: ${shareId}`);
                return await this.getQuarkFileList(cookie, shareId, stoken, pdirFid, true);
            } catch (error: any) {
                console.error(`[CloudStorageService] Failed to get Quark snap:`, error);
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
     * @param cookie 夸克 Cookie
     * @param shareUrl 分享链接
     * @param targetFolderId 目标目录 ID
     * @param selectiveFiles 可选，指定要转存的文件列表（包含 fid 和 share_fid_token）
     */
    async saveToQuark(
        cookie: string, 
        shareUrl: string, 
        targetFolderId: string = '0', 
        selectiveFiles?: QuarkFile[]
    ): Promise<TransferResult> {
        try {
            const { shareId, passCode, pdirFid } = this.extractQuarkInfo(shareUrl);
            console.log(`[CloudStorageService] Initiating Quark transfer for shareId: ${shareId}, pdirFid: ${pdirFid}`);

            if (!shareId) {
                return { success: false, message: '解析夸克分享 ID 失败' };
            }

            if (!cookie || cookie.trim() === '') {
                return { success: false, message: '夸克 Cookie 未配置，请在设置中添加' };
            }

            // 1. 获取 stoken
            let stoken: string;
            try {
                stoken = await this.getQuarkStoken(cookie, shareId, passCode);
            } catch (e: any) {
                const isUserError = e.message.includes('提取码') || e.message.includes('失效') || e.message.includes('不存在');
                return { 
                    success: false, 
                    message: e.message, 
                    errorType: isUserError ? 'user' : 'system' 
                };
            }

            // 2. 获取待转存文件列表
            let filesToSave: QuarkFile[] = [];
            if (selectiveFiles && selectiveFiles.length > 0) {
                filesToSave = selectiveFiles;
            } else {
                try {
                    filesToSave = await this.getQuarkFileList(cookie, shareId, stoken, pdirFid);
                } catch (e: any) {
                    return { success: false, message: `获取分享详情失败: ${e.message}`, errorType: 'system' };
                }
            }

            if (filesToSave.length === 0) {
                return { success: false, message: '未找到可转存的文件', errorType: 'user' };
            }

            const fidList = filesToSave.map(f => f.id);
            const fidTokenList = filesToSave.map(f => f.share_fid_token);
            const names = filesToSave.map(f => f.name);

            // 3. 执行转存
            const commonParams = `pr=ucpro&fr=pc&__t=${Date.now()}`;
            const saveParams = {
                fid_list: fidList,
                fid_token_list: fidTokenList,
                to_pdir_fid: targetFolderId,
                pwd_id: shareId,
                stoken: stoken,
                pdir_fid: pdirFid,
                scene: 'link'
            };

            const domains = ['https://drive-h.quark.cn', 'https://pan.quark.cn'];
            let lastError = '';
            let lastErrorType: 'user' | 'system' = 'system';

            for (const domain of domains) {
                try {
                    console.log(`[CloudStorageService] Executing Quark save via ${domain}`);
                    const response = await axios.post(`${domain}/1/clouddrive/share/sharepage/save?${commonParams}`, saveParams, {
                        headers: this.getQuarkHeaders(cookie, shareId),
                        timeout: 30000
                    });

                    if (response.data && (response.data.status === 200 || response.data.code === 0)) {
                        console.log(`[CloudStorageService] Quark transfer successful for shareId: ${shareId}, names: ${names.join(', ')}`);
                        return { success: true, message: '夸克转存成功', names };
                    }
                    
                    const errorMsg = response.data?.message || '夸克转存失败';
                    const status = response.data?.status || response.data?.code;
                    
                    if (status === 401 || status === 31001) {
                        return { success: false, message: '夸克登录失效，请更新 Cookie', errorType: 'user' };
                    }
                    
                    // 处理违规、封禁等用户可见错误
                    if (status === 403 || errorMsg.includes('违规') || errorMsg.includes('封禁') || errorMsg.includes('黑名单')) {
                        console.warn(`[CloudStorageService] Quark save 403 error body:`, JSON.stringify(response.data));
                        // 如果虽然是 403 但提示已存在，可以视为成功
                        if (errorMsg.includes('已存在') || errorMsg.includes('重复')) {
                            return { success: true, message: '资源已在网盘中', names };
                        }
                        return { success: false, message: `夸克转存失败: ${errorMsg}`, errorType: 'user' };
                    }

                    lastError = errorMsg;
                } catch (e: any) {
                    const errorData = e.response?.data;
                    console.warn(`[CloudStorageService] Quark save failed via ${domain}: ${e.message}`, errorData ? `Error Body: ${JSON.stringify(errorData)}` : '');
                    
                    lastError = e.message;
                    if (e.response?.status === 401) {
                        return { success: false, message: '夸克登录失效，请重新设置 Cookie', errorType: 'user' };
                    }
                    if (e.response?.status === 403) {
                        // 如果错误体中包含已存在信息
                        if (errorData?.message?.includes('已存在') || errorData?.message?.includes('重复')) {
                            return { success: true, message: '资源已在网盘中', names };
                        }
                        lastErrorType = 'user';
                        lastError = `拒绝访问: ${errorData?.message || '可能是账号异常或触发风控'}`;
                    }
                }
            }

            return { success: false, message: lastError || '转存失败', errorType: lastErrorType };
        } catch (error: any) {
            console.error(`[CloudStorageService] Quark transfer exception for ${shareUrl}:`, error.message);
            return { success: false, message: `夸克转存异常: ${error.message}`, errorType: 'system' };
        }
    }
}
