/**
 * POST /api/auth/login
 *
 * Authenticates a user with email + password.
 * Handles brute-force protection, 2FA bypass, and token issuance.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import LoginAttempt from "@/lib/db/models/LoginAttempt";
import OtpVerification from "@/lib/db/models/OtpVerification";
import {
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  getSession,
} from "@/lib/auth";
import { generateOtp, hashOtp, sendOtpEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rateLimit";
import { loginSchema } from "@/lib/validations";
import type { ApiResponse, User as UserShape } from "@/types";

const ROUTE = "POST /api/auth/login";
const OTP_TTL_MS = 10 * 60 * 1000;
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 60 * 1000; // 1 minute

interface LoginSuccess {
  accessToken: string;
  user: UserShape;
}
interface LoginRequires2FA {
  requiresTwoFactor: boolean;
  email: string;
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Validation failed";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: firstError, error: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const { email, password } = parsed.data;

  // ── 2. IP extraction ──────────────────────────────────────────────────────
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  // ── 3. IP-based rate limit (10 / minute) ─────────────────────────────────
  const rateResult = checkRateLimit(`login:${ip}`, LOGIN_MAX, LOGIN_WINDOW_MS);
  if (!rateResult.allowed) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Too many login attempts. Please wait and try again.",
        error: "RATE_LIMITED",
      },
      { status: 429 }
    );
  }

  try {
    await connectDB();

    // ── 4. Brute-force lockout check ──────────────────────────────────────
    const locked = await LoginAttempt.isLocked(email, ip);
    if (locked) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message:
            "Account temporarily locked due to too many failed attempts. Please try again in 30 minutes.",
          error: "ACCOUNT_LOCKED",
        },
        { status: 429 }
      );
    }

    // ── 5. Find user (generic error to prevent enumeration) ───────────────
    const user = await User.findOne({ email });
    if (!user) {
      await LoginAttempt.increment(email, ip);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Invalid email or password.",
          error: "INVALID_CREDENTIALS",
        },
        { status: 401 }
      );
    }

    // ── 6. Check email verification ───────────────────────────────────────
    if (!user.isVerified) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Please verify your email address before logging in.",
          error: "EMAIL_NOT_VERIFIED",
        },
        { status: 403 }
      );
    }

    // ── 7. Verify password ────────────────────────────────────────────────
    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      await LoginAttempt.increment(email, ip);
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: "Invalid email or password.",
          error: "INVALID_CREDENTIALS",
        },
        { status: 401 }
      );
    }

    // ── 8. Reset failed attempts + update login metadata ─────────────────
    await LoginAttempt.reset(email, ip);
    await User.updateOne(
      { _id: user._id },
      { $inc: { loginCount: 1 }, $set: { lastLoginAt: new Date() } }
    );

    // ── 9. 2FA flow ───────────────────────────────────────────────────────
    if (user.isTwoFactorEnabled) {
      const otp = generateOtp();
      const otpHash = await hashOtp(otp);

      await OtpVerification.create({
        userId: user._id,
        otpHash,
        type: "two_factor",
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      });

      try {
        await sendOtpEmail(email, user.name, otp, "two_factor");
      } catch (emailErr) {
        console.error(`[${ROUTE}] Failed to send 2FA email:`, emailErr);
      }

      return NextResponse.json<ApiResponse<LoginRequires2FA>>(
        {
          success: true,
          message: "Two-factor authentication required.",
          data: { requiresTwoFactor: true, email },
        },
        { status: 200 }
      );
    }

    // ── 10. Issue tokens ──────────────────────────────────────────────────
    const accessToken = generateAccessToken(
      user._id.toString(),
      user.email,
      user.role
    );
    const refreshToken = generateRefreshToken(user._id.toString());

    const safeUser = user.toSafeObject();
    const res = NextResponse.json<ApiResponse<LoginSuccess>>(
      {
        success: true,
        message: "Login successful.",
        data: { accessToken, user: safeUser },
      },
      { status: 200 }
    );
    setRefreshTokenCookie(res, refreshToken);

    // ── 11. Open session ──────────────────────────────────────────────────
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
        message: "Login failed. Please try again.",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
