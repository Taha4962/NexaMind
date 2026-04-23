/**
 * NexaMind Frontend — Authentication Helpers
 *
 * JWT decoding utilities and iron-session configuration for
 * managing authentication state on the server and client sides.
 */

import type { SessionOptions } from "iron-session";
import type { TokenPayload } from "@/types";

/**
 * iron-session configuration for encrypted session cookies.
 *
 * The session stores the user's authentication state including
 * access token, refresh token status, and basic user info.
 */
export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ||
    "this-is-a-fallback-that-should-never-be-used-in-production-minimum-32-chars",
  cookieName: "nexamind_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days (matches refresh token)
    path: "/",
  },
};

/**
 * Session data interface for iron-session.
 *
 * Extends the iron-session module to include NexaMind session fields.
 */
export interface SessionData {
  /** Whether the user is authenticated */
  isLoggedIn: boolean;
  /** User ID from MongoDB */
  userId: string;
  /** User email address */
  email: string;
  /** User display name */
  name: string;
  /** User role */
  role: string;
  /** JWT access token (stored in session for SSR) */
  accessToken: string;
}

/** Default empty session state */
export const defaultSession: SessionData = {
  isLoggedIn: false,
  userId: "",
  email: "",
  name: "",
  role: "user",
  accessToken: "",
};

/**
 * Decode a JWT token payload without verification.
 *
 * This is used client-side only for reading token claims.
 * Token verification always happens server-side.
 *
 * @param token - The JWT token string to decode
 * @returns Decoded token payload or null if invalid
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    if (!payload) return null;

    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    );

    return {
      userId: decoded.user_id || decoded.userId || "",
      email: decoded.email || "",
      role: decoded.role || "user",
      exp: decoded.exp,
      iat: decoded.iat,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token has expired.
 *
 * @param token - The JWT token string to check
 * @returns True if the token is expired or invalid
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) return true;

  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
}

/**
 * Get the remaining time until token expiration.
 *
 * @param token - The JWT token string
 * @returns Remaining time in seconds, or 0 if expired
 */
export function getTokenTimeRemaining(token: string): number {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) return 0;

  const currentTime = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - currentTime;
  return Math.max(0, remaining);
}
