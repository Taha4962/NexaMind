/**
 * GET  /api/chats — List the authenticated user's chat sessions
 * POST /api/chats — Create a new chat session
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db/mongodb";
import Chat from "@/lib/db/models/Chat";
import { getSession } from "@/lib/auth";
import type { ApiResponse } from "@/types";

const ROUTE = "/api/chats";

// ── Shared auth helper ────────────────────────────────────────────────────────

async function resolveUserId(): Promise<string | null> {
  try {
    const session = await getSession();
    return session.isLoggedIn && session.userId ? session.userId : null;
  } catch {
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/chats
// ═════════════════════════════════════════════════════════════════════════════

interface ChatShape {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatsData {
  chats: ChatShape[];
}

export async function GET(
  _request: NextRequest
): Promise<NextResponse<ApiResponse<ChatsData>>> {
  const userId = await resolveUserId();
  if (!userId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const chats = await Chat.find({ userId })
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();

    const shaped: ChatShape[] = chats.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt).toISOString() : null,
      createdAt: new Date(c.createdAt).toISOString(),
      updatedAt: new Date(c.updatedAt).toISOString(),
    }));

    return NextResponse.json<ApiResponse<ChatsData>>(
      { success: true, message: "Chats retrieved", data: { chats: shaped } },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[${ROUTE} GET] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to fetch chats", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/chats
// ═════════════════════════════════════════════════════════════════════════════

interface CreateChatData {
  chat: ChatShape;
}

export async function POST(
  _request: NextRequest
): Promise<NextResponse<ApiResponse<CreateChatData>>> {
  const userId = await resolveUserId();
  if (!userId) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Unauthorized", error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const chat = await Chat.create({
      userId,
      title: "New Chat",
      messageCount: 0,
      lastMessageAt: null,
    });

    const shaped: ChatShape = {
      id: chat._id.toString(),
      title: chat.title,
      messageCount: chat.messageCount,
      lastMessageAt: chat.lastMessageAt ? new Date(chat.lastMessageAt).toISOString() : null,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
    };

    return NextResponse.json<ApiResponse<CreateChatData>>(
      { success: true, message: "Chat created", data: { chat: shaped } },
      { status: 201 }
    );
  } catch (err) {
    console.error(`[${ROUTE} POST] Unhandled error:`, err);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, message: "Failed to create chat", error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
