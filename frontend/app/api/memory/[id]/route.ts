/**
 * NexaMind — Single Memory API Proxy Route
 *
 * DELETE /api/memory/[id] — Delete a specific memory by ID
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const token = await getAuthToken(request);
  if (!token) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id } = await params;

  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/v1/memory/${encodeURIComponent(id)}`, {
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
      message: data.message || "Memory deleted",
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
