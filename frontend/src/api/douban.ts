import request from './request';

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

export interface DoubanListResponse {
  items: DoubanMedia[];
  rawCount: number;
}

const normalizeListResponse = (response: unknown): DoubanListResponse => {
  if (Array.isArray(response)) {
    return { items: response, rawCount: response.length };
  }
  if (response && typeof response === 'object') {
    const items = Array.isArray((response as { items?: DoubanMedia[] }).items) ? (response as { items: DoubanMedia[] }).items : [];
    const rawCount = typeof (response as { rawCount?: number }).rawCount === 'number'
      ? (response as { rawCount: number }).rawCount
      : items.length;
    return { items, rawCount };
  }
  return { items: [], rawCount: 0 };
};

export const getPopular = async (type: string = 'movie', start = 0, count = 20, sub_type: string = '', category: string = ''): Promise<DoubanListResponse> => {
  const response = await request.get('/douban/popular', { params: { type, start, count, sub_type, category } });
  return normalizeListResponse(response);
};

export const searchDouban = (q: string, start = 0, count = 20): Promise<DoubanMedia[]> => {
  return request.get('/douban/search', { params: { q, start, count } });
};

export const getDetail = (type: string, id: string): Promise<DoubanMedia> => {
  return request.get(`/douban/detail/${type}/${id}`);
};

export const getCharts = (): Promise<{ 
  weekly: DoubanMedia[], 
  new: DoubanMedia[],
  tvChinese: DoubanMedia[],
  tvGlobal: DoubanMedia[]
}> => {
  return request.get('/douban/charts');
};

export const getTopList = (params: {
  type: string;
  interval_id: string;
  start?: number;
  count?: number;
}): Promise<DoubanMedia[]> => {
  return request.get('/douban/top-list', { params });
};

export const getRecommendations = async (params: {
  kind: string;
  category?: string;
  format?: string;
  region?: string;
  year?: string;
  platform?: string;
  sort?: string;
  start?: number;
  count?: number;
}): Promise<DoubanListResponse> => {
  const response = await request.get('/douban/recommendations', { params });
  return normalizeListResponse(response);
};
