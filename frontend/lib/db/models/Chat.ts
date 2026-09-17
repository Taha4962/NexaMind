/**
 * NexaMind — Chat Mongoose Model
 *
 * Stores chat sessions for each user.
 * Each chat has a title, message count, and timestamps.
 */

import mongoose, { Document, Model, Schema } from "mongoose";

// ── Document Interface ────────────────────────────────────────────────────────

export interface IChat extends Document {
  _id: mongoose.Types.ObjectId;
  userId: string;
  title: string;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ───────────────────────────────────────────────────────────────────

const chatSchema = new Schema<IChat>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New Chat",
      maxlength: 200,
      trim: true,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for user's chat list sorted by last message
chatSchema.index({ userId: 1, lastMessageAt: -1 });

// ── Model (singleton-safe for Next.js hot reload) ─────────────────────────────

const Chat: Model<IChat> =
  (mongoose.models.Chat as Model<IChat>) ??
  mongoose.model<IChat>("Chat", chatSchema);

export default Chat;
