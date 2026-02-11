import axios from 'axios';
import { ElMessage } from 'element-plus';

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000
});

let refreshPromise: Promise<any> | null = null;

const readStoredUser = () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

const parseExpiresAt = (value: string) => {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
};

const storeUser = (user: any) => {
  localStorage.setItem('user', JSON.stringify(user));
};

const refreshTokenIfNeeded = async () => {
  const user = readStoredUser();
  if (!user || !user.token || !user.token_expires_at) return;
  const expiresAt = parseExpiresAt(user.token_expires_at);
  if (!expiresAt) return;
  const remaining = expiresAt - Date.now();
  if (remaining > 24 * 60 * 60 * 1000) return;
  if (!refreshPromise) {
    refreshPromise = service.post('/auth/refresh')
      .then((data) => {
        storeUser({ ...user, ...data });
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  await refreshPromise;
};

service.interceptors.request.use(
  async (config) => {
    const requestUrl = config.url || '';
    if (!requestUrl.includes('/auth/login') && !requestUrl.includes('/auth/refresh')) {
      try {
        await refreshTokenIfNeeded();
      } catch (error: any) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
    }
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.id) {
        config.headers['X-User-Id'] = user.id;
      }
      if (user.token) {
        config.headers['Authorization'] = `Bearer ${user.token}`;
      }
    }
    if (import.meta.env.DEV) {
      console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.params || config.data || '');
    }
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

service.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log(`[API Response] ${response.config.url}`, response.data);
    }
    return response.data;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const errorMsg = error.response?.data?.error || error.message || '网络错误';
    const errorCode = error.response?.data?.code || '';
    const requestUrl = error.config?.url || '';
    const skipErrorMessage = Boolean((error.config as any)?.skipErrorMessage);
    let displayMsg = errorMsg;
    if (errorCode === 'PANSOU_NOT_CONFIGURED') {
      displayMsg = '未配置盘搜 API，请在设置页填写 pansou_url';
    }
    if (
      requestUrl.includes('/transfer/save') &&
      (errorMsg.includes('夸克分享 Token 失败') || errorMsg.includes('stoken') || errorMsg.includes('sharepage/token'))
    ) {
      displayMsg = '夸克分享链接已失效或被取消，请确认提取码并重新获取分享链接';
    }
    console.error(`[API Response Error] ${requestUrl}:`, errorMsg);
    if (!skipErrorMessage) {
      ElMessage.error(displayMsg);
    }
    return Promise.reject(error);
  }
);

export default service;
