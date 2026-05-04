/**
 * POST /api/auth/change-password
 *
 * Changes the authenticated user's password.
 * Rotates all refresh tokens by generating a new token pair —
 * effectively logging out all other devices.
 * Requires a valid access token.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import RevokedToken from "@/lib/db/models/RevokedToken";
import {
  verifyAccessToken,
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  getSession,
} from "@/lib/auth";
import { PASSWORD_REGEX } from "@/lib/validations";
import type { ApiResponse } from "@/types";

const ROUTE = "POST /api/auth/change-password";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters")
      .regex(
        PASSWORD_REGEX,
        "Password must contain at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Verify access token ────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Authentication required.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const payload = verifyAccessToken(token);
  if (
    !payload ||
    typeof payload.userId !== "string" ||
    typeof payload.jti !== "string" ||
    !payload.exp
  ) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Invalid or expired token.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // ── 2. Parse + validate body ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Invalid JSON body.", error: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: firstError, error: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  try {
    await connectDB();

    // ── 3. Check access token not revoked ─────────────────────────────────
    const revoked = await RevokedToken.findOne({ jti: payload.jti }).lean();
    if (revoked) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Token has been revoked.", error: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // ── 4. Load user ──────────────────────────────────────────────────────
    const user = await User.findById(payload.userId);
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "User not found.", error: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // ── 5. Verify current password ────────────────────────────────────────
    if (!user.passwordHash) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "This account uses Google sign-in and does not have a password.",
          error: "NO_PASSWORD",
        },
        { status: 400 }
      );
    }

    const currentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!currentPasswordValid) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Current password is incorrect.",
          error: "INVALID_CREDENTIALS",
        },
        { status: 401 }
      );
    }

    // ── 6. Hash and save new password ─────────────────────────────────────
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    // ── 7. Revoke current access token (add to blacklist) ─────────────────
    try {
      await RevokedToken.create({
        jti: payload.jti,
        userId: new mongoose.Types.ObjectId(payload.userId),
        expiresAt: new Date(payload.exp * 1000),
      });
    } catch {
      // Already revoked — safe to ignore
    }

    // ── 8. Issue fresh token pair ─────────────────────────────────────────
    const newAccessToken = generateAccessToken(
      user._id.toString(),
      user.email,
      user.role
    );
    const newRefreshToken = generateRefreshToken(user._id.toString());

    // ── 9. Update session ─────────────────────────────────────────────────
    try {
      const session = await getSession();
      session.accessToken = newAccessToken;
      await session.save();
    } catch (sessionErr) {
      console.error(`[${ROUTE}] Session update failed:`, sessionErr);
    }

    const res = NextResponse.json<ApiResponse<{ accessToken: string }>>(
      {
        success: true,
        message: "Password changed. All other sessions have been logged out.",
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
        message: "Failed to change password. Please try again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
