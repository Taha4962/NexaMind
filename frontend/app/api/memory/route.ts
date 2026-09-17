/**
 * NexaMind — Memory API Proxy Routes
 *
 * GET    /api/memory — List all memories (optional ?category= filter)
 * DELETE /api/memory — Clear all memories
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, generateAccessToken } from "@/lib/auth";
import type { ApiResponse } from "@/types";

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL ||
  process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL ||
  "http://localhost:8000";

async function getAuthToken(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  try {
    const session = await getSession();
    if (session.isLoggedIn && session.userId && session.email) {
      if (session.accessToken) {
        return session.accessToken;
      }
      return generateAccessToken({
        userId: session.userId,
        email: session.email,
        role: session.role || "user",
      });
    }
  } catch {
    // Fallback
  }

  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = await getAuthToken(request);
  if (!token) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const url = category
    ? `${PYTHON_BACKEND_URL}/api/v1/memory?category=${encodeURIComponent(category)}`
    : `${PYTHON_BACKEND_URL}/api/v1/memory`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: `Backend error: ${res.statusText}`,
          error: errText,
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json<ApiResponse<any>>({
      success: true,
      message: "Memories retrieved",
      data,
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to connect to backend",
        error: err.message,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const token = await getAuthToken(request);
  if (!token) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/v1/memory`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          message: `Backend error: ${res.statusText}`,
          error: errText,
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json<ApiResponse<any>>({
      success: true,
      message: data.message || "All memories cleared",
      data,
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to connect to backend",
        error: err.message,
      },
      { status: 500 }
    );
  }
}
