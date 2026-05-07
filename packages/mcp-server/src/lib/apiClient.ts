/**
 * HTTP Client to FindA.Sale Backend
 *
 * Wraps axios and handles connection to backend API.
 * Reads BACKEND_URL from env (defaults to http://localhost:3001).
 */

import axios, { AxiosInstance } from 'axios';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export const api: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Log all requests in dev mode
if (process.env.NODE_ENV !== 'production') {
  api.interceptors.request.use((config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  });

  api.interceptors.response.use(
    (response) => {
      console.log(`[API] Response ${response.status} for ${response.config.url}`);
      return response;
    },
    (error) => {
      console.error(
        `[API] Error ${error.response?.status} for ${error.config?.url}:`,
        error.response?.data?.message || error.message
      );
      return Promise.reject(error);
    }
  );
}

export async function fetchJSON<T>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  params?: Record<string, any>,
  data?: Record<string, any>
): Promise<T> {
  try {
    const config: any = {};
    if (params) {
      config.params = params;
    }

    let response;
    switch (method) {
      case 'get':
        response = await api.get<T>(path, config);
        break;
      case 'post':
        response = await api.post<T>(path, data, config);
        break;
      case 'put':
        response = await api.put<T>(path, data, config);
        break;
      case 'patch':
        response = await api.patch<T>(path, data, config);
        break;
      case 'delete':
        response = await api.delete<T>(path, config);
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Not found: ${path}`);
    }
    if (error.response?.status === 400) {
      throw new Error(`Bad request: ${error.response.data?.message || error.message}`);
    }
    if (error.response?.status >= 500) {
      throw new Error(`Server error: ${error.response.data?.message || error.message}`);
    }
    throw error;
  }
}

export default api;
