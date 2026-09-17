"use client";

/**
 * NexaMind Frontend — Knowledge Graph Visualization Component
 *
 * Interactive 2D force-directed graph displaying entities and relationships.
 * Features:
 *   - Type-based color coding (Person, Project, Topic, Place, etc.)
 *   - Mention-count dynamic sizing
 *   - Interactive node selection with neighbor highlighting
 *   - Search & focus
 *   - Zoom/pan controls (Zoom In, Zoom Out, Fit)
 *   - Node inspector sidebar with observations
 *   - Clear Graph with confirmation modal
 *   - Graceful zero-node empty state
 */

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Loader2,
  Share2,
  Sparkles,
  AlertTriangle,
  X,
} from "lucide-react";
import { useGraph, useClearGraph, type GraphNode, type GraphEdge } from "@/hooks/useGraph";

// Dynamically import react-force-graph-2d with SSR disabled
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <p className="text-sm">Initializing knowledge graph physics...</p>
    </div>
  ),
});

// Color map based on entity type
const TYPE_COLORS: Record<string, { bg: string; border: string; glow: string }> = {
  person: { bg: "#3b82f6", border: "#60a5fa", glow: "rgba(59, 130, 246, 0.4)" },
  project: { bg: "#8b5cf6", border: "#a78bfa", glow: "rgba(139, 92, 246, 0.4)" },
  topic: { bg: "#14b8a6", border: "#2dd4bf", glow: "rgba(20, 184, 166, 0.4)" },
  place: { bg: "#f59e0b", border: "#fbbf24", glow: "rgba(245, 158, 11, 0.4)" },
  organization: { bg: "#10b981", border: "#34d399", glow: "rgba(16, 185, 129, 0.4)" },
  concept: { bg: "#ec4899", border: "#f472b6", glow: "rgba(236, 72, 153, 0.4)" },
  event: { bg: "#f43f5e", border: "#fb7185", glow: "rgba(244, 63, 94, 0.4)" },
  default: { bg: "#6366f1", border: "#818cf8", glow: "rgba(99, 102, 241, 0.4)" },
};

function getNodeColor(type?: string) {
  const normalized = (type || "default").toLowerCase();
  return TYPE_COLORS[normalized] || TYPE_COLORS.default;
}

