/**
 * useGraph — TanStack Query hooks for knowledge graph visualization and management.
 *
 * Provides:
 *   - useGraph() — Fetches graph visualization data (nodes, links/edges, stats)
 *   - useClearGraph() — Mutation to reset the user's knowledge graph
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ApiResponse } from "@/types";

export interface GraphNode {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  entity_type?: string;
  mention_count?: number;
  observations?: string[];
  [key: string]: any;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  relationship?: string;
  label?: string;
  weight?: number;
  [key: string]: any;
}

export interface GraphStats {
  total_entities?: number;
  total_relationships?: number;
  entity_types?: Record<string, number>;
  top_entities?: Array<{ name: string; mention_count: number }>;
  [key: string]: any;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  links?: GraphEdge[];
  stats?: GraphStats;
}

export function useGraph() {
  const query = useQuery({
    queryKey: ["graph"],
    queryFn: async () => {
      const res = await api.get<ApiResponse<any>>("/graph");
      const raw = res.data.data;
      if (!raw) {
        return { nodes: [], edges: [], links: [], stats: {} } as GraphData;
      }

      const nodes: GraphNode[] = raw.nodes || raw.graph?.nodes || [];
      const edges: GraphEdge[] = raw.edges || raw.graph?.edges || raw.links || [];
      const stats: GraphStats = raw.stats || raw.graph?.stats || {};

      // Standardize edges to have both edges and links aliases
      return {
        nodes,
        edges,
        links: edges,
        stats,
      } as GraphData;
    },
  });

  return {
    graph: query.data ?? { nodes: [], edges: [], links: [], stats: {} },
    nodes: query.data?.nodes ?? [],
    edges: query.data?.edges ?? [],
    links: query.data?.links ?? [],
    stats: query.data?.stats ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useClearGraph() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.delete<ApiResponse<unknown>>("/graph");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["graph"] });
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });
}
