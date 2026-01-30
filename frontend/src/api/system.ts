import request from './request';

export const getSettings = () => request.get('/settings');
export const updateSettings = (data: any) => request.post('/settings', data);

export const getCloudAccounts = () => request.get('/settings/cloud-accounts');
export const updateCloudAccount = (data: any) => request.post('/settings/cloud-accounts', data);

export const searchPansou = (q: string, refresh?: boolean) => request.get<any, any[]>('/search', { params: { q, refresh: refresh ? true : undefined } });

export const saveToCloud = (data: { shareUrl: string, type: string, mediaName: string }) => 
  request.post<any, { message: string }>('/transfer/save', data);

export const syncToNas = (data: { srcDir: string, names: string[], dstDir?: string }) => 
  request.post('/transfer/sync', data);
