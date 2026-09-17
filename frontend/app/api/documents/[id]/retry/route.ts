/**
 * POST /api/documents/[id]/retry
 *
 * Retries ingestion for a failed document.
 * Sets status to 'processing', clears errors, and re-triggers backend ingestion pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import DocumentModel from "@/lib/db/models/Document";
import { getSession } from "@/lib/auth";
import type { ApiResponse } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const documentId = params.id;

  let userId: string | null = null;
  let token: string | null = null;

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  try {
    const session = await getSession();
    if (session.isLoggedIn && session.userId) {
      userId = session.userId;
      if (!token && session.accessToken) {
        token = session.accessToken;
      }
    }
  } catch {
    // Fallback
  }

  if (!userId && !token) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Authentication required.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const query: Record<string, any> = { _id: documentId };
    if (userId) {
      query.userId = userId;
    }

    const document = await DocumentModel.findOne(query);
    if (!document) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Document not found.", error: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Reset status to processing
    document.status = "processing";
    document.errorMessage = undefined;
    await document.save();

    // Trigger backend ingestion
    const backendUrl =
      process.env.PYTHON_BACKEND_URL ||
      process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL ||
      "http://localhost:8000";

    fetch(`${backendUrl}/api/v1/documents/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        documentId: document._id.toString(),
        cloudinaryUrl: document.cloudinaryUrl,
        fileType: document.fileType,
      }),
    }).catch((err) => {
      console.error("[RETRY INGEST] Backend trigger error:", err);
    });

    return NextResponse.json<ApiResponse<{ document: any }>>(
      {
        success: true,
        message: "Document ingestion retry triggered.",
        data: { document },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[POST /api/documents/${params.id}/retry] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to retry document.", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