export default function GraphVisualization() {
  const { nodes, links, stats, isLoading, error, refetch } = useGraph();
  const clearGraphMutation = useClearGraph();

  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");
  const [showClearModal, setShowClearModal] = useState(false);

  // Resize observer to keep graph full-bleed within container
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Set of connected node IDs and link IDs for highlighting
  const { highlightNodes, highlightLinks } = useMemo(() => {
    const hNodes = new Set<string>();
    const hLinks = new Set<GraphEdge>();
    const activeNode = selectedNode || hoveredNode;

    if (activeNode) {
      hNodes.add(activeNode.id);
      links.forEach((link) => {
        const sourceId = typeof link.source === "object" ? (link.source as any).id : link.source;
        const targetId = typeof link.target === "object" ? (link.target as any).id : link.target;
        if (sourceId === activeNode.id || targetId === activeNode.id) {
          hLinks.add(link);
          hNodes.add(sourceId);
          hNodes.add(targetId);
        }
      });
    }

    return { highlightNodes: hNodes, highlightLinks: hLinks };
  }, [selectedNode, hoveredNode, links]);

  // Unique entity types for filter pills
  const entityTypes = useMemo(() => {
    const types = new Set<string>();
    nodes.forEach((n) => {
      const t = n.type || n.entity_type;
      if (t) types.add(t.toLowerCase());
    });
    return Array.from(types);
  }, [nodes]);

  // Filtered graph data
  const graphData = useMemo(() => {
    let filteredNodes = nodes;
    if (selectedTypeFilter !== "all") {
      filteredNodes = nodes.filter(
        (n) => (n.type || n.entity_type || "").toLowerCase() === selectedTypeFilter
      );
    }
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = links.filter((l) => {
      const s = typeof l.source === "object" ? (l.source as any).id : l.source;
      const t = typeof l.target === "object" ? (l.target as any).id : l.target;
      return nodeIds.has(s) && nodeIds.has(t);
    });

    return {
      nodes: filteredNodes,
      links: filteredLinks,
    };
  }, [nodes, links, selectedTypeFilter]);

  // Search filter suggestions
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes.filter(
      (n) =>
        (n.name || n.label || n.id).toLowerCase().includes(q) ||
        (n.type || n.entity_type || "").toLowerCase().includes(q)
    );
  }, [nodes, searchQuery]);

  const handleSelectNode = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
    if (node && fgRef.current) {
      // Center graph on the clicked node
      const n = node as any;
      if (typeof n.x === "number" && typeof n.y === "number") {
        fgRef.current.centerAt(n.x, n.y, 800);
        fgRef.current.zoom(2.5, 800);
      }
    }
  }, []);

  const handleZoomIn = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() * 1.4, 400);
    }
  };

  const handleZoomOut = () => {
    if (fgRef.current) {
      fgRef.current.zoom(fgRef.current.zoom() / 1.4, 400);
    }
  };

  const handleResetZoom = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(600, 40);
    }
  };

  const handleConfirmClear = async () => {
    await clearGraphMutation.mutateAsync();
    setShowClearModal(false);
    setSelectedNode(null);
  };

  // Node drawing on canvas
  const drawNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);

      const mentionCount = node.mention_count || 1;
      const baseRadius = 5 + Math.min(Math.sqrt(mentionCount) * 3, 12);
      const radius = isSelected ? baseRadius * 1.4 : baseRadius;

      const colors = getNodeColor(node.type || node.entity_type);
      const alpha = isHighlighted ? 1 : 0.15;

      // Glow circle for highlighted / selected node
      if ((isSelected || isHovered) && isHighlighted) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 6, 0, 2 * Math.PI, false);
        ctx.fillStyle = colors.glow;
        ctx.fill();
        ctx.restore();
      }

      // Main node body
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
      ctx.fillStyle = isHighlighted ? colors.bg : `rgba(100, 116, 139, ${alpha})`;
      ctx.fill();

      // Border
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.strokeStyle = isHighlighted ? colors.border : `rgba(148, 163, 184, ${alpha})`;
      ctx.stroke();
      ctx.restore();

      // Label text
      const label = node.name || node.label || node.id;
      const fontSize = Math.max(10 / globalScale, 3);
      if (globalScale > 0.8 || isSelected || isHovered) {
        ctx.save();
        ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isHighlighted ? "rgba(241, 245, 249, 0.95)" : `rgba(148, 163, 184, ${alpha})`;
        ctx.fillText(label, node.x, node.y + radius + fontSize + 2);
        ctx.restore();
      }
    },
    [selectedNode, hoveredNode, highlightNodes]
  );

  // Link drawing
  const drawLink = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isHighlighted = highlightLinks.has(link);
      const isDimmed = highlightNodes.size > 0 && !isHighlighted;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.strokeStyle = isHighlighted
        ? "rgba(167, 139, 250, 0.8)"
        : isDimmed
        ? "rgba(71, 85, 105, 0.1)"
        : "rgba(99, 102, 241, 0.25)";
      ctx.stroke();

      // Draw relationship label on link if zoomed in or highlighted
      if ((isHighlighted || globalScale > 2) && link.relationship) {
        const midX = (link.source.x + link.target.x) / 2;
        const midY = (link.source.y + link.target.y) / 2;
        const fontSize = Math.max(8 / globalScale, 2.5);
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isHighlighted ? "#c4b5fd" : "rgba(148, 163, 184, 0.6)";
        ctx.fillText(link.relationship, midX, midY - 4);
      }
      ctx.restore();
    },
    [highlightLinks, highlightNodes]
  );

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="w-full h-[600px] rounded-2xl bg-card border border-border flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading knowledge graph...</p>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="w-full h-[500px] rounded-2xl bg-card border border-border flex flex-col items-center justify-center gap-3 text-center px-4">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm text-muted-foreground max-w-sm">
          Failed to load the knowledge graph. Ensure the backend is connected.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty state (0 nodes) ──
  if (nodes.length === 0) {
    return (
      <div className="w-full h-[550px] rounded-2xl bg-card border border-border flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 text-primary glow-primary">
          <Share2 className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">
          Knowledge Graph is Empty
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          NexaMind automatically constructs an interconnected entity graph as you
          converse. Mention people, projects, places, and facts in chat to start
          building your personalized graph!
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-surface px-3 py-2 rounded-lg border border-border">
          <Sparkles className="w-4 h-4 text-primary" />
          <span>Tip: Try asking &quot;Remember that my friend Sarah works at OpenAI&quot;</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[650px] rounded-2xl bg-[#050508] border border-border/80 overflow-hidden shadow-2xl flex flex-col"
    >
      {/* ── Top Floating Toolbar ── */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: Search + Type filters */}
        <div className="flex items-center gap-2 pointer-events-auto flex-wrap">
          {/* Search box */}
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/90 border border-border backdrop-blur-md shadow-lg">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Find entity..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none w-36 sm:w-48"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Search autocomplete dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-64 max-h-48 overflow-y-auto rounded-xl bg-card border border-border shadow-2xl p-1 z-30 backdrop-blur-xl">
                {searchResults.slice(0, 8).map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      handleSelectNode(result);
                      setSearchQuery("");
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-surface text-left transition-colors"
                  >
                    <span className="font-medium text-foreground truncate">
                      {result.name || result.label || result.id}
                    </span>
                    <span className="text-[10px] uppercase text-muted-foreground px-1.5 py-0.5 rounded bg-surface border border-border/50">
                      {result.type || result.entity_type || "entity"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type filter pills */}
          <div className="hidden sm:flex items-center gap-1.5 bg-card/90 border border-border rounded-xl p-1 backdrop-blur-md shadow-lg">
            <button
              onClick={() => setSelectedTypeFilter("all")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                selectedTypeFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({nodes.length})
            </button>
            {entityTypes.slice(0, 5).map((type) => {
              const count = nodes.filter(
                (n) => (n.type || n.entity_type || "").toLowerCase() === type
              ).length;
              const col = getNodeColor(type);
              return (
                <button
                  key={type}
                  onClick={() => setSelectedTypeFilter(type)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                    selectedTypeFilter === type
                      ? "bg-surface border border-primary/40 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: col.bg }}
                  />
                  <span className="capitalize">{type}</span>
                  <span className="text-[10px] text-muted-foreground">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Controls & Clear */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Zoom controls */}
          <div className="flex items-center bg-card/90 border border-border rounded-xl p-1 backdrop-blur-md shadow-lg">
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-surface transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-surface transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-surface transition-colors"
              title="Reset View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Clear Graph button */}
          <button
            onClick={() => setShowClearModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/40 text-xs font-medium backdrop-blur-md transition-colors shadow-lg"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear Graph</span>
          </button>
        </div>
      </div>

      {/* ── Graph Canvas ── */}
      <div className="flex-1 w-full h-full">
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          backgroundColor="#050508"
          nodeRelSize={6}
          nodeCanvasObject={drawNode}
          linkCanvasObject={drawLink}
          onNodeClick={(node) => handleSelectNode(node ? (node as unknown as GraphNode) : null)}
          onNodeHover={(node) => setHoveredNode(node ? (node as unknown as GraphNode) : null)}
          onBackgroundClick={() => setSelectedNode(null)}
          cooldownTicks={120}
          d3VelocityDecay={0.3}
        />
      </div>

      {/* ── Bottom Stats Bar ── */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-card/85 border border-border backdrop-blur-md text-[11px] text-muted-foreground shadow-lg">
          <div>
            <span className="font-semibold text-foreground">
              {stats.total_entities || nodes.length}
            </span>{" "}
            Entities
          </div>
          <span className="text-border">•</span>
          <div>
            <span className="font-semibold text-foreground">
              {stats.total_relationships || links.length}
            </span>{" "}
            Relationships
          </div>
        </div>
      </div>

      {/* ── Selected Node Inspector Card ── */}
      {selectedNode && (
        <div className="absolute top-16 right-4 w-72 sm:w-80 rounded-2xl bg-card/95 border border-border shadow-2xl p-4 z-20 backdrop-blur-xl animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: getNodeColor(
                      selectedNode.type || selectedNode.entity_type
                    ).bg,
                  }}
                />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {selectedNode.type || selectedNode.entity_type || "Entity"}
                </span>
              </div>
              <h4 className="text-base font-bold text-foreground truncate">
                {selectedNode.name || selectedNode.label || selectedNode.id}
              </h4>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {/* Mention Count */}
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface border border-border/60">
              <span className="text-muted-foreground">Mentions</span>
              <span className="font-semibold text-foreground">
                {selectedNode.mention_count || 1} times
              </span>
            </div>

            {/* Observations / Facts */}
            {selectedNode.observations && selectedNode.observations.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                  Extracted Observations:
                </span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {selectedNode.observations.map((obs, i) => (
                    <div
                      key={i}
                      className="p-2 rounded-lg bg-surface/70 border border-border/40 text-muted-foreground text-[11px] leading-relaxed"
                    >
                      {obs}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Connected Neighbors */}
            <div>
              <span className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                Connected Relationships:
              </span>
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {links
                  .filter((l) => {
                    const s = typeof l.source === "object" ? (l.source as any).id : l.source;
                    const t = typeof l.target === "object" ? (l.target as any).id : l.target;
                    return s === selectedNode.id || t === selectedNode.id;
                  })
                  .map((l, i) => {
                    const s = typeof l.source === "object" ? (l.source as any).id : l.source;
                    const isSource = s === selectedNode.id;
                    const otherId = isSource
                      ? typeof l.target === "object"
                        ? (l.target as any).id
                        : l.target
                      : s;
                    const otherNode = nodes.find((n) => n.id === otherId);
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between px-2 py-1 rounded bg-surface/50 text-[11px]"
                      >
                        <span className="text-primary font-medium">
                          {l.relationship || "connected to"}
                        </span>
                        <span className="text-foreground truncate max-w-[120px]">
                          {otherNode?.name || otherId}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Graph Confirmation Modal ── */}
      {showClearModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Clear Knowledge Graph?
                </h3>
                <p className="text-xs text-muted-foreground">
                  This will delete all extracted entities and relationships.
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to clear your entire knowledge graph? This action
              cannot be undone. The graph will begin regenerating as new conversations occur.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearModal(false)}
                disabled={clearGraphMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                disabled={clearGraphMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {clearGraphMutation.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Clear Graph
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
