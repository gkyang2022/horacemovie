import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const DOUBAN_API_HOST = 'https://frodo.douban.com/api/v2';
const API_KEY = '0ac44ae016490db2204ce0a042db2916'; // Key used for MicroMessenger referer

export interface DoubanMedia {
    id: string;
    title: string;
    type: string;
    rating: number;
    poster: string;
    year: string;
    card_subtitle?: string;
    genres?: string[];
    description?: string;
}

export class DoubanService {
    private static instance: DoubanService;
    private imageProxy: string;

    private constructor() {
        this.imageProxy = process.env.IMAGE_PROXY_BASE || 'https://img.doubanio.cmliussss.com/';
    }

    public static getInstance(): DoubanService {
        if (!DoubanService.instance) {
            DoubanService.instance = new DoubanService();
        }
        return DoubanService.instance;
    }

    private getProxyPoster(url: string): string {
        if (!url) return '';
        
        // The user wants cmliussss source. 
        // Based on typical worker proxies for douban:
        // We replace the douban domain with the proxy domain.
        
        let processedUrl = url;
        // Handle doubanio domains (img.doubanio.com, img9.doubanio.com, qnmob3.doubanio.com etc)
        if (url.includes('doubanio.com')) {
            // Replace any sub-domain of doubanio.com with the proxy
            // Regex matches: https://(anything).doubanio.com/
            processedUrl = url.replace(/^https?:\/\/[^/]*doubanio\.com\//, this.imageProxy);
        } else {
            // Fallback for other URLs
            const cleanUrl = url.replace(/^https?:\/\//, '');
            processedUrl = `${this.imageProxy}${cleanUrl}`;
        }

        // Clean up double slashes if any (except https://)
        return processedUrl.replace(/([^:])\/\//g, '$1/');
    }

    async getPopular(type: 'movie' | 'tv' = 'movie', start = 0, count = 20): Promise<DoubanMedia[]> {
        try {
            const collectionId = type === 'movie' ? 'movie_hot_gaia' : 'tv_hot';
            const url = `${DOUBAN_API_HOST}/subject_collection/${collectionId}/items`;
            const response = await axios.get(url, {
                params: {
                    apiKey: API_KEY,
                    start,
                    count
                },
                headers: {
                    'User-Agent': 'MicroMessenger/',
                    'Referer': 'https://servicewechat.com/wx2f9b06c1de1ccfca/91/page-frame.html'
                }
            });

            const items = response.data.subject_collection_items || [];
            return items.map((item: any) => ({
                id: item.id,
                title: item.title,
                type: type,
                rating: item.rating ? item.rating.value : 0,
                poster: this.getProxyPoster(item.cover?.url || item.pic?.normal || item.cover_url),
                year: item.year || '',
                card_subtitle: item.card_subtitle || item.info
            }));
        } catch (error: any) {
            console.error('Error fetching popular from Douban:', error.response?.data || error.message);
            return [];
        }
    }

    async search(query: string, start = 0, count = 20): Promise<DoubanMedia[]> {
        try {
            const url = `${DOUBAN_API_HOST}/search/subjects`;
            const response = await axios.get(url, {
                params: {
                    apiKey: API_KEY,
                    q: query,
                    start,
                    count
                },
                headers: {
                    'User-Agent': 'MicroMessenger/',
                    'Referer': 'https://servicewechat.com/wx2f9b06c1de1ccfca/91/page-frame.html'
                }
            });

            const data = response.data;
            let rawItems: any[] = [];
            if (data.subjects && Array.isArray(data.subjects.items)) {
                rawItems = data.subjects.items;
            } else if (Array.isArray(data.subjects)) {
                rawItems = data.subjects;
            } else if (Array.isArray(data.items)) {
                rawItems = data.items;
            }

            if (rawItems.length === 0) {
                return [];
            }

            const items = rawItems.map((item: any) => {
                let target = item;
                if (item.target && (item.layout === 'subject' || item.target_type === 'movie' || item.target_type === 'tv')) {
                    target = item.target;
                }
                // Ensure id is present
                if (!target.id && item.target_id) {
                    target.id = item.target_id;
                }
                if (!target.title && item.title) {
                    target.title = item.title;
                }
                // Ensure type is present, default to movie if not specified
                if (!target.type) {
                    target.type = item.target_type || item.type || 'movie';
                }
                return target;
            }).filter((item: any) => item && (item.id || item.target_id) && (item.title));

            return items.map((item: any) => ({
                id: item.id,
                title: item.title,
                type: item.type,
                rating: item.rating ? item.rating.value : 0,
                poster: this.getProxyPoster(item.cover?.url || item.pic?.normal || item.cover_url || item.pic?.large),
                year: item.year || '',
                card_subtitle: item.card_subtitle || item.info
            }));
        } catch (error: any) {
            console.error('Error searching Douban:', error.response?.data || error.message);
            return [];
        }
    }

    async getDetail(id: string, type: string): Promise<DoubanMedia | null> {
        try {
            const url = `${DOUBAN_API_HOST}/${type}/${id}`;
            const response = await axios.get(url, {
                params: {
                    apiKey: API_KEY
                },
                headers: {
                    'User-Agent': 'MicroMessenger/',
                    'Referer': 'https://servicewechat.com/wx2f9b06c1de1ccfca/91/page-frame.html'
                }
            });

            const item = response.data;
            return {
                id: item.id,
                title: item.title,
                type: type,
                rating: item.rating ? item.rating.value : 0,
                poster: this.getProxyPoster(item.cover_url || item.cover?.url || item.pic?.normal),
                year: item.year || '',
                genres: item.genres || [],
                description: item.intro || item.description || ''
            };
        } catch (error) {
            console.error('Error fetching detail from Douban:', error);
            return null;
        }
    }
}
