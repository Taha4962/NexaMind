/**
 * NexaMind Frontend — Authentication State Hook
 *
 * Manages client-side authentication state including user data,
 * access token, and loading state. Uses TanStack Query for
 * session data fetching and caching.
 */

"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthState, User, ApiResponse } from "@/types";
import api from "@/lib/api";
import { API_ROUTES, ROUTES } from "@/lib/constants";

/** Query key for auth session */
const AUTH_QUERY_KEY = ["auth", "session"] as const;

/**
 * Hook for managing authentication state.
 *
 * Provides the current user's authentication status, user data,
 * and methods for login/logout operations.
 *
 * @returns AuthState with user data and auth methods
 */
export function useAuth(): AuthState & {
  /** Refresh the auth session */
  refreshSession: () => Promise<void>;
  /** Log out the current user */
  logout: () => Promise<void>;
} {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async (): Promise<{ user: User | null; accessToken: string | null }> => {
      try {
        const response = await api.get<ApiResponse<{ user: User; accessToken: string }>>(
          API_ROUTES.AUTH.SESSION
        );
        if (response.data.success && response.data.data) {
          return {
            user: response.data.data.user,
            accessToken: response.data.data.accessToken,
          };
        }
        return { user: null, accessToken: null };
      } catch {
        return { user: null, accessToken: null };
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
    refetchOnWindowFocus: true,
  });

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await api.post(API_ROUTES.AUTH.LOGOUT);
    } catch {
      // Continue with client-side cleanup even if API call fails
    } finally {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("nexamind_access_token");
        queryClient.setQueryData(AUTH_QUERY_KEY, { user: null, accessToken: null });
        window.location.href = ROUTES.SIGN_IN;
      }
    }
  }, [queryClient]);

  return {
    isAuthenticated: !!data?.user,
    isLoading,
    user: data?.user ?? null,
    accessToken: data?.accessToken ?? null,
    refreshSession,
    logout,
  };
}
