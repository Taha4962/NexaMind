/**
 * NexaMind — Cloudinary Service
 *
 * Handles direct server-side uploads to Cloudinary for user documents
 * and avatars. Requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and
 * CLOUDINARY_API_SECRET environment variables.
 */

import { v2 as cloudinary } from "cloudinary";

// ── Initialize Cloudinary ───────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  format: string;
  bytes: number;
  originalFilename: string;
}

// ── Document Uploads ────────────────────────────────────────────────────────

/**
 * Uploads a document (PDF, DOCX, TXT, or Image) to Cloudinary.
 * Stores it under the specific user's folder for clean organization.
 *
 * @param filePath - Local path to the file (temp file path from form upload)
 * @param userId - ID of the user uploading the file
 * @param filename - Original filename
 * @returns CloudinaryUploadResult containing URL and public ID
 */
export async function uploadDocument(
  filePath: string,
  userId: string,
  filename: string
): Promise<CloudinaryUploadResult> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: `nexamind/documents/${userId}`,
    resource_type: "auto", // Automatically detect if raw (pdf/docx) or image
    allowed_formats: ["pdf", "docx", "txt", "png", "jpg", "jpeg", "webp"],
    tags: [userId, "document"],
    public_id: filename.replace(/\.[^/.]+$/, ""), // Remove extension
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    format: result.format || "unknown",
    bytes: result.bytes,
    originalFilename: result.original_filename || filename,
  };
}

// ── Avatar Uploads ──────────────────────────────────────────────────────────

/**
 * Uploads a user profile avatar with automatic cropping and face gravity.
 *
 * @param filePath - Local path to the image
 * @param userId - ID of the user (used as public ID)
 * @returns CloudinaryUploadResult containing URL and public ID
 */
export async function uploadAvatar(
  filePath: string,
  userId: string
): Promise<CloudinaryUploadResult> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: "nexamind/avatars",
    public_id: userId,
    resource_type: "image",
    allowed_formats: ["png", "jpg", "jpeg", "webp"],
    transformation: [{ width: 200, height: 200, crop: "fill", gravity: "face" }],
    overwrite: true,
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    format: result.format,
    bytes: result.bytes,
    originalFilename: result.original_filename,
  };
}

// ── Deletion ────────────────────────────────────────────────────────────────

/**
 * Deletes a file from Cloudinary by its public ID.
 *
 * @param publicId - The Cloudinary public_id of the file to delete
 */
export async function deleteFile(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { invalidate: true });
}
