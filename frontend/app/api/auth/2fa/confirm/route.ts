/**
 * POST /api/auth/2fa/confirm
 *
 * Step 2 of 2FA enablement: verifies the OTP sent by /2fa/enable
 * and sets isTwoFactorEnabled = true on the user account.
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

const ROUTE = "POST /api/auth/2fa/confirm";

const confirmSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(OTP_REGEX, "OTP must contain only digits"),
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

  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: firstError, error: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const { otp } = parsed.data;

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

    // ── 5. Find pending 2FA OTP ───────────────────────────────────────────
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
          message: "No pending 2FA setup found. Please request a new code.",
          error: "INVALID_OTP",
        },
        { status: 400 }
      );
    }

    // ── 6. Verify OTP ─────────────────────────────────────────────────────
    const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValid) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Incorrect code. Please try again.", error: "INVALID_OTP" },
        { status: 400 }
      );
    }

    // ── 7. Mark OTP used + enable 2FA ────────────────────────────────────
    otpRecord.used = true;
    await otpRecord.save();

    user.isTwoFactorEnabled = true;
    await user.save();

    return NextResponse.json<ApiResponse<never>>(
      { success: true, message: "Two-factor authentication enabled." },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to confirm 2FA. Please try again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
