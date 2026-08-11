/**
 * POST /api/auth/verify-otp
 *
 * Validates a 6-digit OTP, marks it used, upgrades user.isVerified,
 * issues access + refresh tokens, sets httpOnly cookie, and opens session.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import OtpVerification from "@/lib/db/models/OtpVerification";
import {
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  getSession,
} from "@/lib/auth";
import { otpSchema } from "@/lib/validations";
import type { ApiResponse, User as UserShape } from "@/types";

const ROUTE = "POST /api/auth/verify-otp";

// Extend the base otpSchema with the OTP type field
const verifyOtpSchema = otpSchema.extend({
  type: z.enum(["register", "reset", "two_factor"]),
});

interface VerifyOtpData {
  accessToken: string;
  user: UserShape;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Parse + validate ───────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Invalid JSON body", error: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const parsed = verifyOtpSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: firstError, error: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const { email, otp, type } = parsed.data;

  try {
    await connectDB();

    // ── 2. Find user ──────────────────────────────────────────────────────
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Invalid or expired code.", error: "INVALID_OTP" },
        { status: 400 }
      );
    }

    // ── 3. Find active OTP record ─────────────────────────────────────────
    const otpRecord = await OtpVerification.findOne({
      userId: user._id,
      type,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Invalid or expired code. Please request a new one.",
          error: "INVALID_OTP",
        },
        { status: 400 }
      );
    }

    // ── 4. Compare OTP ────────────────────────────────────────────────────
    const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValid) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Incorrect code. Please try again.", error: "INVALID_OTP" },
        { status: 400 }
      );
    }

    // ── 5. Mark OTP as used ───────────────────────────────────────────────
    otpRecord.used = true;
    await otpRecord.save();

    // ── 6. Verify user if this is a registration OTP ──────────────────────
    if (type === "register") {
      user.isVerified = true;
      await user.save();
    }

    // ── 7. Issue tokens ───────────────────────────────────────────────────
    const accessToken = generateAccessToken(
      user._id.toString(),
      user.email,
      user.role
    );
    const refreshToken = generateRefreshToken(user._id.toString());

    // ── 8. Build response with refresh token cookie ───────────────────────
    const safeUser = user.toSafeObject();
    const res = NextResponse.json<ApiResponse<VerifyOtpData>>(
      {
        success: true,
        message: "Verification successful.",
        data: { accessToken, user: safeUser },
      },
      { status: 200 }
    );
    setRefreshTokenCookie(res, refreshToken);

    // ── 9. Open iron-session ──────────────────────────────────────────────
    try {
      const session = await getSession();
      session.isLoggedIn = true;
      session.userId = user._id.toString();
      session.email = user.email;
      session.name = user.name;
      session.role = user.role;
      session.accessToken = accessToken;
      await session.save();
    } catch (sessionErr) {
      console.error(`[${ROUTE}] Session save failed:`, sessionErr);
    }

    return res;
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Verification failed. Please try again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
