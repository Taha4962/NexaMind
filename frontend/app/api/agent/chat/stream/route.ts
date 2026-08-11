/**
 * POST /api/agent/chat/stream
 *
 * Secure Next.js API route gateway for SSE streaming.
 * Verifies JWT token and proxies SSE stream from Python backend to client.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest): Promise<Response> {
  // ── a. Verify access token / session ──────────────────────────────────────
  const session = await getSession();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || session.accessToken;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // ── b. Parse request body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body", error: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  // ── c. Forward request to Python Backend ───────────────────────────────────
  const pythonBackendUrl =
    process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

  try {
    const pythonResponse = await fetch(
      `${pythonBackendUrl}/api/v1/agent/chat/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      return NextResponse.json(
        {
          success: false,
          message: "Backend streaming failed",
          error: errorText,
        },
        { status: pythonResponse.status }
      );
    }

    // ── d & e. Proxy ReadableStream to client without buffering ───────────────
    return new Response(pythonResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[POST /api/agent/chat/stream] Proxy error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to AI backend service",
        error: "GATEWAY_ERROR",
      },
      { status: 502 }
    );
  }
}
