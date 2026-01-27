import axios from 'axios';
import { getDb } from '../db/index.js';

export interface SearchResource {
    name: string;
    url: string;
    size?: string;
    source: string;
    time?: string;
}

export class PansouService {
    private static instance: PansouService;

    private constructor() {}

    public static getInstance(): PansouService {
        if (!PansouService.instance) {
            PansouService.instance = new PansouService();
        }
        return PansouService.instance;
    }

    async search(keyword: string): Promise<SearchResource[]> {
        const db = getDb();
        const pansouUrlSetting = await db.get('SELECT value FROM settings WHERE key = ?', 'pansou_url');
        
        if (!pansouUrlSetting || !pansouUrlSetting.value) {
            throw new Error('Pansou API URL not configured');
        }

        let baseUrl = pansouUrlSetting.value.trim();
        // Ensure baseUrl doesn't end with a slash
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        
        // Append /api/search if not present
        const apiUrl = baseUrl.includes('/api/search') ? baseUrl : `${baseUrl}/api/search`;

        try {
            console.log(`Searching Pansou at: ${apiUrl} with kw: ${keyword}`);
            // According to fish2018/pansou documentation, POST /api/search with {"kw": "..."} is preferred.
            // Adding cloud_types to filter for specific cloud providers.
            const response = await axios.post(apiUrl, {
                kw: keyword,
                cloud_types: ['115', 'quark', 'aliyun', 'baidu', 'uc', 'pikpak'] // Added requested cloud_types
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15000 
            });

            console.log('Pansou response status:', response.status);
            
            let items: any[] = [];
            const respBody = response.data;

            // Handle fish2018/pansou response structure: { code: 0, message: 'success', data: { merged_by_type: { ... } } }
            if (respBody && respBody.data) {
                const data = respBody.data;
                if (data.merged_by_type && typeof data.merged_by_type === 'object') {
                    // Flatten the object: { "115": [], "aliyun": [] } -> []
                    Object.values(data.merged_by_type).forEach((val: any) => {
                        if (Array.isArray(val)) items.push(...val);
                    });
                } else if (Array.isArray(data.results)) {
                    items = data.results;
                } else if (Array.isArray(data)) {
                    items = data;
                }
            } else if (Array.isArray(respBody)) {
                items = respBody;
            } else if (respBody && respBody.results) {
                items = Array.isArray(respBody.results) ? respBody.results : Object.values(respBody.results).flat();
            }

            console.log(`Pansou found ${items.length} items`);

            return items.map((item: any) => ({
                name: item.title || item.name || item.note || '未知文件名',
                url: item.link || item.url || '',
                size: item.size || '未知',
                source: item.sitename || item.source || item.from || '未知',
                time: item.time || item.date || item.datetime || ''
            }));
        } catch (error: any) {
            console.error('Pansou search error details:', error.response?.data || error.message);
            return [];
        }
    }
}
