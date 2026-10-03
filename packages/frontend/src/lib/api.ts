import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const api = axios.create({
  baseURL,
  withCredentials: true,
  // axios automatically echoes the XSRF-TOKEN cookie back as X-XSRF-TOKEN
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string> | null = null;

/** Uses a bare axios instance (no interceptors) to avoid loops. */
async function refreshAccessToken(): Promise<string> {
  const bare = axios.create({ baseURL, withCredentials: true });
  const res = await bare.post('/auth/refresh');
  const token: string = res.data.accessToken;
  useAuthStore.getState().setAccessToken(token);
  return token;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthEndpoint = original?.url?.includes('/auth/');
    const status = error.response?.status;

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const token = await refreshPromise;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().logout();
        if (!window.location.pathname.startsWith('/login')) {
          window.location.assign('/login');
        }
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { error?: { message?: string } })?.error?.message;
    return msg ?? err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
