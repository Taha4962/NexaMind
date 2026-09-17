"use client";

/**
 * NexaMind Frontend — Memory Dashboard Page
 *
 * Provides:
 *   - Category filtering (preference, personal, project, event, knowledge, relationship)
 *   - Searchable memory cards with confidence indicators and delete triggers
 *   - Knowledge Graph interactive visualization tab
 *   - Strong confirmation modal for "Clear all memories" (type "DELETE")
 *   - Educational empty state explaining memory retention
 */

import { useState, useMemo } from "react";
import {
  Brain,
  Search,
  Trash2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Share2,
  Tag,
  Clock,
  X,
} from "lucide-react";
import {
  useMemories,
  useDeleteMemory,
  useClearMemories,
} from "@/hooks/useMemories";
import GraphVisualization from "@/components/memory/GraphVisualization";

const CATEGORIES: Array<{ id: string; label: string; color: string; bg: string }> = [
  { id: "all", label: "All Categories", color: "text-foreground", bg: "bg-surface" },
  { id: "preference", label: "Preferences", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { id: "personal", label: "Personal", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  { id: "project", label: "Projects", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { id: "event", label: "Events & Plans", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { id: "knowledge", label: "Knowledge", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { id: "relationship", label: "Relationships", color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
];

function getCategoryConfig(category?: string) {
  const norm = (category || "").toLowerCase();
  return (
    CATEGORIES.find((c) => c.id === norm) || {
      id: norm,
      label: category || "General",
      color: "text-primary",
      bg: "bg-primary/10 border-primary/20",
    }
  );
}

function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return "Recently";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MemoryPage() {
  const [activeTab, setActiveTab] = useState<"memories" | "graph">("memories");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Clear All Modal state
  const [showClearModal, setShowClearModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { memories, isLoading } = useMemories(
    selectedCategory === "all" ? null : selectedCategory
  );
  const deleteMutation = useDeleteMemory();
  const clearMutation = useClearMemories();

  // Filter memories by search query
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    const q = searchQuery.toLowerCase();
    return memories.filter(
      (m) =>
        m.fact.toLowerCase().includes(q) ||
        (m.category && m.category.toLowerCase().includes(q))
    );
  }, [memories, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = memories.length;
    const avgConfidence =
      total > 0
        ? Math.round(
            (memories.reduce((acc, m) => acc + (m.confidence || 1.0), 0) /
              total) *
              100
          )
        : 100;
    const categoryCounts: Record<string, number> = {};
    memories.forEach((m) => {
      const cat = (m.category || "other").toLowerCase();
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    return { total, avgConfidence, categoryCounts };
  }, [memories]);

  const handleDeleteOne = async (memoryId: string) => {
    setDeletingId(memoryId);
    try {
      await deleteMutation.mutateAsync(memoryId);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") return;
    await clearMutation.mutateAsync();
    setShowClearModal(false);
    setDeleteConfirmText("");
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Brain className="w-4 h-4" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Long-Term Memory</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Explore facts, preferences, and knowledge extracted from your conversations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Tab Switcher: Cards vs Graph */}
          <div className="flex items-center bg-card border border-border p-1 rounded-xl shadow-sm">
            <button
              onClick={() => setActiveTab("memories")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "memories"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Memories ({stats.total})</span>
            </button>
            <button
              onClick={() => setActiveTab("graph")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "graph"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Knowledge Graph</span>
            </button>
          </div>

          {/* Clear all memories button */}
          {activeTab === "memories" && memories.length > 0 && (
            <button
              onClick={() => {
                setDeleteConfirmText("");
                setShowClearModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Content View ── */}
      {activeTab === "graph" ? (
        <GraphVisualization />
      ) : (
        <div className="space-y-6">
          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-card border border-border">
              <span className="text-xs text-muted-foreground font-medium">Total Facts</span>
              <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border">
              <span className="text-xs text-muted-foreground font-medium">Avg Confidence</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.avgConfidence}%</p>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border">
              <span className="text-xs text-muted-foreground font-medium">Active Categories</span>
              <p className="text-2xl font-bold text-purple-400 mt-1">
                {Object.keys(stats.categoryCounts).length}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border">
              <span className="text-xs text-muted-foreground font-medium">Auto-Sync</span>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-foreground">Real-time</span>
              </div>
            </div>
          </div>

          {/* ── Category Filter Pills & Search ── */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Horizontal scrolling category pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                const count =
                  cat.id === "all"
                    ? stats.total
                    : stats.categoryCounts[cat.id] || 0;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-150 ${
                      isSelected
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-surface"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-surface text-muted-foreground"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search filter input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search remembered facts..."
                className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* ── Memories List / Grid ── */}
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading memories...</p>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="py-16 px-4 rounded-2xl bg-card border border-border text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4 glow-primary">
                <Brain className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-foreground mb-1.5">
                {searchQuery
                  ? "No matching memories found"
                  : selectedCategory !== "all"
                  ? `No memories in "${selectedCategory}" category`
                  : "No memories stored yet"}
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
                {searchQuery
                  ? "Try searching for a different keyword or clearing the search filter."
                  : "NexaMind extracts facts, preferences, and personal details continuously as you chat with the AI assistant."}
              </p>
              {!searchQuery && selectedCategory === "all" && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-surface px-3 py-2 rounded-lg border border-border">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span>
                    Try telling the AI in chat: &quot;I prefer Python over JavaScript&quot; or &quot;I live in Seattle&quot;.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMemories.map((mem) => {
                const memId = mem.id || mem._id || "";
                const catConfig = getCategoryConfig(mem.category);
                const confidencePct = Math.round((mem.confidence || 1.0) * 100);
                const isDeleting = deletingId === memId;

                return (
                  <div
                    key={memId}
                    className="group relative rounded-2xl bg-card border border-border p-4 hover:border-primary/40 hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
                  >
                    {/* Top row: Category Badge & Delete */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${catConfig.bg} ${catConfig.color}`}
                        >
                          <Tag className="w-3 h-3" />
                          <span className="capitalize">{mem.category || "fact"}</span>
                        </span>

                        <button
                          onClick={() => handleDeleteOne(memId)}
                          disabled={isDeleting}
                          title="Delete memory"
                          className="p-1 rounded-lg text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-100"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Fact text */}
                      <p className="text-sm font-medium text-foreground leading-relaxed mb-4">
                        {mem.fact}
                      </p>
                    </div>

                    {/* Bottom row: Confidence bar & timestamp */}
                    <div className="pt-3 border-t border-border/50 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatRelativeTime(mem.lastAccessed || mem.createdAt)}</span>
                        </div>
                        <span className="font-semibold text-foreground/80">
                          {confidencePct}% confidence
                        </span>
                      </div>

                      {/* Small progress bar */}
                      <div className="w-full h-1 rounded-full bg-surface overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-300"
                          style={{ width: `${confidencePct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Clear All Memories Confirmation Modal ── */}
      {showClearModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Clear All Memories?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Permanently erase all extracted user facts and knowledge.
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This action cannot be undone. To prevent accidental data loss, please
              type <span className="font-mono font-bold text-red-400">DELETE</span> in the
              box below to confirm.
            </p>

            <div>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder='Type "DELETE"'
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setShowClearModal(false);
                  setDeleteConfirmText("");
                }}
                disabled={clearMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                disabled={
                  deleteConfirmText.trim().toUpperCase() !== "DELETE" ||
                  clearMutation.isPending
                }
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {clearMutation.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Clear All Memories
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
