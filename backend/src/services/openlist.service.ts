import axios from 'axios';
import { getDb, decryptSettingValue } from '../db/index.js';
import { logger } from '../logger.js';

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
            config[s.key] = decryptSettingValue(s.key, s.value);
        });
        return config;
    }

    async getToken(): Promise<string | null> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const username = config['openlist_username'];
        const password = config['openlist_password'];

        if (!baseUrl || !username || !password) {
            logger.warn('[OpenListService] Config incomplete');
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
            logger.error('[OpenListService] Login error', { error });
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
            logger.error('[OpenListService] List error', { error });
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
            logger.info('[OpenListService] No names provided, fetching all files', { srcDir });
            const files = await this.listFiles(srcDir);
            finalNames = files.map(f => f.name);
        }

        if (finalNames.length === 0) {
            logger.warn('[OpenListService] No files found to copy', { srcDir });
            return { error: '未找到可复制的文件' };
        }

        // 按目录分组文件（处理子目录情况）
        const filesByDir = new Map<string, string[]>();
        for (const fullName of finalNames) {
            const slashIndex = fullName.lastIndexOf('/');
            if (slashIndex > 0) {
                const subDir = fullName.substring(0, slashIndex);
                const fileName = fullName.substring(slashIndex + 1);
                const key = `${srcDir}/${subDir}`;
                const list = filesByDir.get(key);
                if (list) {
                    list.push(fileName);
                } else {
                    filesByDir.set(key, [fileName]);
                }
            } else {
                const list = filesByDir.get(srcDir);
                if (list) {
                    list.push(fullName);
                } else {
                    filesByDir.set(srcDir, [fullName]);
                }
            }
        }

        let allTaskIds: string[] = [];
        let lastError: string | undefined;

        for (const [effectiveSrcDir, dirNames] of filesByDir.entries()) {
            try {
                logger.debug('[OpenListService] Pre-listing directory with refresh', { srcDir: effectiveSrcDir, delayMs: 3000 });
                await new Promise(resolve => setTimeout(resolve, 3000));
                await this.listFiles(effectiveSrcDir, true).catch(e => logger.warn('[OpenListService] Pre-list failed', { srcDir: effectiveSrcDir, error: e }));

                // 计算子目录路径，并在目标路径中也添加相同的子目录
                let effectiveDstDir = targetDir;
                if (effectiveSrcDir.startsWith(srcDir) && effectiveSrcDir.length > srcDir.length) {
                    const subPath = effectiveSrcDir.substring(srcDir.length);
                    effectiveDstDir = `${targetDir}${subPath}`;
                }

                logger.info('[OpenListService] Copying items', { count: dirNames.length, srcDir: effectiveSrcDir, dstDir: effectiveDstDir });
                const response = await axios.post(`${baseUrl}/api/fs/copy`, {
                    src_dir: effectiveSrcDir,
                    dst_dir: effectiveDstDir,
                    names: dirNames
                }, {
                    headers: {
                        'Authorization': token
                    },
                    timeout: 30000
                });

                if (response.data && response.data.code !== 200) {
                    const errMsg = response.data.message || '未知错误';
                    logger.warn('[OpenListService] Copy failed', { message: errMsg });
                    lastError = errMsg;
                    continue;
                }

                const taskId = response.data?.data?.tasks?.[0]?.id || response.data?.data?.task_id;
                if (taskId) {
                    allTaskIds.push(taskId);
                }
            } catch (error: any) {
                const errMsg = error.response?.data?.message || error.message;
                logger.error('[OpenListService] Copy error', { error: errMsg });
                lastError = errMsg;
            }
        }

        if (allTaskIds.length === 0) {
            return { error: lastError || '所有同步任务均失败' };
        }

        return { taskId: allTaskIds[0] };
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
            logger.error('[OpenListService] Get tasks error', { type, error });
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
            logger.error('[OpenListService] Task operation error', { op, error });
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
            logger.error('[OpenListService] Batch task operation error', { op, error });
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
            logger.error('[OpenListService] Full task error', { type, error });
            return null;
        }
    }
}
