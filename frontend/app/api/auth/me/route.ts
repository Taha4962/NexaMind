/**
 * GET   /api/auth/me — Returns current authenticated user profile
 * PATCH /api/auth/me — Updates user profile (name, avatarUrl)
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import User from "@/lib/db/models/User";
import RevokedToken from "@/lib/db/models/RevokedToken";
import { verifyAccessToken, getSession } from "@/lib/auth";
import type { ApiResponse, User as UserShape } from "@/types";

async function getAuthUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    const payload = verifyAccessToken(token);
    if (payload && typeof payload.userId === "string" && typeof payload.jti === "string") {
      await connectDB();
      const revoked = await RevokedToken.findOne({ jti: payload.jti }).lean();
      if (!revoked) {
        return payload.userId;
      }
    }
  }

  try {
    const session = await getSession();
    if (session.isLoggedIn && session.userId) {
      return session.userId;
    }
  } catch {
    // Fallback
  }

  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Authentication required.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    await connectDB();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "User not found.", error: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<{ user: UserShape }>>(
      {
        success: true,
        message: "User retrieved.",
        data: { user: user.toSafeObject() },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/auth/me] Unhandled error:", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to retrieve user.", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Authentication required.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { name, avatarUrl } = body;

    await connectDB();
    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "User not found.", error: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (typeof name === "string" && name.trim()) {
      user.name = name.trim().slice(0, 100);
    }

    if (typeof avatarUrl === "string" || avatarUrl === null) {
      user.avatar = avatarUrl || undefined;
    }

    await user.save();

    // Also update session if available
    try {
      const session = await getSession();
      if (session.isLoggedIn) {
        if (typeof name === "string" && name.trim()) session.name = user.name;
        await session.save();
      }
    } catch {
      // Session save non-fatal
    }

    return NextResponse.json<ApiResponse<{ user: UserShape }>>(
      {
        success: true,
        message: "Profile updated successfully.",
        data: { user: user.toSafeObject() },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[PATCH /api/auth/me] Unhandled error:", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to update profile.", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
