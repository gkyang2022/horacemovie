import axios from 'axios';
import { getDb } from '../db/index.js';

export class OpenListService {
    private static instance: OpenListService;

    private constructor() {}

    public static getInstance(): OpenListService {
        if (!OpenListService.instance) {
            OpenListService.instance = new OpenListService();
        }
        return OpenListService.instance;
    }

    private async getConfig() {
        const db = getDb();
        const settings = await db.all('SELECT key, value FROM settings WHERE key LIKE "openlist_%"');
        const config: any = {};
        settings.forEach(s => {
            config[s.key] = s.value;
        });
        return config;
    }

    async getToken(): Promise<string | null> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const username = config['openlist_username'];
        const password = config['openlist_password'];

        if (!baseUrl || !username || !password) {
            console.error('OpenList config incomplete');
            return null;
        }

        try {
            const response = await axios.post(`${baseUrl}/api/auth/login`, {
                username,
                password
            }, {
                timeout: 30000
            });

            if (response.data && response.data.code === 200) {
                return response.data.data.token;
            }
            return null;
        } catch (error: any) {
            console.error('OpenList login error:', error.message);
            return null;
        }
    }

    async listFiles(path: string, refresh: boolean = false): Promise<any[]> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const token = await this.getToken();

        if (!baseUrl || !token) return [];

        try {
            const response = await axios.post(`${baseUrl}/api/fs/list`, {
                path,
                refresh
            }, {
                headers: {
                    'Authorization': token
                },
                timeout: 30000
            });

            if (response.data && response.data.code === 200) {
                return response.data.data.content || [];
            }
            return [];
        } catch (error: any) {
            console.error('OpenList list error:', error.message);
            return [];
        }
    }

    async copyFile(srcDir: string, names: string[], dstDir?: string): Promise<{ taskId?: string, error?: string }> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const targetDir = dstDir || config['openlist_default_path'] || '/';
        const token = await this.getToken();

        if (!baseUrl || !token) return { error: 'OpenList 配置不完整或无法获取 Token' };

        let finalNames = names;
        if (!finalNames || finalNames.length === 0) {
            console.log(`[OpenListService] No names provided for copy from ${srcDir}, fetching all files...`);
            const files = await this.listFiles(srcDir);
            finalNames = files.map(f => f.name);
        }

        if (finalNames.length === 0) {
            console.warn(`[OpenListService] No files found in ${srcDir} to copy`);
            return { error: '未找到可复制的文件' };
        }

        try {
            // 在复制前先等待 3 秒并调用一次 listFiles，强制 OpenList 刷新/列出该目录，解决立即复制报 object not found 的问题
            console.log(`[OpenListService] Waiting 3s and pre-listing directory ${srcDir} with refresh:true to ensure resources are visible...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            await this.listFiles(srcDir, true).catch(e => console.warn(`[OpenListService] Pre-list failed for ${srcDir}: ${e.message}`));

            console.log(`[OpenListService] Copying ${finalNames.length} items from ${srcDir} to ${targetDir}`);
            const response = await axios.post(`${baseUrl}/api/fs/copy`, {
                src_dir: srcDir,
                dst_dir: targetDir,
                names: finalNames
            }, {
                headers: {
                    'Authorization': token
                },
                timeout: 30000
            });

            if (response.data && response.data.code !== 200) {
                const errMsg = response.data.message || '未知错误';
                console.warn(`[OpenListService] Copy failed: ${errMsg}`);
                return { error: errMsg };
            }

            // 处理新的返回结构: data.tasks[0].id
            const taskId = response.data?.data?.tasks?.[0]?.id || response.data?.data?.task_id;
            if (!taskId) {
                return { error: 'OpenList 未返回任务 ID' };
            }

            return { taskId };
        } catch (error: any) {
            const errMsg = error.response?.data?.message || error.message;
            console.error('OpenList copy error:', errMsg);
            return { error: errMsg };
        }
    }

    async getTasks(type: 'undone' | 'done'): Promise<any[]> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const token = await this.getToken();

        if (!baseUrl || !token) return [];

        try {
            const response = await axios.get(`${baseUrl}/api/task/copy/${type}`, {
                headers: {
                    'Authorization': token
                },
                timeout: 30000
            });

            if (response.data && response.data.code === 200) {
                return response.data.data || [];
            }
            return [];
        } catch (error: any) {
            console.error(`OpenList get ${type} tasks error:`, error.message);
            return [];
        }
    }

    async taskOperation(op: 'cancel' | 'delete' | 'retry', tid: string): Promise<boolean> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const token = await this.getToken();

        if (!baseUrl || !token) return false;

        try {
            const response = await axios.post(`${baseUrl}/api/task/copy/${op}?tid=${tid}`, {}, {
                headers: {
                    'Authorization': token
                },
                timeout: 30000
            });

            return response.data && response.data.code === 200;
        } catch (error: any) {
            console.error(`OpenList task ${op} error:`, error.message);
            return false;
        }
    }

    async batchTaskOperation(op: string, tids: string[]): Promise<any> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const token = await this.getToken();

        if (!baseUrl || !token) return null;

        try {
            const response = await axios.post(`${baseUrl}/api/task/copy/${op}`, tids, {
                headers: {
                    'Authorization': token
                },
                timeout: 30000
            });

            return response.data;
        } catch (error: any) {
            console.error(`OpenList batch task ${op} error:`, error.message);
            return null;
        }
    }

    async fullTaskOperation(type: 'clear_done' | 'clear_succeeded' | 'retry_failed'): Promise<any> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const token = await this.getToken();

        if (!baseUrl || !token) return null;

        try {
            const response = await axios.post(`${baseUrl}/api/task/copy/${type}`, {}, {
                headers: {
                    'Authorization': token
                },
                timeout: 30000
            });

            return response.data;
        } catch (error: any) {
            console.error(`OpenList full task ${type} error:`, error.message);
            return null;
        }
    }
}
