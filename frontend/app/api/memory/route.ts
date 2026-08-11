/**
 * GET    /api/memory — List all user memories (optionally filtered by ?category=)
 * DELETE /api/memory — Clear all memories for the authenticated user
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest): Promise<Response> {
  const session = await getSession();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || session.accessToken;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const pythonBackendUrl =
    process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
  const url = category
    ? `${pythonBackendUrl}/api/v1/memory?category=${encodeURIComponent(category)}`
    : `${pythonBackendUrl}/api/v1/memory`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { success: false, message: "Failed to fetch memories", error: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ success: true, message: "Memories retrieved", data });
  } catch (error) {
    console.error("[GET /api/memory] Proxy error:", error);
    return NextResponse.json(
      { success: false, message: "Backend communication error", error: "GATEWAY_ERROR" },
      { status: 502 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const session = await getSession();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || session.accessToken;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const pythonBackendUrl =
    process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

  try {
    const res = await fetch(`${pythonBackendUrl}/api/v1/memory`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { success: false, message: "Failed to clear memories", error: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ success: true, message: "All memories cleared", data });
  } catch (error) {
    console.error("[DELETE /api/memory] Proxy error:", error);
    return NextResponse.json(
      { success: false, message: "Backend communication error", error: "GATEWAY_ERROR" },
      { status: 502 }
    );
  }
}
