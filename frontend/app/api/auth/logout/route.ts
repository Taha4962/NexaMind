/**
 * POST /api/auth/logout
 *
 * Revokes both access and refresh tokens by JTI, destroys iron-session,
 * and clears the httpOnly refresh token cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db/mongodb";
import RevokedToken from "@/lib/db/models/RevokedToken";
import {
  verifyAccessToken,
  verifyRefreshToken,
  clearRefreshTokenCookie,
  getSession,
} from "@/lib/auth";
import type { ApiResponse } from "@/types";

const ROUTE = "POST /api/auth/logout";
const REFRESH_COOKIE = "nexamind_refresh_token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const res = NextResponse.json<ApiResponse<never>>(
    { success: true, message: "Logged out successfully." },
    { status: 200 }
  );

  try {
    await connectDB();

    // ── 1. Revoke access token (best-effort) ──────────────────────────────
    const authHeader = request.headers.get("authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (accessToken) {
      const payload = verifyAccessToken(accessToken);
      if (
        payload?.jti &&
        typeof payload.jti === "string" &&
        payload.userId &&
        typeof payload.userId === "string" &&
        payload.exp
      ) {
        try {
          await RevokedToken.create({
            jti: payload.jti,
            userId: new mongoose.Types.ObjectId(payload.userId),
            expiresAt: new Date(payload.exp * 1000),
          });
        } catch {
          // Duplicate jti = already revoked, safe to ignore
        }
      }
    }

    // ── 2. Revoke refresh token (best-effort) ─────────────────────────────
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null;
    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      if (
        payload?.jti &&
        typeof payload.jti === "string" &&
        payload.userId &&
        typeof payload.userId === "string" &&
        payload.exp
      ) {
        try {
          await RevokedToken.create({
            jti: payload.jti,
            userId: new mongoose.Types.ObjectId(payload.userId),
            expiresAt: new Date(payload.exp * 1000),
          });
        } catch {
          // Duplicate — already revoked
        }
      }
    }

    // ── 3. Destroy iron-session ───────────────────────────────────────────
    try {
      const session = await getSession();
      await session.destroy();
    } catch (sessionErr) {
      console.error(`[${ROUTE}] Session destroy failed:`, sessionErr);
    }
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    // Return 200 anyway — client must clear local state regardless
  }

  // ── 4. Clear refresh cookie ───────────────────────────────────────────────
  clearRefreshTokenCookie(res);
  return res;
}
