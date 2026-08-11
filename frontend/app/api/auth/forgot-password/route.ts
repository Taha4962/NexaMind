/**
 * POST /api/auth/forgot-password
 *
 * Sends a password-reset OTP to the given email address.
 * ALWAYS returns 200 regardless of whether the email exists
 * to prevent email enumeration attacks.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import OtpVerification from "@/lib/db/models/OtpVerification";
import { generateOtp, hashOtp, sendOtpEmail } from "@/lib/email";
import { forgotPasswordSchema } from "@/lib/validations";
import type { ApiResponse } from "@/types";

const ROUTE = "POST /api/auth/forgot-password";
const OTP_TTL_MS = 10 * 60 * 1000;
const GENERIC_MESSAGE = "If that email exists, a reset code was sent.";

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

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: firstError, error: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const { email } = parsed.data;

  try {
    await connectDB();

    // ── 2. Look up user (silently) ────────────────────────────────────────
    const user = await User.findOne({ email });

    // ── 3. If user exists, generate and send OTP ──────────────────────────
    if (user) {
      const otp = generateOtp();
      const otpHash = await hashOtp(otp);

      await OtpVerification.create({
        userId: user._id,
        otpHash,
        type: "reset",
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      });

      try {
        await sendOtpEmail(email, user.name, otp, "reset");
      } catch (emailErr) {
        console.error(`[${ROUTE}] Failed to send reset email to ${email}:`, emailErr);
      }
    }

    // ── 4. Always return 200 — no enumeration signal ──────────────────────
    return NextResponse.json<ApiResponse<never>>(
      { success: true, message: GENERIC_MESSAGE },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    // Still return 200 to avoid enumeration via timing/error differences
    return NextResponse.json<ApiResponse<never>>(
      { success: true, message: GENERIC_MESSAGE },
      { status: 200 }
    );
  }
}
