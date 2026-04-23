/**
 * NexaMind Frontend — Typed Axios Instance
 *
 * Configures an Axios instance with base URL, interceptors for
 * JWT token injection, token refresh on 401, and error normalization.
 * All frontend API calls go through Next.js API routes (never directly
 * to the Python backend).
 */

import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import type { ApiResponse } from "@/types";

/** Base URL for Next.js API routes */
const BASE_URL = "/api";

/**
 * Configured Axios instance for all API requests.
 *
 * Features:
 * - Base URL set to /api (Next.js API routes)
 * - Automatic JSON content type
 * - JWT access token injection via interceptor
 * - 401 response triggers token refresh
 * - Consistent error response format
 */
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

/**
 * Request interceptor: injects the JWT access token from memory.
 *
 * The access token is stored in memory (not localStorage) for security.
 * It's retrieved from the auth state and attached to every request.
 */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("nexamind_access_token")
        : null;

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor: handles token refresh on 401 and error normalization.
 *
 * On 401 responses, attempts to refresh the access token using the
 * httpOnly refresh token cookie. If refresh fails, redirects to sign-in.
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<never>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      originalRequest.url !== "/auth/refresh"
    ) {
      originalRequest._retry = true;

      try {
        const refreshResponse = await api.post<
          ApiResponse<{ accessToken: string }>
        >("/auth/refresh");
        const newToken = refreshResponse.data.data?.accessToken;

        if (newToken && typeof window !== "undefined") {
          window.sessionStorage.setItem("nexamind_access_token", newToken);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }

          return api(originalRequest);
        }
      } catch {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem("nexamind_access_token");
          window.location.href = "/sign-in";
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
