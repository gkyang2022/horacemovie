import axios from 'axios';
import dotenv from 'dotenv';
import NodeCache from 'node-cache';

dotenv.config();

const DOUBAN_API_HOST = 'https://frodo.douban.com/api/v2';
const API_KEY = '0ac44ae016490db2204ce0a042db2916'; // Key used for MicroMessenger referer

const CACHE_TTL = 12 * 60 * 60; // 12 hours in seconds

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
    rating_count?: number;
    pubdate?: string[];
    languages?: string[];
    countries?: string[];
    directors?: string[];
    actors?: string[];
    durations?: string[];
    url?: string;
    episodes_count?: number;
}

export class DoubanService {
    private static instance: DoubanService;
    private imageProxy: string;
    private cache: NodeCache;

    private constructor() {
        this.imageProxy = process.env.IMAGE_PROXY_BASE || 'https://img.doubanio.cmliussss.com/';
        this.cache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 600 });
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

    async getPopular(type: 'movie' | 'tv' | 'variety' | 'animation' | 'documentary' | 'showing' | 'soon' | 'movie_latest' | 'movie_score' | 'movie_unpopular' | 'tv_hot' | 'tv_latest' | 'tv_score' = 'movie', start = 0, count = 20): Promise<DoubanMedia[]> {
        const cacheKey = `popular_${type}_${start}_${count}`;
        const cachedData = this.cache.get<DoubanMedia[]>(cacheKey);
        if (cachedData) {
            console.log(`[DoubanService] Returning cached popular ${type}`);
            return cachedData;
        }

        try {
            console.log(`[DoubanService] Fetching popular ${type}s (start: ${start}, count: ${count})`);
            let collectionId = 'movie_hot_gaia';
            let mediaType: string = 'movie';
            
            switch (type) {
                case 'tv': 
                case 'tv_hot':
                    collectionId = 'tv_hot'; 
                    mediaType = 'tv';
                    break;
                case 'tv_latest':
                    collectionId = 'tv_domestic_hot'; // Approximating latest with domestic hot
                    mediaType = 'tv';
                    break;
                case 'tv_score':
                    collectionId = 'tv_chinese_best_weekly';
                    mediaType = 'tv';
                    break;
                case 'variety': 
                    collectionId = 'tv_variety_show'; 
                    mediaType = 'tv';
                    break;
                case 'animation': 
                    collectionId = 'tv_animation'; 
                    mediaType = 'tv';
                    break;
                case 'documentary': 
                    collectionId = 'tv_documentary'; 
                    mediaType = 'tv';
                    break;
                case 'showing': 
                    collectionId = 'movie_showing'; 
                    mediaType = 'movie';
                    break;
                case 'soon': 
                    collectionId = 'movie_soon'; 
                    mediaType = 'movie';
                    break;
                case 'movie_latest':
                    collectionId = 'movie_latest_hot';
                    mediaType = 'movie';
                    break;
                case 'movie_score':
                    collectionId = 'movie_score';
                    mediaType = 'movie';
                    break;
                case 'movie_unpopular':
                    collectionId = 'movie_unpopular';
                    mediaType = 'movie';
                    break;
                default: 
                    collectionId = 'movie_hot_gaia';
                    mediaType = 'movie';
            }
            
            const result = await this.getCollectionItems(collectionId, mediaType, start, count);
            if (result && result.length > 0) {
                this.cache.set(cacheKey, result);
            }
            return result;
        } catch (error: any) {
            console.error(`[DoubanService] Error fetching popular ${type}s:`, error.message);
            return [];
        }
    }

    private async getCollectionItems(collectionId: string, type: string, start = 0, count = 20): Promise<DoubanMedia[]> {
        try {
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
                },
                timeout: 10000
            });

            const items = response.data.subject_collection_items || [];
            return items.map((item: any) => ({
                id: item.id,
                title: item.title,
                type: type,
                rating: item.rating ? item.rating.value : 0,
                poster: this.getProxyPoster(item.cover?.url || item.pic?.normal || item.cover_url),
                year: item.year || '',
                card_subtitle: item.card_subtitle || item.info,
                pubdate: item.pubdate || (item.release_date ? [item.release_date] : [])
            }));
        } catch (error: any) {
            console.error(`[DoubanService] Error fetching collection ${collectionId}:`, error.response?.data || error.message);
            return [];
        }
    }

    async getCharts(): Promise<{ 
      weekly: DoubanMedia[], 
      new: DoubanMedia[],
      tvChinese: DoubanMedia[],
      tvGlobal: DoubanMedia[]
    }> {
    const cacheKey = 'charts_data';
    const cachedData = this.cache.get<{
      weekly: DoubanMedia[], 
      new: DoubanMedia[],
      tvChinese: DoubanMedia[],
      tvGlobal: DoubanMedia[]
    }>(cacheKey);
    
    if (cachedData) {
      console.log('[DoubanService] Returning cached charts data');
      return cachedData;
    }

    console.log('[DoubanService] Fetching charts: weekly, new movies, and TV shows');
    const [weekly, newMovies, tvChinese, tvGlobal] = await Promise.all([
      this.getCollectionItems('movie_weekly_best', 'movie', 0, 10),
      this.getCollectionItems('movie_hot', 'movie', 0, 10),
      this.getCollectionItems('tv_chinese_best_weekly', 'tv', 0, 10),
      this.getCollectionItems('tv_global_best_weekly', 'tv', 0, 10)
    ]);
    
    const result = { weekly, new: newMovies, tvChinese, tvGlobal };
    
    // 只有当至少有一个列表不为空时才缓存，确保不会缓存完全错误的状态
    if (weekly.length > 0 || newMovies.length > 0 || tvChinese.length > 0 || tvGlobal.length > 0) {
      this.cache.set(cacheKey, result);
    }
    return result;
  }

    async search(query: string, start = 0, count = 20): Promise<DoubanMedia[]> {
        try {
            console.log(`[DoubanService] Searching Douban with query: "${query}" (start: ${start}, count: ${count})`);
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
                },
                timeout: 10000
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

            console.log(`[DoubanService] Search returned ${rawItems.length} raw items for "${query}"`);

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

            console.log(`[DoubanService] Processed ${items.length} valid items for "${query}"`);

            return items.map((item: any) => ({
                id: item.id,
                title: item.title,
                type: item.type,
                rating: item.rating ? item.rating.value : 0,
                poster: this.getProxyPoster(item.cover?.url || item.pic?.normal || item.cover_url || item.pic?.large),
                year: item.year || '',
                card_subtitle: item.card_subtitle || item.info,
                pubdate: item.pubdate || (item.release_date ? [item.release_date] : [])
            }));
        } catch (error: any) {
            console.error(`[DoubanService] Search error for "${query}":`, error.response?.data || error.message);
            return [];
        }
    }

    async getDetail(id: string, type: string): Promise<DoubanMedia | null> {
        // 映射类型到豆瓣 API 真实的资源路径
        // 豆瓣纪录片、综艺、动画在详情接口中通常被归类为 'tv' 或 'movie'
        let effectiveType = type;
        if (['variety', 'animation', 'documentary'].includes(type)) {
            effectiveType = 'tv';
        }

        const cacheKey = `detail_${effectiveType}_${id}`;
        const cachedData = this.cache.get<DoubanMedia>(cacheKey);
        if (cachedData) {
            console.log(`[DoubanService] Returning cached detail for ${effectiveType} (ID: ${id})`);
            return cachedData;
        }

        try {
            console.log(`[DoubanService] Fetching detail for ${effectiveType} (ID: ${id})`);
            const url = `${DOUBAN_API_HOST}/${effectiveType}/${id}`;
            const response = await axios.get(url, {
                params: {
                    apiKey: API_KEY
                },
                headers: {
                    'User-Agent': 'MicroMessenger/',
                    'Referer': 'https://servicewechat.com/wx2f9b06c1de1ccfca/91/page-frame.html'
                },
                timeout: 10000
            });

            const item = response.data;
            console.log(`[DoubanService] Successfully fetched detail for: ${item.title}`);
            
            const result = {
                id: item.id,
                title: item.title,
                type: type, // 保持原始业务类型
                rating: item.rating ? item.rating.value : 0,
                rating_count: item.rating ? item.rating.count : 0,
                poster: this.getProxyPoster(item.cover_url || item.cover?.url || item.pic?.normal),
                year: item.year || '',
                genres: item.genres || [],
                description: item.intro || item.description || '',
                pubdate: item.pubdate || [],
                languages: item.languages || [],
                countries: item.countries || [],
                directors: (item.directors || []).map((d: any) => d.name),
                actors: (item.actors || []).map((a: any) => a.name),
                durations: item.durations || [],
                url: item.url || `https://movie.douban.com/subject/${item.id}/`,
                episodes_count: item.episodes_count || 0
            };
 
            if (result && result.title) {
                this.cache.set(cacheKey, result);
            }
            return result;
        } catch (error: any) {
            // 如果映射为 tv 失败，尝试作为 movie 再请求一次（部分纪录片可能是电影长片）
            if (effectiveType === 'tv' && error.response?.status === 404) {
                console.log(`[DoubanService] Detail not found as TV, retrying as movie (ID: ${id})`);
                return this.getDetail(id, 'movie');
            }
            console.error(`[DoubanService] Error fetching detail for ${id}:`, error.response?.data || error.message);
            return null;
        }
    }

    async getRecommendations(kind: string, categories: any = {}, sort: string = 'T', start: number = 0, count: number = 20, tags: string = '', score_range: string = '0,10'): Promise<DoubanMedia[]> {
        const cacheKey = `recommendations_${kind}_${JSON.stringify(categories)}_${sort}_${start}_${count}_${tags}_${score_range}`;
        const cachedData = this.cache.get<DoubanMedia[]>(cacheKey);
        if (cachedData) {
            console.log(`[DoubanService] Returning cached recommendations for ${kind}`);
            return cachedData;
        }

        try {
            console.log(`[DoubanService] Fetching recommendations for ${kind} (start: ${start}, count: ${count}, categories: ${JSON.stringify(categories)}, tags: ${tags})`);
            const url = `https://m.douban.com/rexxar/api/v2/${kind}/recommend`;
            const response = await axios.get(url, {
                params: {
                    refresh: 0,
                    start,
                    count,
                    selected_categories: JSON.stringify(categories),
                    uncollect: false,
                    sort,
                    tags,
                    score_range,
                    ck: ''
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/04.1',
                    'Referer': `https://m.douban.com/${kind}/explore`
                },
                timeout: 10000
            });

            const items = response.data.items || [];
            const result = items.map((item: any) => ({
                id: item.id,
                title: item.title,
                type: item.type || (kind === 'movie' ? 'movie' : 'tv'),
                rating: item.rating ? item.rating.value : 0,
                poster: this.getProxyPoster(item.cover?.url || item.pic?.normal || item.cover_url),
                year: item.year || '',
                card_subtitle: item.card_subtitle || item.info,
                pubdate: item.pubdate || (item.release_date ? [item.release_date] : [])
            }));

            if (result && result.length > 0) {
                this.cache.set(cacheKey, result);
            }
            return result;
        } catch (error: any) {
            console.error(`[DoubanService] Error fetching recommendations:`, error.response?.data || error.message);
            return [];
        }
    }
}
