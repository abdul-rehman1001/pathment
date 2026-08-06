import axios, { AxiosInstance } from 'axios';
import { normalizeAxiosError } from '../utils/api-error';
import { tokenStore } from './token-store';
import { refreshAccessToken, handleSessionExpired, SessionExpiredError } from './auth-session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Create axios instance
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_URL,
});

// Request interceptor - add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = tokenStore.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 errors
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    normalizeAxiosError(error);
    const originalRequest = error.config;
    const requestUrl = String(originalRequest?.url || '').toLowerCase();
    const hasAccessToken = Boolean(tokenStore.getToken());
    const isPublicAuthRequest = [
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/auth/verify-2fa-login',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/verify-email',
      '/auth/resend-verification',
      '/auth/validate-invite',
    ].some((path) => requestUrl.includes(path));

    // 401 → renew once and replay, sharing the app-wide single-flight refresh
    // with api-client. Never sniff the message text to decide whether to try:
    // any 401 on an authenticated request is worth one refresh attempt, and the
    // refresh result (not a string match) decides whether the session is over.
    if (error.response?.status === 401 && !originalRequest._retry && hasAccessToken && !isPublicAuthRequest) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // Only a refresh the SERVER rejected ends the session. Offline / 5xx /
        // 429 keep the user logged in — auth-session retries in the background.
        if (refreshError instanceof SessionExpiredError) handleSessionExpired();
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
