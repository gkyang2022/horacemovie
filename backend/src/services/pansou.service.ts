import axios from 'axios';
import { getDb } from '../db/index.js';
import { logger } from '../logger.js';

export interface SearchResource {
    name: string;
    url: string;
    size?: string;
    source: string;
    time?: string;
    type: string; // Added cloud type (115, quark, etc.)
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

    async search(keyword: string, refresh = false): Promise<SearchResource[]> {
        const db = getDb();
        const pansouUrlSetting = await db.get('SELECT value FROM settings WHERE key = ?', 'pansou_url');
        
        if (!pansouUrlSetting || !pansouUrlSetting.value) {
            logger.error('[PansouService] Pansou API URL not configured in settings');
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
            const trimmedKeyword = keyword.slice(0, 80);
            logger.info('[PansouService] Searching Pansou', { apiUrl, keyword: trimmedKeyword, refresh });
            // According to fish2018/pansou documentation, POST /api/search with {"kw": "..."} is preferred.
            // Adding cloud_types to filter for specific cloud providers.
            const response = await axios.post(apiUrl, {
                kw: keyword,
                cloud_types: ['115', 'quark'],
                refresh: refresh ? true : undefined
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15000 
            });

            logger.debug('[PansouService] Response status', { status: response.status });
            
            let items: SearchResource[] = [];
            const respBody = response.data;

            // Handle fish2018/pansou response structure: { code: 0, message: 'success', data: { merged_by_type: { ... } } }
            if (respBody && typeof respBody.code !== 'undefined' && respBody.code !== 0) {
                throw new Error(respBody.message || 'API 返回错误');
            }

            if (respBody && respBody.data) {
                const data = respBody.data;
                const buildUrlWithPassword = (url: string, password: string, type: string) => {
                    if (!url || !password) return url;
                    const normalizedType = (type || '').toLowerCase();
                    const key = normalizedType === '115' ? 'password' : normalizedType === 'quark' ? 'pwd' : '';
                    if (!key) return url;
                    if (new RegExp(`[?&]${key}=`, 'i').test(url)) return url;
                    const separator = url.includes('?') ? '&' : '?';
                    return `${url}${separator}${key}=${encodeURIComponent(password)}`;
                };
                if (data.merged_by_type && typeof data.merged_by_type === 'object') {
                    // Flatten the object: { "115": [], "quark": [] } -> [] with type preserved
                    Object.entries(data.merged_by_type).forEach(([type, val]: [string, any]) => {
                        if (Array.isArray(val)) {
                            const mapped = val.map((item: any) => ({
                                name: item.title || item.name || item.note || '未知文件名',
                                url: buildUrlWithPassword(item.link || item.url || '', item.password || '', type),
                                size: item.size || '未知',
                                source: item.sitename || item.source || item.from || '未知',
                                time: item.time || item.date || item.datetime || '',
                                type: type // Preserve the cloud type from the key
                            }));
                            items.push(...mapped);
                        }
                    });
                } else if (Array.isArray(data.results)) {
                    items = data.results.map((item: any) => ({
                        name: item.title || item.name || item.note || '未知文件名',
                        url: buildUrlWithPassword(item.link || item.url || '', item.password || '', item.cloud_type || item.type || item.cloudType || ''),
                        size: item.size || '未知',
                        source: item.sitename || item.source || item.from || '未知',
                        time: item.time || item.date || item.datetime || '',
                        type: 'unknown'
                    }));
                }
            }

            logger.info('[PansouService] Parsed items', { keyword: trimmedKeyword, count: items.length });
            return items;
        } catch (error: any) {
            const errorDetail = error.response?.data?.message || error.response?.data?.error || error.message;
            logger.error('[PansouService] Search error', { keyword: keyword.slice(0, 80), error: errorDetail });
            throw new Error(`盘搜 API 查询失败: ${errorDetail}`);
        }
    }
}
