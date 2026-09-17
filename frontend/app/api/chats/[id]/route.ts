/**
 * GET    /api/chats/[id] — Fetch a single chat with its full message history
 * DELETE /api/chats/[id] — Delete a chat and all its messages
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import Chat from "@/lib/db/models/Chat";
import Message from "@/lib/db/models/Message";
import { getSession } from "@/lib/auth";
import type { ApiResponse } from "@/types";

const ROUTE = "/api/chats/[id]";

// ── Shared auth helper ────────────────────────────────────────────────────────

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

interface ChatShape {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatDetailData {
  chat: ChatShape;
  messages: MessageShape[];
}

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/chats/[id]
// ═════════════════════════════════════════════════════════════════════════════

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<ApiResponse<ChatDetailData>>> {
  const userId = await resolveUserId();
  if (!userId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id } = params;

  try {
    await connectDB();

    // Fetch chat and verify ownership
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

    // Fetch all messages for this chat sorted oldest-first
    const messages = await Message.find({ chatId: id })
      .sort({ createdAt: 1 })
      .lean();

    const shapedMessages: MessageShape[] = messages.map((m) => ({
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

    const shapedChat: ChatShape = {
      id: chat._id.toString(),
      title: chat.title,
      messageCount: chat.messageCount,
      lastMessageAt: chat.lastMessageAt
        ? new Date(chat.lastMessageAt).toISOString()
        : null,
      createdAt: new Date(chat.createdAt).toISOString(),
      updatedAt: new Date(chat.updatedAt).toISOString(),
    };

    return NextResponse.json<ApiResponse<ChatDetailData>>(
      {
        success: true,
        message: "Chat retrieved",
        data: { chat: shapedChat, messages: shapedMessages },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE} GET] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to fetch chat", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/chats/[id]
// ═════════════════════════════════════════════════════════════════════════════

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<ApiResponse<never>>> {
  const userId = await resolveUserId();
  if (!userId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { id } = params;

  try {
    await connectDB();

    // Verify ownership
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

    // Delete chat document and all associated messages in parallel
    await Promise.all([
      Chat.deleteOne({ _id: id }),
      Message.deleteMany({ chatId: id }),
    ]);

    return NextResponse.json<ApiResponse<never>>(
      { success: true, message: "Chat deleted" },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE} DELETE] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to delete chat", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
