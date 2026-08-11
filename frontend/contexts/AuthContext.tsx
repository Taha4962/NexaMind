/**
 * NexaMind — Auth Context
 *
 * Provides authentication state and methods to the application.
 * Manages access token securely in memory, handles automatic token
 * refreshing, and syncs user state.
 */

"use client";

import React, {
  createContext,
  useReducer,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import axios from "axios";
import { LoginInput } from "@/lib/validations";
import { User as UserType } from "@/types";

export interface AuthState {
  isAuthenticated: boolean;
  user: UserType | null;
  isLoading: boolean;
  accessToken: string | null;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginInput & { requiresTwoFactor?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setAuth: (token: string, user: UserType) => void;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  isLoading: true,
  accessToken: null,
};

type AuthAction =
  | { type: "LOGIN_SUCCESS"; payload: { accessToken: string; user: UserType } }
  | { type: "LOGOUT" }
  | { type: "REFRESH_SUCCESS"; payload: { accessToken: string } }
  | { type: "SET_LOADING"; payload: boolean };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN_SUCCESS":
      return {
        ...state,
        isAuthenticated: true,
        accessToken: action.payload.accessToken,
        user: action.payload.user,
        isLoading: false,
      };
    case "LOGOUT":
      return {
        ...state,
        isAuthenticated: false,
        accessToken: null,
        user: null,
        isLoading: false,
      };
    case "REFRESH_SUCCESS":
      return {
        ...state,
        isAuthenticated: true,
        accessToken: action.payload.accessToken,
        isLoading: false,
      };
    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.payload,
      };
    default:
      return state;
  }
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // ── Token Refresh Logic ─────────────────────────────────────────────────
  const refreshToken = useCallback(async () => {
    try {
      // The refresh route uses the httpOnly cookie automatically
      const res = await axios.post("/api/auth/refresh");
      if (res.data.success && res.data.data?.accessToken) {
        dispatch({
          type: "REFRESH_SUCCESS",
          payload: { accessToken: res.data.data.accessToken },
        });

        // Also fetch user profile if we don't have it
        try {
          const userRes = await axios.get("/api/auth/me", {
            headers: { Authorization: `Bearer ${res.data.data.accessToken}` },
          });
          if (userRes.data.success && userRes.data.data?.user) {
            dispatch({
              type: "LOGIN_SUCCESS",
              payload: {
                accessToken: res.data.data.accessToken,
                user: userRes.data.data.user,
              },
            });
          }
        } catch (err) {
          // Silent fail on user fetch, auth context will just have null user
        }
      } else {
        dispatch({ type: "LOGOUT" });
      }
    } catch (error) {
      dispatch({ type: "LOGOUT" });
    }
  }, []);

  // ── Initial Mount & Refresh Loop ────────────────────────────────────────
  useEffect(() => {
    // Attempt initial refresh to restore session
    refreshToken();

    // Set up auto-refresh (every 14 minutes, since token is 15m)
    // 14 * 60 * 1000 = 840000 ms
    const refreshInterval = setInterval(() => {
      if (state.isAuthenticated) {
        refreshToken();
      }
    }, 14 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [refreshToken, state.isAuthenticated]);

  // ── Auth Methods ────────────────────────────────────────────────────────
  const login = async () => {
    // Note: The actual API call for login happens in the component.
    // The component will then call `setAuth` with the result.
    // This wrapper is provided for consistency if needed.
  };

  const logout = async () => {
    try {
      await axios.post("/api/auth/logout");
    } finally {
      dispatch({ type: "LOGOUT" });
      window.location.href = "/sign-in";
    }
  };

  const setAuth = (accessToken: string, user: UserType) => {
    dispatch({ type: "LOGIN_SUCCESS", payload: { accessToken, user } });
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        refreshToken,
        setAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
