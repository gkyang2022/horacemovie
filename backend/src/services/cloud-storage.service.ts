import axios from 'axios';
import { logger } from '../logger.js';

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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/3.14.2 Chrome/112.0.5615.165 Electron/24.1.3.8 Safari/537.36 Channel/pckk_other_ch',
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
        let lastError = '';
        
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

                const status = res.data?.status;
                const message = res.data?.message || '';
                if (status === 200 && res.data.data?.stoken) {
                    return res.data.data.stoken;
                }
                if (status === 401) {
                    throw new Error('夸克登录失效，请更新 Cookie');
                }
                if (status === 403 || status === 40001) {
                    if (/提取码|访问码|口令|密码/.test(message)) {
                        throw new Error('夸克分享提取码错误或已失效');
                    }
                    if (/分享已取消|分享不存在|链接不存在|失效|不存在|无效|被取消/.test(message)) {
                        throw new Error('夸克分享链接已失效或被取消');
                    }
                    if (/封禁|受限|违规|风控|黑名单/.test(message)) {
                        throw new Error(message || '分享者用户封禁链接查看受限');
                    }
                    throw new Error(message || '夸克分享链接已失效或被取消');
                }
                lastError = message || lastError;
            } catch (e: any) {
                const status = e?.response?.status;
                const responseStatus = e?.response?.data?.status;
                const responseMessage = e?.response?.data?.message || e?.response?.data?.error || '';
                if (status === 401) {
                    throw new Error('夸克登录失效，请更新 Cookie');
                }
                if (status === 403 || responseStatus === 40001) {
                    if (/提取码|访问码|口令|密码/.test(responseMessage)) {
                        throw new Error('夸克分享提取码错误或已失效');
                    }
                    if (/分享已取消|分享不存在|链接不存在|失效|不存在|无效|被取消/.test(responseMessage)) {
                        throw new Error('夸克分享链接已失效或被取消');
                    }
                    if (/封禁|受限|违规|风控|黑名单/.test(responseMessage)) {
                        throw new Error(responseMessage || '分享者用户封禁链接查看受限');
                    }
                    throw new Error(responseMessage || '夸克分享链接已失效或被取消');
                }
                const message = e?.message || '';
                if (/提取码|访问码|口令|密码|失效|不存在|无效|取消|Cookie|登录失效|分享/.test(message)) {
                    throw e;
                }
                lastError = responseMessage || message || lastError;
                logger.warn('[CloudStorageService] Failed to fetch Quark stoken', { domain, error: e });
            }
        }
        if (/提取码|访问码|口令|密码/.test(lastError)) {
            throw new Error('夸克分享提取码错误或已失效');
        }
        if (/分享已取消|分享不存在|链接不存在|失效|不存在|无效|被取消/.test(lastError)) {
            throw new Error('夸克分享链接已失效或被取消');
        }
        throw new Error(lastError || '获取夸克分享 Token 失败');
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
                    logger.warn('[CloudStorageService] Failed to fetch Quark details', { domain, page, error: e });
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
                logger.debug('[CloudStorageService] Recursing into Quark folder', { name: folder.name, id: folder.id });
                const subFiles = await this.getQuarkFileList(cookie, shareId, stoken, folder.id, true);
                allFiles = allFiles.concat(subFiles);
            }
        }

        return allFiles;
    }

    private async listQuarkDriveFiles(cookie: string, shareId: string, pdirFid: string): Promise<QuarkFile[]> {
        const url = 'https://drive.quark.cn/1/clouddrive/file/sort';
        const params = {
            pr: 'ucpro',
            fr: 'pc',
            pdir_fid: pdirFid,
            _page: 1,
            _size: 200,
            _sort: 'file_name:asc',
            __dt: 994,
            __t: Date.now()
        };

        const res = await axios.get(url, {
            params,
            headers: this.getQuarkHeaders(cookie, shareId),
            timeout: 15000
        });

        const list = res.data?.data?.list || [];
        return list.map((item: any) => ({
            id: item.fid,
            name: item.file_name,
            share_fid_token: '',
            file_type: item.file_type,
            pid: pdirFid
        }));
    }

    private async createQuarkFolder(cookie: string, shareId: string, parentFid: string, name: string): Promise<string> {
        const url = 'https://drive.quark.cn/1/clouddrive/file';
        const params = {
            pr: 'ucpro',
            fr: 'pc',
            uc_param_str: '',
            app: 'clouddrive',
            __dt: Math.floor((1 + Math.random() * 4) * 60 * 1000),
            __t: Math.floor(Date.now() / 1000)
        };

        try {
            const res = await axios.post(url, { pdir_fid: parentFid, file_name: name, dir: true }, {
                params,
                headers: this.getQuarkHeaders(cookie, shareId),
                timeout: 15000
            });

            const fid = res.data?.data?.fid;
            if (fid) return fid;
        } catch (e: any) {
            const status = e.response?.data?.status;
            const code = e.response?.data?.code;
            if (!(status === 400 && code === 23008)) {
                throw e;
            }
        }

        const list = await this.listQuarkDriveFiles(cookie, shareId, parentFid);
        const folder = list.find(item => item.file_type !== 1 && item.name === name);
        if (folder) return folder.id;

        throw new Error('创建目标目录失败');
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
                logger.error('[CloudStorageService] Failed to get 115 snap', { error: e });
            }
        } else if (type === 'quark') {
            const { shareId, passCode, pdirFid } = this.extractQuarkInfo(shareUrl);
            if (!shareId) return [];

            try {
                const stoken = await this.getQuarkStoken(cookie, shareId, passCode);
                // 获取文件列表（递归）
                logger.debug('[CloudStorageService] Fetching recursive share list', { shareId });
                return await this.getQuarkFileList(cookie, shareId, stoken, pdirFid, true);
            } catch (error: any) {
                logger.error('[CloudStorageService] Failed to get Quark snap', { shareId, error });
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
            // 1. 从分享链接中提取 share_code
            // 常见的 115 分享链接格式: https://115.com/s/sw35vv73xw3?password=xxxx
            const shareCodeMatch = shareUrl.match(/\/s\/([a-zA-Z0-9]+)/);
            if (!shareCodeMatch) {
                logger.warn('[CloudStorageService] Could not extract share_code from 115 URL');
                return { success: false, message: '无法从链接中提取分享码', errorType: 'user' };
            }
            const shareCode = shareCodeMatch[1];
            logger.info('[CloudStorageService] Initiating 115 share receive', { shareCode });

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
                    logger.debug('[CloudStorageService] Extracted 115 share names', { count: names.length });
                }
            } catch (e: any) {
                logger.warn('[CloudStorageService] Failed to fetch 115 share snap', { shareCode, error: e });
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
                logger.info('[CloudStorageService] 115 share receive successful', { shareCode });
                return { success: true, message: '115 分享转存成功', data: response.data, names };
            }

            const rawError = response.data?.error_msg || response.data?.msg || response.data?.error || response.data?.message || (response.data?.state === false ? '操作失败' : 'Unknown error');
            const errorText = String(rawError || '');
            const errno = Number(response.data?.errno);
             const isUserError = /(分享已取消|分享不存在|链接不存在|访问码|提取码|密码|口令|无效)/.test(errorText) || 
                                [4100008, 4100010, 4100011, 4100012, 4100013, 4100018, 4100024].includes(errno);
             
             logger.warn('[CloudStorageService] 115 share receive failed', {
                 shareCode,
                 errno,
                 message: errorText
             });
             
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
            logger.error('[CloudStorageService] 115 share receive exception', { error });
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
            logger.info('[CloudStorageService] Initiating Quark transfer', { shareId, pdirFid });

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
                const isUserError = /提取码|失效|不存在|封禁|受限|违规|风控|黑名单/.test(e.message);
                return { 
                    success: false, 
                    message: e.message, 
                    errorType: isUserError ? 'user' : 'system' 
                };
            }

            let filesToSave: QuarkFile[] = [];
            let shareTree: QuarkFile[] = [];
            if (selectiveFiles && selectiveFiles.length > 0) {
                shareTree = await this.getQuarkFileList(cookie, shareId, stoken, pdirFid, true);
                const latestMap = new Map(shareTree.map(item => [item.id, item]));
                const refreshed = selectiveFiles.map(file => {
                    const latest = latestMap.get(file.id);
                    if (!latest) {
                        return null;
                    }
                    return {
                        ...file,
                        name: latest.name,
                        share_fid_token: latest.share_fid_token,
                        file_type: latest.file_type,
                        pid: latest.pid
                    };
                }).filter(Boolean) as QuarkFile[];

                if (refreshed.length !== selectiveFiles.length) {
                    return { success: false, message: '分享中存在无法定位的文件，转存失败', errorType: 'user' };
                }

                filesToSave = refreshed;
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

            if (shareTree.length === 0) {
                shareTree = await this.getQuarkFileList(cookie, shareId, stoken, pdirFid, true);
            }

            const shareFolderMap = new Map<string, QuarkFile>();
            for (const item of shareTree) {
                if (item.file_type !== 1) {
                    shareFolderMap.set(item.id, item);
                }
            }

            const saveDt = Math.floor((1 + Math.random() * 4) * 60 * 1000);
            const saveTs = Math.floor(Date.now() / 1000);
            const commonParams = `pr=ucpro&fr=pc&uc_param_str=&app=clouddrive&__dt=${saveDt}&__t=${saveTs}`;
            const domains = ['https://drive.quark.cn', 'https://drive-h.quark.cn', 'https://pan.quark.cn'];

            const attemptSave = async (files: QuarkFile[], groupPdirFid: string, destinationFid: string): Promise<TransferResult> => {
                const fidList = files.map(f => f.id);
                const fidTokenList = files.map(f => f.share_fid_token);
                const names = files.map(f => f.name);
                const effectivePdirFid = groupPdirFid || pdirFid || '0';

                const saveParams = {
                    fid_list: fidList,
                    fid_token_list: fidTokenList,
                    to_pdir_fid: destinationFid,
                    pwd_id: shareId,
                    stoken: stoken,
                    pdir_fid: effectivePdirFid,
                    scene: 'link'
                };

                let lastError = '';
                let lastErrorType: 'user' | 'system' = 'system';

                for (const domain of domains) {
                    try {
                        logger.debug('[CloudStorageService] Executing Quark save', { domain });
                        const response = await axios.post(`${domain}/1/clouddrive/share/sharepage/save?${commonParams}`, saveParams, {
                            headers: this.getQuarkHeaders(cookie, shareId),
                            timeout: 30000
                        });

                        if (response.data && (response.data.status === 200 || response.data.code === 0)) {
                            logger.info('[CloudStorageService] Quark transfer successful', { shareId, count: names.length });
                            return { success: true, message: '夸克转存成功', names };
                        }
                        
                        const errorMsg = response.data?.message || '夸克转存失败';
                        const status = response.data?.status || response.data?.code;
                        
                        if (status === 401 || status === 31001) {
                            return { success: false, message: '夸克登录失效，请更新 Cookie', errorType: 'user' };
                        }
                        
                        if (status === 403 || errorMsg.includes('违规') || errorMsg.includes('封禁') || errorMsg.includes('黑名单')) {
                            logger.warn('[CloudStorageService] Quark save 403 response', { shareId, status, message: errorMsg });
                            if (errorMsg.includes('已存在') || errorMsg.includes('重复')) {
                                return { success: true, message: '资源已在网盘中', names };
                            }
                            return { success: false, message: `夸克转存失败: ${errorMsg}`, errorType: 'user' };
                        }

                        lastError = errorMsg;
                    } catch (e: any) {
                        const errorData = e.response?.data;
                        logger.warn('[CloudStorageService] Quark save failed', {
                            domain,
                            message: e.message,
                            status: e.response?.status,
                            errorMessage: errorData?.message
                        });
                        
                        lastError = e.message;
                        if (e.response?.status === 401) {
                            return { success: false, message: '夸克登录失效，请重新设置 Cookie', errorType: 'user' };
                        }
                        if (e.response?.status === 403) {
                            if (errorData?.message?.includes('已存在') || errorData?.message?.includes('重复')) {
                                return { success: true, message: '资源已在网盘中', names };
                            }
                            lastErrorType = 'user';
                            lastError = `拒绝访问: ${errorData?.message || '可能是账号异常或触发风控'}`;
                        }
                    }
                }

                return { success: false, message: lastError || '转存失败', errorType: lastErrorType };
            };

            const groupedFiles = new Map<string, QuarkFile[]>();
            for (const file of filesToSave) {
                const pid = file.pid || pdirFid;
                const list = groupedFiles.get(pid);
                if (list) {
                    list.push(file);
                } else {
                    groupedFiles.set(pid, [file]);
                }
            }

            const driveFolderCache = new Map<string, QuarkFile[]>();
            const ensureDriveChildren = async (parentFid: string) => {
                const cached = driveFolderCache.get(parentFid);
                if (cached) return cached;
                const list = await this.listQuarkDriveFiles(cookie, shareId, parentFid);
                driveFolderCache.set(parentFid, list);
                return list;
            };

            const ensurePathFid = async (pathParts: string[]) => {
                let currentFid = targetFolderId;
                for (const part of pathParts) {
                    const list = await ensureDriveChildren(currentFid);
                    const existing = list.find(item => item.file_type !== 1 && item.name === part);
                    if (existing) {
                        currentFid = existing.id;
                        continue;
                    }
                    const createdFid = await this.createQuarkFolder(cookie, shareId, currentFid, part);
                    driveFolderCache.delete(currentFid);
                    currentFid = createdFid;
                }
                return currentFid;
            };

            const resolveSharePath = (pid: string) => {
                const parts: string[] = [];
                let currentPid = pid;
                while (currentPid && currentPid !== '0' && currentPid !== pdirFid) {
                    const folder = shareFolderMap.get(currentPid);
                    if (!folder) break;
                    parts.push(folder.name);
                    currentPid = folder.pid || '0';
                }
                return parts.reverse();
            };

            let allNames: string[] = [];
            for (const [groupPid, groupFiles] of groupedFiles.entries()) {
                const pathParts = resolveSharePath(groupPid);
                const destinationFid = await ensurePathFid(pathParts);
                const result = await attemptSave(groupFiles, groupPid, destinationFid);
                if (!result.success) {
                    return result;
                }
                if (result.names && result.names.length > 0) {
                    allNames = allNames.concat(result.names);
                }
            }

            return { success: true, message: '夸克转存成功', names: allNames };
        } catch (error: any) {
            logger.error('[CloudStorageService] Quark transfer exception', { error });
            return { success: false, message: `夸克转存异常: ${error.message}`, errorType: 'system' };
        }
    }
}
