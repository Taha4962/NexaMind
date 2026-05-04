/**
 * GET /api/documents
 *
 * Returns all documents for the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import DocumentModel from "@/lib/db/models/Document";
import RevokedToken from "@/lib/db/models/RevokedToken";
import { verifyAccessToken } from "@/lib/auth";
import type { ApiResponse } from "@/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Authentication required.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const payload = verifyAccessToken(token);
  if (
    !payload ||
    typeof payload.userId !== "string" ||
    typeof payload.jti !== "string"
  ) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Invalid or expired token.", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const revoked = await RevokedToken.findOne({ jti: payload.jti }).lean();
    if (revoked) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Token revoked.", error: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const documents = await DocumentModel.find({ userId: payload.userId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json<ApiResponse<{ documents: any[] }>>(
      {
        success: true,
        message: "Documents retrieved successfully.",
        data: { documents },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/documents] Unhandled error:", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to retrieve documents.", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
