/**
 * useDocuments — TanStack Query hooks for document management.
 *
 * Provides:
 *   - useDocuments() — Fetches documents with smart polling while any doc is processing
 *   - useUploadDocument() — Uploads document file to /api/documents/upload with progress tracking
 *   - useDeleteDocument() — Deletes document by ID
 *   - useRetryDocument() — Retries failed document processing
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ApiResponse } from "@/types";

export interface DocumentItem {
  id: string;
  _id?: string;
  userId?: string;
  filename: string;
  originalName?: string;
  fileType: "pdf" | "docx" | "txt" | "image" | string;
  fileSize: number;
  sizeBytes?: number;
  status: "uploaded" | "processing" | "ready" | "failed" | "completed" | "pending";
  chunkCount?: number;
  cloudinaryUrl?: string;
  errorMessage?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export function useDocuments() {
  const query = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<{ documents: DocumentItem[] }>>("/documents");
      return res.data.data?.documents ?? [];
    },
    // Poll every 3 seconds while any document is in uploaded/processing/pending state
    refetchInterval: (queryState) => {
      const docs = queryState.state.data ?? [];
      const isAnyProcessing = docs.some(
        (d) =>
          d.status === "processing" ||
          d.status === "uploaded" ||
          d.status === "pending"
      );
      return isAnyProcessing ? 3000 : false;
    },
  });

  const documents = query.data ?? [];
  const readyDocuments = documents.filter(
    (d) => d.status === "ready" || d.status === "completed"
  );
  const isProcessing = documents.some(
    (d) =>
      d.status === "processing" ||
      d.status === "uploaded" ||
      d.status === "pending"
  );

  return {
    documents,
    readyDocuments,
    isProcessing,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: File;
      onProgress?: (percentage: number) => void;
    }) => {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post<ApiResponse<{ document: DocumentItem }>>(
        "/documents/upload",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && onProgress) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              onProgress(percentCompleted);
            }
          },
        }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const res = await api.delete<ApiResponse<unknown>>(`/documents/${encodeURIComponent(documentId)}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export function useRetryDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const res = await api.post<ApiResponse<unknown>>(
        `/documents/${encodeURIComponent(documentId)}/retry`
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}
