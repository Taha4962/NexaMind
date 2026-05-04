/**
 * POST /api/auth/2fa/enable
 *
 * Step 1 of 2FA enablement: sends an OTP to the user's email.
 * The user must confirm with POST /api/auth/2fa/confirm to activate 2FA.
 * Requires a valid access token.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import OtpVerification from "@/lib/db/models/OtpVerification";
import RevokedToken from "@/lib/db/models/RevokedToken";
import { verifyAccessToken } from "@/lib/auth";
import { generateOtp, hashOtp, sendOtpEmail } from "@/lib/email";
import type { ApiResponse } from "@/types";

const ROUTE = "POST /api/auth/2fa/enable";
const OTP_TTL_MS = 10 * 60 * 1000;

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

  try {
    await connectDB();

    // ── 2. Check token not revoked ────────────────────────────────────────
    const revoked = await RevokedToken.findOne({ jti: payload.jti }).lean();
    if (revoked) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Token has been revoked.", error: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // ── 3. Load user ──────────────────────────────────────────────────────
    const user = await User.findById(payload.userId);
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "User not found.", error: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // ── 4. Check email is verified ────────────────────────────────────────
    if (!user.isVerified) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Please verify your email address first.",
          error: "EMAIL_NOT_VERIFIED",
        },
        { status: 403 }
      );
    }

    // ── 5. Already enabled guard ──────────────────────────────────────────
    if (user.isTwoFactorEnabled) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Two-factor authentication is already enabled.",
          error: "ALREADY_ENABLED",
        },
        { status: 409 }
      );
    }

    // ── 6. Generate OTP and save ──────────────────────────────────────────
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    await OtpVerification.create({
      userId: user._id,
      otpHash,
      type: "two_factor",
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    // ── 7. Send confirmation email (non-blocking) ─────────────────────────
    try {
      await sendOtpEmail(user.email, user.name, otp, "two_factor");
    } catch (emailErr) {
      console.error(`[${ROUTE}] Failed to send 2FA setup email:`, emailErr);
    }

    return NextResponse.json<ApiResponse<never>>(
      {
        success: true,
        message: "Enter the code sent to your email to confirm 2FA enablement.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to initiate 2FA setup. Please try again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
