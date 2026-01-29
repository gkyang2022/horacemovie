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

    async listFiles(path: string): Promise<any[]> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const token = await this.getToken();

        if (!baseUrl || !token) return [];

        try {
            const response = await axios.post(`${baseUrl}/api/fs/list`, {
                path
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

    async copyFile(srcDir: string, names: string[], dstDir?: string): Promise<boolean> {
        const config = await this.getConfig();
        const baseUrl = config['openlist_url'];
        const targetDir = dstDir || config['openlist_default_path'] || '/';
        const token = await this.getToken();

        if (!baseUrl || !token) return false;

        let finalNames = names;
        if (!finalNames || finalNames.length === 0) {
            console.log(`[OpenListService] No names provided for copy from ${srcDir}, fetching all files...`);
            const files = await this.listFiles(srcDir);
            finalNames = files.map(f => f.name);
        }

        if (finalNames.length === 0) {
            console.warn(`[OpenListService] No files found in ${srcDir} to copy`);
            return false;
        }

        try {
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
                console.warn(`[OpenListService] Copy failed: ${response.data.message}`);
            }

            return response.data && response.data.code === 200;
        } catch (error: any) {
            console.error('OpenList copy error:', error.message);
            return false;
        }
    }
}
