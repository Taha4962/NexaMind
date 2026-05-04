/**
 * POST /api/auth/2fa/disable
 *
 * Disables 2FA on the user's account.
 * Requires either current password (email users) or a valid OTP (Google-only users).
 * Requires a valid access token.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import OtpVerification from "@/lib/db/models/OtpVerification";
import RevokedToken from "@/lib/db/models/RevokedToken";
import { verifyAccessToken } from "@/lib/auth";
import { OTP_REGEX } from "@/lib/validations";
import type { ApiResponse } from "@/types";

const ROUTE = "POST /api/auth/2fa/disable";

// Password-based disable (email/password users)
const disableWithPasswordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

// OTP-based disable (Google-only users without passwordHash)
const disableWithOtpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(OTP_REGEX, "OTP must contain only digits"),
});

const disableSchema = z.union([disableWithPasswordSchema, disableWithOtpSchema]);

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
    typeof payload.jti !== "string"
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

  const parsed = disableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Provide either 'password' or 'otp' to disable 2FA.",
        error: "VALIDATION_ERROR",
      },
      { status: 422 }
    );
  }

  try {
    await connectDB();

    // ── 3. Check token not revoked ────────────────────────────────────────
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

    if (!user.isTwoFactorEnabled) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Two-factor authentication is not enabled.",
          error: "NOT_ENABLED",
        },
        { status: 409 }
      );
    }

    // ── 5a. Email/password user: verify password ──────────────────────────
    if (user.passwordHash) {
      const bodyData = parsed.data as { password?: string; otp?: string };
      if (!bodyData.password) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            message: "Current password is required to disable 2FA.",
            error: "PASSWORD_REQUIRED",
          },
          { status: 400 }
        );
      }

      const passwordValid = await bcrypt.compare(bodyData.password, user.passwordHash);
      if (!passwordValid) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, message: "Incorrect password.", error: "INVALID_CREDENTIALS" },
          { status: 401 }
        );
      }
    } else {
      // ── 5b. Google-only user: verify OTP ─────────────────────────────
      const bodyData = parsed.data as { password?: string; otp?: string };
      if (!bodyData.otp) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            message: "A verification code is required to disable 2FA for Google accounts.",
            error: "OTP_REQUIRED",
          },
          { status: 400 }
        );
      }

      const otpRecord = await OtpVerification.findOne({
        userId: user._id,
        type: "two_factor",
        used: false,
        expiresAt: { $gt: new Date() },
      });

      if (!otpRecord) {
        return NextResponse.json<ApiResponse<never>>(
          {
            success: false,
            message: "No valid code found. Please request a new one.",
            error: "INVALID_OTP",
          },
          { status: 400 }
        );
      }

      const otpValid = await bcrypt.compare(bodyData.otp, otpRecord.otpHash);
      if (!otpValid) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, message: "Incorrect code.", error: "INVALID_OTP" },
          { status: 400 }
        );
      }

      otpRecord.used = true;
      await otpRecord.save();
    }

    // ── 6. Disable 2FA ────────────────────────────────────────────────────
    user.isTwoFactorEnabled = false;
    await user.save();

    return NextResponse.json<ApiResponse<never>>(
      { success: true, message: "Two-factor authentication disabled." },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to disable 2FA. Please try again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
