/**
 * Custom React hooks for chat state management and streaming.
 *
 * Provides:
 *  - useChat(chatId): fetches a single chat session with its full message history
 *  - useChatList(): fetches all chat sessions for the authenticated user
 *  - useStreamChat(): manages sending messages and streaming SSE responses
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { streamChat, StreamChunk } from "@/lib/api";
import type { ApiResponse, Chat, ChatWithMessages, Message } from "@/types";

// ── 1. useChat Hook ─────────────────────────────────────────────────────────

export function useChat(chatId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      if (!chatId) return null;
      const res = await api.get<ApiResponse<{ chat: Chat; messages: Message[] }>>(
        `/chats/${chatId}`
      );
      return res.data.data;
    },
    enabled: Boolean(chatId),
  });

  return {
    chat: data?.chat ?? null,
    messages: data?.messages ?? [],
    isLoading,
    error,
    refetch,
  };
}

// ── 2. useChatList Hook ─────────────────────────────────────────────────────

export function useChatList() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["chats"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ chats: Chat[] }>>("/chats");
      return res.data.data?.chats ?? [];
    },
  });

  return {
    chats: data ?? [],
    isLoading,
    error,
    refetch,
  };
}

// ── 3. useStreamChat Hook ───────────────────────────────────────────────────

export function useStreamChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = async (
    message: string,
    chatId: string | null,
    attachedDocIds: string[] = []
  ) => {
    setIsStreaming(true);
    setStreamingContent("");
    setError(null);

    const token =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("nexamind_access_token") ?? ""
        : "";

    let currentChatId = chatId;

    try {
      for await (const chunk of streamChat(
        message,
        currentChatId,
        token,
        attachedDocIds
      )) {
        if (chunk.type === "token") {
          setStreamingContent((prev) => prev + chunk.content);
        } else if (chunk.type === "done") {
          if (chunk.metadata?.chatId) {
            currentChatId = chunk.metadata.chatId as string;
          }
        } else if (chunk.type === "error") {
          setError(chunk.content);
        }
      }

      // Invalidate queries so UI reflects updated message history and chat list
      if (currentChatId) {
        await queryClient.invalidateQueries({ queryKey: ["chat", currentChatId] });
      }
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stream message";
      setError(msg);
    } finally {
      setIsStreaming(false);
    }
  };

  return {
    sendMessage,
    isStreaming,
    streamingContent,
    error,
  };
}
