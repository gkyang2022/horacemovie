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

export const getPopular = (type: string = 'movie', start = 0, count = 20): Promise<DoubanMedia[]> => {
  return request.get('/douban/popular', { params: { type, start, count } });
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

export const getRecommendations = (params: {
  kind: string;
  category?: string;
  format?: string;
  region?: string;
  year?: string;
  platform?: string;
  sort?: string;
  start?: number;
  count?: number;
}): Promise<DoubanMedia[]> => {
  return request.get('/douban/recommendations', { params });
};
