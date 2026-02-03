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
    console.error(`[API Response Error] ${error.config?.url}:`, errorMsg);
    ElMessage.error(errorMsg);
    return Promise.reject(error);
  }
);

export default service;
