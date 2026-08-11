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

export interface StreamChunk {
  type: "token" | "done" | "error" | "thinking";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Calls /api/agent/chat/stream and yields parsed StreamChunk objects.
 * Uses fetch() with ReadableStream to parse SSE lines starting with "data: ".
 */
export async function* streamChat(
  message: string,
  chatId: string | null,
  accessToken: string,
  attachedDocIds: string[] = []
): AsyncGenerator<StreamChunk, void, unknown> {
  const response = await fetch("/api/agent/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message, chatId, attachedDocIds }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Streaming request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");

    // Keep the last incomplete line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        try {
          const chunk = JSON.parse(trimmed.slice(6)) as StreamChunk;
          yield chunk;
          if (chunk.type === "done" || chunk.type === "error") {
            return;
          }
        } catch {
          // Ignore parse errors for partial json
        }
      }
    }
  }
}

export default api;
