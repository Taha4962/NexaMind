/**
 * POST /api/auth/refresh
 *
 * Rotates the refresh token:
 *  1. Verifies the current refresh token
 *  2. Checks it isn't revoked
 *  3. Blacklists the old token (by JTI)
 *  4. Issues a new access token + refresh token
 *  5. Sets the new refresh token cookie
 */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import RevokedToken from "@/lib/db/models/RevokedToken";
import {
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
} from "@/lib/auth";
import type { ApiResponse } from "@/types";

const ROUTE = "POST /api/auth/refresh";
const REFRESH_COOKIE = "nexamind_refresh_token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Read refresh token from cookie ─────────────────────────────────────
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value ?? null;
  if (!refreshToken) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "No refresh token provided.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // ── 2. Verify signature + expiry ──────────────────────────────────────────
  const payload = verifyRefreshToken(refreshToken);
  if (
    !payload ||
    typeof payload.jti !== "string" ||
    typeof payload.userId !== "string" ||
    !payload.exp
  ) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Invalid or expired session.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    // ── 3. Check revocation list ──────────────────────────────────────────
    const revoked = await RevokedToken.findOne({ jti: payload.jti }).lean();
    if (revoked) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Session has been revoked. Please log in again.",
          error: "TOKEN_REVOKED",
        },
        { status: 401 }
      );
    }

    // ── 4. Load user ──────────────────────────────────────────────────────
    const user = await User.findById(payload.userId);
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "User not found.", error: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // ── 5. Rotate: blacklist old refresh token ────────────────────────────
    try {
      await RevokedToken.create({
        jti: payload.jti,
        userId: new mongoose.Types.ObjectId(payload.userId),
        expiresAt: new Date(payload.exp * 1000),
      });
    } catch {
      // Duplicate insert — token already rotated (replay attack guard)
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Session already refreshed. Please log in again.",
          error: "TOKEN_REVOKED",
        },
        { status: 401 }
      );
    }

    // ── 6. Issue new token pair ───────────────────────────────────────────
    const newAccessToken = generateAccessToken(
      user._id.toString(),
      user.email,
      user.role
    );
    const newRefreshToken = generateRefreshToken(user._id.toString());

    // ── 7. Return new access token + set new refresh cookie ───────────────
    const res = NextResponse.json<ApiResponse<{ accessToken: string }>>(
      {
        success: true,
        message: "Token refreshed.",
        data: { accessToken: newAccessToken },
      },
      { status: 200 }
    );
    setRefreshTokenCookie(res, newRefreshToken);
    return res;
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to refresh session. Please log in again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
