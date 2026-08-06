import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { apiConfig } from '../config/api';
import { normalizeAxiosError } from '../utils/api-error';
import { tokenStore } from './token-store';
import { refreshAccessToken, handleSessionExpired, SessionExpiredError } from './auth-session';

class ApiClient {
  private client: AxiosInstance;
  private readonly publicAuthPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/verify-2fa-login',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
    '/auth/resend-verification',
    '/auth/validate-invite',
    '/public/',
  ];

  constructor() {
    this.client = axios.create({
      baseURL: apiConfig.baseUrl,
      timeout: apiConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        // For multipart uploads, DROP the default 'application/json' content-type
        // so axios sets 'multipart/form-data; boundary=…' itself. Forcing JSON
        // strips the boundary, the server parses zero files, and every upload
        // fails with "No image uploaded" / "Could not upload image".
        if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
          delete config.headers['Content-Type'];
          delete config.headers['content-type'];
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        normalizeAxiosError(error);
        const originalRequest = error.config;
        const requestUrl = String(originalRequest?.url || '').toLowerCase();
        const hasAccessToken = Boolean(this.getToken());
        const isPublicAuthRequest = this.publicAuthPaths.some((path) => requestUrl.includes(path));

        // 401 → renew the access token once and replay the request. The refresh
        // itself is single-flight and shared app-wide (see auth-session), so a
        // burst of simultaneous 401s produces ONE /auth/refresh.
        if (error.response?.status === 401 && !originalRequest._retry && hasAccessToken && !isPublicAuthRequest) {
          originalRequest._retry = true;
          try {
            const newToken = await refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            // ONLY an explicit rejection of the refresh token ends the session.
            // A transient failure (offline, timeout, 5xx, 429) must not log the
            // user out — this is what used to boot people mid-video-call. Their
            // tokens stay put and auth-session retries in the background; this
            // one request just fails and the caller's next poll recovers.
            if (refreshError instanceof SessionExpiredError) handleSessionExpired();
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private getToken(): string | null {
    return tokenStore.getToken();
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.post(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.put(url, data, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.patch(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.delete(url, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
