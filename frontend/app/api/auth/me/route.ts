/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 * Requires a valid JWT access token in the Authorization header.
 * Verifies the JTI is not in the revocation list.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import RevokedToken from "@/lib/db/models/RevokedToken";
import { verifyAccessToken } from "@/lib/auth";
import type { ApiResponse, User as UserShape } from "@/types";

const ROUTE = "GET /api/auth/me";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── 1. Extract Bearer token ───────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Authentication required.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // ── 2. Verify JWT ─────────────────────────────────────────────────────────
  const payload = verifyAccessToken(token);
  if (
    !payload ||
    typeof payload.userId !== "string" ||
    typeof payload.jti !== "string"
  ) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Invalid or expired token.", error: "UNAUTHORIZED" },
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
          message: "Token has been revoked. Please log in again.",
          error: "TOKEN_REVOKED",
        },
        { status: 401 }
      );
    }

    // ── 4. Load user ──────────────────────────────────────────────────────
    const user = await User.findById(payload.userId);
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "User not found.", error: "NOT_FOUND" },
        { status: 401 }
      );
    }

    return NextResponse.json<ApiResponse<{ user: UserShape }>>(
      {
        success: true,
        message: "User retrieved.",
        data: { user: user.toSafeObject() },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to retrieve user.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
