/**
 * POST /api/documents/upload
 *
 * Uploads a document (PDF, DOCX, TXT) to Cloudinary, creates a MongoDB
 * record, and triggers the Python backend ingestion pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import connectDB from "@/lib/db/mongodb";
import DocumentModel from "@/lib/db/models/Document";
import RevokedToken from "@/lib/db/models/RevokedToken";
import { verifyAccessToken } from "@/lib/auth";
import { uploadDocument } from "@/lib/cloudinary";
import type { ApiResponse } from "@/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

function getFileType(mimeType: string): "pdf" | "docx" | "txt" | "image" {
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (mimeType.startsWith("image/")) return "image";
  return "txt";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Verify access token ────────────────────────────────────────────────
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

    // ── 2. Check token revocation ─────────────────────────────────────────
    const revoked = await RevokedToken.findOne({ jti: payload.jti }).lean();
    if (revoked) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Token revoked.", error: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // ── 3. Parse FormData ─────────────────────────────────────────────────
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || typeof file === "string") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "No file provided.", error: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    // ── 4. Validate File ──────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "File exceeds 10MB limit.", error: "PAYLOAD_TOO_LARGE" },
        { status: 413 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Invalid file type.", error: "UNSUPPORTED_MEDIA_TYPE" },
        { status: 415 }
      );
    }

    // ── 5. Save to temp file ──────────────────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    // Use a sanitized unique filename for the temp file
    const safeFilename = `${uuidv4()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const tmpFilePath = join(os.tmpdir(), safeFilename);
    await writeFile(tmpFilePath, buffer);

    let uploadResult;
    try {
      // ── 6. Upload to Cloudinary ──────────────────────────────────────────
      uploadResult = await uploadDocument(tmpFilePath, payload.userId, safeFilename);
    } finally {
      // Clean up temp file
      await unlink(tmpFilePath).catch(() => {});
    }

    // ── 7. Save to MongoDB ────────────────────────────────────────────────
    const fileType = getFileType(file.type);
    const document = await DocumentModel.create({
      userId: payload.userId,
      filename: safeFilename,
      originalName: file.name,
      cloudinaryPublicId: uploadResult.publicId,
      cloudinaryUrl: uploadResult.secureUrl,
      fileType,
      fileSize: file.size,
      status: "uploaded",
    });

    // ── 8. Trigger Python Ingestion (Fire and Forget) ─────────────────────
    const backendUrl = process.env.NEXT_PUBLIC_PYTHON_BACKEND_URL;
    if (backendUrl) {
      fetch(`${backendUrl}/api/v1/documents/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // pass token to backend
        },
        body: JSON.stringify({
          documentId: document._id.toString(),
          cloudinaryUrl: document.cloudinaryUrl,
          fileType: document.fileType,
        }),
      }).catch((err) => {
        console.error("[UPLOAD] Failed to trigger backend ingestion:", err);
      });
    } else {
      console.warn("[UPLOAD] NEXT_PUBLIC_PYTHON_BACKEND_URL not set");
    }

    return NextResponse.json<ApiResponse<{ document: any }>>(
      {
        success: true,
        message: "Document uploaded successfully.",
        data: { document },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/documents/upload] Unhandled error:", err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Upload failed.", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
