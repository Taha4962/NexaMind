/**
 * NexaMind Frontend — Authentication Helpers
 *
 * Provides:
 *   • JWT generation and verification (access + refresh tokens)
 *   • Refresh-token httpOnly cookie helpers (NextResponse-based)
 *   • iron-session wrapper for App Router route handlers
 *   • Client-side token decode / expiry utilities
 *
 * Exports used by middleware.ts: SessionData, sessionOptions, defaultSession
 */

import jwt, { type JwtPayload } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionOptions } from "iron-session";
import type { TokenPayload } from "@/types";

// ══════════════════════════════════════════
// iron-session Configuration
// ══════════════════════════════════════════

/**
 * iron-session configuration for encrypted session cookies.
 *
 * The session stores the user's authentication state including
 * access token, refresh token status, and basic user info.
 */
export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ??
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

// ══════════════════════════════════════════
// iron-session App Router Wrapper
// ══════════════════════════════════════════

/**
 * Get an iron-session instance for use inside Next.js App Router
 * Route Handlers and Server Actions.
 *
 * Call session.save() after mutating, session.destroy() on logout.
 */
export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

// ══════════════════════════════════════════
// JWT — Access Token
// ══════════════════════════════════════════

/**
 * Sign a short-lived JWT access token (15 min).
 * Includes a unique `jti` claim for blacklisting on logout.
 */
export function generateAccessToken(
  userId: string,
  email: string,
  role: string
): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET environment variable is not set");

  return jwt.sign({ userId, email, role, jti: randomUUID() }, secret, {
    expiresIn: "15m",
  });
}

/**
 * Verify a JWT access token.
 * @returns Decoded JwtPayload or null on any error (expired, tampered, missing secret).
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) return null;
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "string") return null;
    return decoded;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════
// JWT — Refresh Token
// ══════════════════════════════════════════

/**
 * Sign a long-lived JWT refresh token (7 days).
 * Includes a unique `jti` claim for rotation-based blacklisting.
 */
export function generateRefreshToken(userId: string): string {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET environment variable is not set");

  return jwt.sign({ userId, jti: randomUUID() }, secret, { expiresIn: "7d" });
}

/**
 * Verify a JWT refresh token.
 * @returns Decoded JwtPayload or null on any error.
 */
export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) return null;
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "string") return null;
    return decoded;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════
// Refresh Token Cookie Helpers
// ══════════════════════════════════════════

const REFRESH_COOKIE_NAME = "nexamind_refresh_token";
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

/**
 * Set the refresh token as a secure httpOnly cookie on a NextResponse.
 * The cookie is scoped to /api/auth to minimise surface area.
 */
export function setRefreshTokenCookie(res: NextResponse, token: string): void {
  res.cookies.set(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SEVEN_DAYS_SECONDS,
    path: "/api/auth",
  });
}

/**
 * Clear the refresh token cookie (sets maxAge: 0).
 */
export function clearRefreshTokenCookie(res: NextResponse): void {
  res.cookies.set(REFRESH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/api/auth",
  });
}

// ══════════════════════════════════════════
// Client-Side Token Utilities
// ══════════════════════════════════════════

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
    ) as Record<string, unknown>;

    return {
      userId:
        typeof decoded["user_id"] === "string"
          ? decoded["user_id"]
          : typeof decoded["userId"] === "string"
            ? decoded["userId"]
            : "",
      email: typeof decoded["email"] === "string" ? decoded["email"] : "",
      role: typeof decoded["role"] === "string" ? decoded["role"] : "user",
      exp: typeof decoded["exp"] === "number" ? decoded["exp"] : undefined,
      iat: typeof decoded["iat"] === "number" ? decoded["iat"] : undefined,
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
  if (!payload?.exp) return true;

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
  if (!payload?.exp) return 0;

  const currentTime = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - currentTime;
  return Math.max(0, remaining);
}
