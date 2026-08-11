/**
 * GET /api/auth/google
 *
 * Initiates the Google OAuth 2.0 flow.
 * Builds the Google authorization URL and redirects the browser
 * to the Google consent screen.
 *
 * A CSRF-protection `state` token is generated and stored in a
 * short-lived (5 min) httpOnly cookie. The callback verifies it.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const STATE_COOKIE = "nexamind_oauth_state";
const STATE_MAX_AGE = 5 * 60; // 5 minutes in seconds

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!clientId) {
    console.error("[GET /api/auth/google] GOOGLE_CLIENT_ID is not set");
    return NextResponse.redirect(
      new URL("/sign-in?error=oauth_misconfigured", appUrl)
    );
  }

  // ── Generate CSRF state token ─────────────────────────────────────────────
  const state = randomUUID();

  // ── Build Google OAuth URL ────────────────────────────────────────────────
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

  // ── Redirect with state cookie ────────────────────────────────────────────
  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // lax required — cookie must survive cross-site redirect
    maxAge: STATE_MAX_AGE,
    path: "/api/auth/google",
  });

  return res;
}
