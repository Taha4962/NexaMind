/**
 * useDocuments — fetches the authenticated user's uploaded documents.
 * Filters by status so components can easily get only "ready" docs.
 */

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ApiResponse, Document } from "@/types";

export function useDocuments() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ documents: Document[] }>>(
        "/documents"
      );
      return res.data.data?.documents ?? [];
    },
    staleTime: 30_000, // cache for 30s — doc list rarely changes mid-chat
  });

  const documents = data ?? [];
  const readyDocuments = documents.filter((d) => d.status === "completed");

  return {
    documents,
    readyDocuments,
    isLoading,
    error,
    refetch,
  };
}
