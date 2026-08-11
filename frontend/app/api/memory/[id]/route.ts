/**
 * DELETE /api/memory/[id] — Delete a specific memory by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await getSession();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "") || session.accessToken;

  if (!token) {
    return NextResponse.json(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id } = params;
  const pythonBackendUrl =
    process.env.PYTHON_BACKEND_URL || "http://localhost:8000";

  try {
    const res = await fetch(`${pythonBackendUrl}/api/v1/memory/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { success: false, message: "Failed to delete memory", error: errorText },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ success: true, message: "Memory deleted", data });
  } catch (error) {
    console.error(`[DELETE /api/memory/${id}] Proxy error:`, error);
    return NextResponse.json(
      { success: false, message: "Backend communication error", error: "GATEWAY_ERROR" },
      { status: 502 }
    );
  }
}
