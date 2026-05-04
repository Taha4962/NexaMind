/**
 * POST /api/auth/register
 *
 * Creates a new user account and sends a 6-digit OTP verification email.
 * Does NOT issue tokens — user must verify email via /api/auth/verify-otp.
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import OtpVerification from "@/lib/db/models/OtpVerification";
import LoginAttempt from "@/lib/db/models/LoginAttempt";
import { registerSchema } from "@/lib/validations";
import { generateOtp, hashOtp, sendOtpEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rateLimit";
import type { ApiResponse } from "@/types";

const ROUTE = "POST /api/auth/register";
const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REGISTER_MAX = 5;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Parse + validate body ──────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Invalid JSON body", error: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: firstError, error: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const { name, email, password } = parsed.data;

  // ── 2. IP-based rate limit (5 requests / hour) ────────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const rateResult = checkRateLimit(
    `register:${ip}`,
    REGISTER_MAX,
    REGISTER_WINDOW_MS
  );
  if (!rateResult.allowed) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Too many registration attempts. Please try again later.",
        error: "RATE_LIMITED",
      },
      { status: 429 }
    );
  }

  try {
    await connectDB();

    // ── 3. Brute-force check ────────────────────────────────────────────────
    const locked = await LoginAttempt.isLocked(email, ip);
    if (locked) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Too many attempts. Please try again in 30 minutes.",
          error: "ACCOUNT_LOCKED",
        },
        { status: 429 }
      );
    }

    // ── 4. Duplicate email check ────────────────────────────────────────────
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "An account with this email already exists.",
          error: "EMAIL_CONFLICT",
        },
        { status: 409 }
      );
    }

    // ── 5. Hash password ────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);

    // ── 6. Create user ──────────────────────────────────────────────────────
    const user = await User.create({
      name,
      email,
      passwordHash,
      isVerified: false,
    });

    // ── 7. Generate + hash OTP ──────────────────────────────────────────────
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    // ── 8. Save OTP document ────────────────────────────────────────────────
    await OtpVerification.create({
      userId: user._id,
      otpHash,
      type: "register",
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    // ── 9. Send verification email (non-blocking failure) ───────────────────
    try {
      await sendOtpEmail(email, name, otp, "register");
    } catch (emailErr) {
      console.error(`[${ROUTE}] Failed to send OTP email to ${email}:`, emailErr);
      // Auth flow continues — user can request resend
    }

    return NextResponse.json<ApiResponse<{ userId: string; email: string }>>(
      {
        success: true,
        message: "Check your email for your verification code.",
        data: { userId: user._id.toString(), email },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Registration failed. Please try again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
