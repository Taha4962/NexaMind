/**
 * NexaMind Frontend — Google OAuth Callback Handler
 *
 * Handles the OAuth callback from Google, exchanges the authorization
 * code for user info, and issues our own JWT tokens.
 * Will be fully implemented in the authentication step.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * GET handler for Google OAuth callback.
 *
 * Receives the authorization code from Google, exchanges it for
 * tokens, retrieves user profile info, creates/updates the user
 * in MongoDB, and issues NexaMind JWT tokens.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/sign-in?error=missing_code", request.url)
    );
  }

  // OAuth flow will be implemented in the authentication step:
  // 1. Exchange authorization code for Google tokens
  // 2. Fetch user profile from Google
  // 3. Create or find user in MongoDB
  // 4. Issue NexaMind JWT access + refresh tokens
  // 5. Set iron-session with user data
  // 6. Redirect to dashboard

  return NextResponse.redirect(
    new URL("/sign-in?error=not_implemented", request.url)
  );
}
