/**
 * NexaMind — Message Mongoose Model
 *
 * Stores individual messages within a chat session.
 * Supports RAG source attributions and agent type tracking.
 */

import mongoose, { Document, Model, Schema } from "mongoose";
import type { AgentType, MessageRole } from "@/types";

// ── Document Interface ────────────────────────────────────────────────────────

export interface ISource {
  documentId: string;
  filename: string;
  pageNumber: number | null;
  chunkText: string;
}

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  chatId: string;
  role: MessageRole;
  content: string;
  agentType: AgentType | null;
  sources: ISource[];
  tokensUsed: number | null;
  modelUsed: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Source Sub-Schema ─────────────────────────────────────────────────────────

const sourceSchema = new Schema<ISource>(
  {
    documentId: { type: String, required: true },
    filename: { type: String, required: true },
    pageNumber: { type: Number, default: null },
    chunkText: { type: String, required: true },
  },
  { _id: false }
);

// ── Schema ───────────────────────────────────────────────────────────────────

const messageSchema = new Schema<IMessage>(
  {
    chatId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"] satisfies MessageRole[],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    agentType: {
      type: String,
      enum: ["rag", "memory", "web", "direct", null] satisfies (AgentType | null)[],
      default: null,
    },
    sources: {
      type: [sourceSchema],
      default: [],
    },
    tokensUsed: {
      type: Number,
      default: null,
    },
    modelUsed: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for fetching a chat's messages in order
messageSchema.index({ chatId: 1, createdAt: 1 });

// ── Model (singleton-safe for Next.js hot reload) ─────────────────────────────

const Message: Model<IMessage> =
  (mongoose.models.Message as Model<IMessage>) ??
  mongoose.model<IMessage>("Message", messageSchema);

export default Message;
