/**
 * DELETE /api/documents/[id]
 *
 * Deletes a document:
 * 1. Verifies ownership.
 * 2. Deletes from Cloudinary.
 * 3. Triggers Python backend to delete from ChromaDB.
 * 4. Removes from MongoDB.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import DocumentModel from "@/lib/db/models/Document";
import RevokedToken from "@/lib/db/models/RevokedToken";
import { verifyAccessToken } from "@/lib/auth";
import { deleteFile } from "@/lib/cloudinary";
import type { ApiResponse } from "@/types";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const documentId = params.id;

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

    const document = await DocumentModel.findOne({
      _id: documentId,
      userId: payload.userId,
    });

    if (!document) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Document not found.", error: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // ── Delete from Cloudinary ─────────────────────────────────────────────
    try {
      await deleteFile(document.cloudinaryPublicId);
    } catch (cloudinaryErr) {
      console.error("[DELETE /api/documents] Cloudinary deletion failed:", cloudinaryErr);
      // Proceed with local deletion even if Cloudinary fails
    }

    // ── Trigger Python Backend Deletion ───────────────────────────────────
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL;
    if (backendUrl) {
      try {
        await fetch(`${backendUrl}/api/v1/documents/${documentId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`, // pass token to backend
          },
        });
      } catch (backendErr) {
        console.error("[DELETE /api/documents] Backend deletion failed:", backendErr);
        // Proceed with MongoDB deletion
      }
    }

    // ── Delete from MongoDB ───────────────────────────────────────────────
    await DocumentModel.deleteOne({ _id: documentId });

    return NextResponse.json<ApiResponse<never>>(
      { success: true, message: "Document deleted." },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[DELETE /api/documents/${params.id}] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to delete document.", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
