/**
 * NexaMind Frontend — Next.js Middleware
 *
 * Protects dashboard routes by checking the iron-session cookie.
 * Redirects unauthenticated users to /sign-in and passes userId
 * in request headers for downstream API routes.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/auth";
import { PUBLIC_ROUTES, PROTECTED_ROUTE_PREFIX, ROUTES } from "@/lib/constants";

/**
 * Next.js middleware function.
 *
 * Runs on every matched request to:
 * 1. Allow public routes without auth check
 * 2. Check iron-session cookie for protected routes
 * 3. Redirect to /sign-in if session is missing/invalid
 * 4. Pass userId header to API routes for authenticated requests
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── Allow static assets and Next.js internals ──
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── Allow public routes ──
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // ── Check authentication for protected routes ──
  if (pathname.startsWith(PROTECTED_ROUTE_PREFIX) || pathname.startsWith("/api/")) {
    try {
      // Read the iron-session cookie
      const response = NextResponse.next();
      const session = await getIronSession<SessionData>(
        request,
        response,
        sessionOptions
      );

      // If not logged in and trying to access dashboard, redirect to sign-in
      if (!session.isLoggedIn && pathname.startsWith(PROTECTED_ROUTE_PREFIX)) {
        const signInUrl = new URL(ROUTES.SIGN_IN, request.url);
        signInUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(signInUrl);
      }

      // Pass userId in headers for API routes
      if (session.isLoggedIn && session.userId) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-user-id", session.userId);
        requestHeaders.set("x-user-email", session.email || "");

        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      }

      return response;
    } catch {
      // If session reading fails, redirect to sign-in for protected routes
      if (pathname.startsWith(PROTECTED_ROUTE_PREFIX)) {
        const signInUrl = new URL(ROUTES.SIGN_IN, request.url);
        return NextResponse.redirect(signInUrl);
      }
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

/**
 * Middleware matcher configuration.
 *
 * Runs on all routes except static files and Next.js internals.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
