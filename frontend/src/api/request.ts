import axios from 'axios';
import { ElMessage } from 'element-plus';

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000
});

service.interceptors.request.use(
  (config) => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.id) {
        config.headers['X-User-Id'] = user.id;
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
    const errorMsg = error.response?.data?.error || error.message || '网络错误';
    const requestUrl = error.config?.url || '';
    let displayMsg = errorMsg;
    if (
      requestUrl.includes('/transfer/save') &&
      (errorMsg.includes('夸克分享 Token 失败') || errorMsg.includes('stoken') || errorMsg.includes('sharepage/token'))
    ) {
      displayMsg = '夸克分享链接已失效或被取消，请确认提取码并重新获取分享链接';
    }
    console.error(`[API Response Error] ${requestUrl}:`, errorMsg);
    ElMessage.error(displayMsg);
    return Promise.reject(error);
  }
);

export default service;
