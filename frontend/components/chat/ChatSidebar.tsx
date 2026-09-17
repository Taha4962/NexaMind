"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Search,
  MessageSquare,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useChatList } from "@/hooks/useChat";
import type { Chat } from "@/types";
import api from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

// ── Date grouping ─────────────────────────────────────────────────────────────

type DateGroup = "Today" | "Yesterday" | "Last 7 days" | "Older";

function getDateGroup(dateStr: string | null): DateGroup {
  if (!dateStr) return "Older";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return "Today";
  if (diffDays < 2) return "Yesterday";
  if (diffDays < 7) return "Last 7 days";
  return "Older";
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const GROUP_ORDER: DateGroup[] = ["Today", "Yesterday", "Last 7 days", "Older"];

// ── Delete confirmation dialog ────────────────────────────────────────────────

interface DeleteDialogProps {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

function DeleteDialog({ title, onConfirm, onCancel, isDeleting }: DeleteDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-500/10 flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Delete chat?</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              &ldquo;{title}&rdquo; will be permanently deleted.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent
                       text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-500/90 hover:bg-red-500 text-white
                       transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

interface ChatSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function ChatSidebar({ collapsed, onToggle }: ChatSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { chats, isLoading, error } = useChatList();

  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Chat | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const activeChatId = pathname.startsWith("/chat/")
    ? pathname.split("/chat/")[1]
    : null;

  // Filter by search
  const filtered = chats.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  // Group by date
  const grouped = GROUP_ORDER.reduce<Record<DateGroup, Chat[]>>(
    (acc, group) => {
      acc[group] = filtered.filter(
        (c) => getDateGroup(c.lastMessageAt ?? c.createdAt) === group
      );
      return acc;
    },
    { Today: [], Yesterday: [], "Last 7 days": [], Older: [] }
  );

  const handleNewChat = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleChatClick = useCallback(
    (id: string) => {
      router.push(`/chat/${id}`);
    },
    [router]
  );

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    try {
      await api.delete(`/chats/${confirmDelete.id}`);
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      if (activeChatId === confirmDelete.id) router.push("/");
    } catch {
      // Silent fail — user stays in place
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  if (collapsed) {
    return (
      <aside className="flex flex-col w-14 border-r border-border bg-card/80 backdrop-blur items-center py-4 gap-3">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={handleNewChat}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label="New chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <>
      <aside
        className="flex flex-col w-72 border-r border-border bg-card/80 backdrop-blur flex-shrink-0"
        aria-label="Chat history sidebar"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
          <span className="text-sm font-semibold gradient-text">NexaMind</span>
          <div className="flex items-center gap-1">
            <button
              id="new-chat-button"
              onClick={handleNewChat}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground
                         transition-colors"
              aria-label="New chat (Ctrl+K)"
              title="New chat (Ctrl+K)"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground
                         transition-colors"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              id="sidebar-search"
              type="search"
              placeholder="Search chats..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-accent/50 border border-border rounded-lg pl-8 pr-3 py-1.5
                         text-sm text-foreground placeholder:text-muted-foreground/60
                         focus:outline-none focus:border-primary/40 focus:bg-accent/70
                         transition-all duration-150"
            />
          </div>
        </div>

        {/* Chat list */}
        <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Chat list">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-6 px-3">
              <p className="text-xs text-muted-foreground">Failed to load chats</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-6 px-3">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {search ? "No chats match your search" : "No conversations yet"}
              </p>
            </div>
          ) : (
            GROUP_ORDER.map((group) => {
              if (grouped[group].length === 0) return null;
              return (
                <div key={group} className="mb-3">
                  <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                    {group}
                  </p>
                  {grouped[group].map((chat) => (
                    <div
                      key={chat.id}
                      className={`sidebar-item group ${activeChatId === chat.id ? "active" : ""}`}
                      onClick={() => handleChatClick(chat.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open chat: ${chat.title}`}
                      onKeyDown={(e) => e.key === "Enter" && handleChatClick(chat.id)}
                    >
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted-foreground/60" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm leading-snug">{chat.title}</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                          {formatRelativeTime(chat.lastMessageAt ?? chat.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(chat);
                        }}
                        className="flex-shrink-0 p-1 rounded hover:bg-red-500/10 text-muted-foreground/40
                                   hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        aria-label={`Delete ${chat.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </nav>
      </aside>

      {/* Delete confirmation */}
      {confirmDelete && (
        <DeleteDialog
          title={confirmDelete.title}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
          isDeleting={deletingId === confirmDelete.id}
        />
      )}
    </>
  );
}
