/**
 * NexaMind Frontend — Session Management Hook
 *
 * Provides server-side session management utilities via iron-session.
 * Used in API routes and server components to read/write session data.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResponse, User } from "@/types";
import api from "@/lib/api";
import { API_ROUTES } from "@/lib/constants";

/** Session state interface */
interface SessionState {
  /** Whether the session is loading */
  isLoading: boolean;
  /** Whether the user has an active session */
  isLoggedIn: boolean;
  /** User data from the session */
  user: User | null;
}

/**
 * Hook for managing the client-side view of the server session.
 *
 * Fetches the current session state from the session API endpoint
 * and provides methods to refresh it.
 *
 * @returns Session state with user data and refresh method
 */
export function useSession(): SessionState & {
  /** Refresh the session from the server */
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<SessionState>({
    isLoading: true,
    isLoggedIn: false,
    user: null,
  });

  const fetchSession = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));
      const response = await api.get<ApiResponse<{ user: User }>>(
        API_ROUTES.AUTH.SESSION
      );

      if (response.data.success && response.data.data) {
        setState({
          isLoading: false,
          isLoggedIn: true,
          user: response.data.data.user,
        });
      } else {
        setState({
          isLoading: false,
          isLoggedIn: false,
          user: null,
        });
      }
    } catch {
      setState({
        isLoading: false,
        isLoggedIn: false,
        user: null,
      });
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    ...state,
    refresh: fetchSession,
  };
}
