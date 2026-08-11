/**
 * POST /api/auth/reset-password
 *
 * Resets a user's password using a valid OTP code.
 * Invalidates the OTP and forces re-login by destroying the session.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import OtpVerification from "@/lib/db/models/OtpVerification";
import { getSession } from "@/lib/auth";
import { resetPasswordSchema } from "@/lib/validations";
import type { ApiResponse } from "@/types";

const ROUTE = "POST /api/auth/reset-password";

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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: firstError, error: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const { email, otp, newPassword } = parsed.data;

  try {
    await connectDB();

    // ── 2. Find user ──────────────────────────────────────────────────────
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Invalid or expired reset code.",
          error: "INVALID_OTP",
        },
        { status: 400 }
      );
    }

    // ── 3. Find active reset OTP ──────────────────────────────────────────
    const otpRecord = await OtpVerification.findOne({
      userId: user._id,
      type: "reset",
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Invalid or expired reset code. Please request a new one.",
          error: "INVALID_OTP",
        },
        { status: 400 }
      );
    }

    // ── 4. Verify OTP ─────────────────────────────────────────────────────
    const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValid) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Incorrect reset code.",
          error: "INVALID_OTP",
        },
        { status: 400 }
      );
    }

    // ── 5. Hash new password ──────────────────────────────────────────────
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // ── 6. Update user password ───────────────────────────────────────────
    user.passwordHash = newPasswordHash;
    await user.save();

    // ── 7. Mark OTP as used ───────────────────────────────────────────────
    otpRecord.used = true;
    await otpRecord.save();

    // ── 8. Destroy current session (force re-login) ───────────────────────
    // Active refresh tokens will expire naturally within 7 days.
    // For immediate multi-device revocation, a dedicated refresh token
    // store would be needed (planned for a future step).
    try {
      const session = await getSession();
      await session.destroy();
    } catch (sessionErr) {
      console.error(`[${ROUTE}] Session destroy failed:`, sessionErr);
    }

    return NextResponse.json<ApiResponse<never>>(
      {
        success: true,
        message: "Password updated. Please log in.",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to reset password. Please try again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
