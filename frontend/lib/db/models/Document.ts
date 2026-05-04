/**
 * NexaMind — Document Mongoose Model
 *
 * Represents an uploaded user document. Tracks Cloudinary storage details
 * and background processing status (uploaded -> processing -> ready/failed).
 */

import mongoose, { Document, Model, Schema } from "mongoose";

export interface IDocument extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  filename: string;
  originalName: string;
  cloudinaryPublicId: string;
  cloudinaryUrl: string;
  fileType: "pdf" | "docx" | "txt" | "image";
  fileSize: number; // bytes
  status: "uploaded" | "processing" | "ready" | "failed";
  errorMessage?: string;
  chunkCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface IDocumentModel extends Model<IDocument> {}

const documentSchema = new Schema<IDocument, IDocumentModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    cloudinaryPublicId: {
      type: String,
      required: true,
    },
    cloudinaryUrl: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ["pdf", "docx", "txt", "image"],
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["uploaded", "processing", "ready", "failed"],
      default: "uploaded",
    },
    errorMessage: {
      type: String,
    },
    chunkCount: {
      type: Number,
      min: 0,
    },
  },
  { timestamps: true }
);

// Model (singleton-safe for Next.js hot reload)
const DocumentModel: IDocumentModel =
  (mongoose.models.Document as IDocumentModel) ??
  mongoose.model<IDocument, IDocumentModel>("Document", documentSchema);

export default DocumentModel;
