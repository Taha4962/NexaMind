/**
 * GET /api/chats/[id]/messages — Paginated message history for a chat
 *
 * Query parameters:
 *   page  (default: 1)   — page number
 *   limit (default: 20)  — messages per page
 *
 * Returns messages sorted by createdAt descending (newest first),
 * with pagination metadata in the response.
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import Chat from "@/lib/db/models/Chat";
import Message from "@/lib/db/models/Message";
import { getSession } from "@/lib/auth";
import type { ApiResponse } from "@/types";

const ROUTE = "/api/chats/[id]/messages";

async function resolveUserId(): Promise<string | null> {
  try {
    const session = await getSession();
    return session.isLoggedIn && session.userId ? session.userId : null;
  } catch {
    return null;
  }
}

// ── Shape types ───────────────────────────────────────────────────────────────

interface SourceShape {
  documentId: string;
  filename: string;
  pageNumber: number | null;
  chunkText: string;
}

interface MessageShape {
  id: string;
  chatId: string;
  role: string;
  content: string;
  agentType: string | null;
  sources: SourceShape[];
  createdAt: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface MessagesData {
  messages: MessageShape[];
  pagination: PaginationMeta;
}

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/chats/[id]/messages
// ═════════════════════════════════════════════════════════════════════════════

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<ApiResponse<MessagesData>>> {
  const userId = await resolveUserId();
  if (!userId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id } = params;

  // Parse pagination query params
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10))
  );
  const skip = (page - 1) * limit;

  try {
    await connectDB();

    // Verify chat ownership
    const chat = await Chat.findById(id).lean();
    if (!chat) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Chat not found", error: "NOT_FOUND" },
        { status: 404 }
      );
    }
    if (chat.userId !== userId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, message: "Access denied", error: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // Count total messages and fetch the requested page in parallel
    const [total, rawMessages] = await Promise.all([
      Message.countDocuments({ chatId: id }),
      Message.find({ chatId: id })
        .sort({ createdAt: -1 })   // newest first
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit);

    const messages: MessageShape[] = rawMessages.map((m) => ({
      id: m._id.toString(),
      chatId: m.chatId,
      role: m.role,
      content: m.content,
      agentType: m.agentType ?? null,
      sources: (m.sources ?? []).map((s) => ({
        documentId: s.documentId,
        filename: s.filename,
        pageNumber: s.pageNumber ?? null,
        chunkText: s.chunkText,
      })),
      createdAt: new Date(m.createdAt).toISOString(),
    }));

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    return NextResponse.json<ApiResponse<MessagesData>>(
      {
        success: true,
        message: "Messages retrieved",
        data: { messages, pagination },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE} GET] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      {
        success: false,
        message: "Failed to fetch messages",
        error: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
