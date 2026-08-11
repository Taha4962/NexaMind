/**
 * GET /api/auth/google/callback
 *
 * Google OAuth 2.0 callback handler.
 * Exchanges the authorization code for tokens, fetches the Google user
 * profile, then either creates a new user or links to an existing account.
 *
 * On success: redirects to /dashboard with session + cookies set.
 * On any error: redirects to /sign-in?error=<safe_message>.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import OtpVerification from "@/lib/db/models/OtpVerification";
import {
  generateAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  getSession,
} from "@/lib/auth";
import { generateOtp, hashOtp, sendOtpEmail } from "@/lib/email";

const ROUTE = "GET /api/auth/google/callback";
const STATE_COOKIE = "nexamind_oauth_state";
const OTP_TTL_MS = 10 * 60 * 1000;

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

interface GoogleUserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  verified_email: boolean;
}

function errorRedirect(appUrl: string, message: string): NextResponse {
  const url = new URL("/sign-in", appUrl);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url.toString());
}

function clearStateCookie(res: NextResponse): void {
  res.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/api/auth/google",
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(`[${ROUTE}] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET`);
    return errorRedirect(appUrl, "oauth_misconfigured");
  }

  // ── 1. Read query params ──────────────────────────────────────────────────
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  // User denied consent
  if (oauthError) {
    return errorRedirect(appUrl, "access_denied");
  }

  if (!code || !state) {
    return errorRedirect(appUrl, "invalid_callback");
  }

  // ── 2. Verify CSRF state ──────────────────────────────────────────────────
  const storedState = request.cookies.get(STATE_COOKIE)?.value ?? null;
  if (!storedState || storedState !== state) {
    console.warn(`[${ROUTE}] State mismatch — possible CSRF attack`);
    return errorRedirect(appUrl, "state_mismatch");
  }

  try {
    // ── 3. Exchange code for tokens ─────────────────────────────────────────
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error(`[${ROUTE}] Token exchange failed:`, errBody);
      return errorRedirect(appUrl, "token_exchange_failed");
    }

    const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

    // ── 4. Fetch Google user profile ────────────────────────────────────────
    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    if (!profileRes.ok) {
      console.error(`[${ROUTE}] Profile fetch failed: ${profileRes.status}`);
      return errorRedirect(appUrl, "profile_fetch_failed");
    }

    const profile = (await profileRes.json()) as GoogleUserProfile;

    if (!profile.email || !profile.verified_email) {
      return errorRedirect(appUrl, "email_not_verified");
    }

    await connectDB();

    // ── 5. Find or create user ──────────────────────────────────────────────
    let user = await User.findOne({
      $or: [{ googleId: profile.id }, { email: profile.email }],
    });

    if (user) {
      // ── 5a. Link googleId to existing email account if missing ──────────
      if (!user.googleId) {
        user.googleId = profile.id;
        if (!user.avatar && profile.picture) {
          user.avatar = profile.picture;
        }
        await user.save();
      }
    } else {
      // ── 5b. Create new Google user ──────────────────────────────────────
      user = await User.create({
        name: profile.name,
        email: profile.email,
        googleId: profile.id,
        passwordHash: null,
        isVerified: true, // Google already verified the email
        avatar: profile.picture,
      });
    }

    // ── 6. Track login ──────────────────────────────────────────────────────
    await User.updateOne(
      { _id: user._id },
      { $inc: { loginCount: 1 }, $set: { lastLoginAt: new Date() } }
    );

    // ── 7. 2FA check ────────────────────────────────────────────────────────
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
        await sendOtpEmail(user.email, user.name, otp, "two_factor");
      } catch (emailErr) {
        console.error(`[${ROUTE}] Failed to send 2FA email:`, emailErr);
      }

      const twoFaUrl = new URL("/verify-otp", appUrl);
      twoFaUrl.searchParams.set("type", "two_factor");
      twoFaUrl.searchParams.set("email", user.email);

      const twoFaRes = NextResponse.redirect(twoFaUrl.toString());
      clearStateCookie(twoFaRes);
      return twoFaRes;
    }

    // ── 8. Issue tokens ─────────────────────────────────────────────────────
    const accessToken = generateAccessToken(
      user._id.toString(),
      user.email,
      user.role
    );
    const refreshToken = generateRefreshToken(user._id.toString());

    // ── 9. Create session ───────────────────────────────────────────────────
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

    // ── 10. Redirect to dashboard ───────────────────────────────────────────
    const dashboardRes = NextResponse.redirect(new URL("/dashboard", appUrl));
    setRefreshTokenCookie(dashboardRes, refreshToken);
    clearStateCookie(dashboardRes);
    return dashboardRes;
  } catch (err) {
    console.error(`[${ROUTE}] Unhandled error:`, err);
    return errorRedirect(appUrl, "server_error");
  }
}
