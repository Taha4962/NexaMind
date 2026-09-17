/**
 * useMemories — TanStack Query hooks for memory management.
 *
 * Provides:
 *   - useMemories(category?) — Fetches user memories (optionally filtered by category)
 *   - useDeleteMemory() — Mutation to delete a specific memory by ID
 *   - useClearMemories() — Mutation to clear all memories for the user
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ApiResponse } from "@/types";

export type MemoryCategory =
  | "preference"
  | "personal"
  | "project"
  | "event"
  | "knowledge"
  | "relationship";

export interface MemoryItem {
  id: string;
  _id?: string;
  userId: string;
  fact: string;
  category: MemoryCategory | string;
  confidence: number;
  sourceMessageId?: string | null;
  sourceChatId?: string | null;
  lastAccessed: string;
  accessCount?: number;
  createdAt?: string;
}

export function useMemories(category?: string | null) {
  const query = useQuery({
    queryKey: ["memories", category ?? "all"],
    queryFn: async () => {
      const url = category && category !== "all"
        ? `/memory?category=${encodeURIComponent(category)}`
        : "/memory";
      const res = await api.get<ApiResponse<MemoryItem[] | { memories: MemoryItem[] }>>(url);
      const raw = res.data.data;
      if (Array.isArray(raw)) {
        return raw;
      }
      if (raw && typeof raw === "object" && "memories" in raw && Array.isArray((raw as any).memories)) {
        return (raw as any).memories as MemoryItem[];
      }
      return [] as MemoryItem[];
    },
  });

  return {
    memories: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memoryId: string) => {
      const res = await api.delete<ApiResponse<unknown>>(`/memory/${encodeURIComponent(memoryId)}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      queryClient.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}

export function useClearMemories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.delete<ApiResponse<unknown>>("/memory");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      queryClient.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}
