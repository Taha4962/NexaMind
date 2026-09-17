"use client";

/**
 * NexaMind Frontend — Individual Chat Page
 *
 * Full conversation view:
 *   - Header with editable chat title, model selector dropdown, and context badges
 *   - MessageList with auto-scroll and streaming state
 *   - Pinned ChatInput with document attachment support
 */

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Loader2,
  Edit2,
  Check,
  X,
  Sparkles,
  ChevronDown,
  Cpu,
} from "lucide-react";
import { useChat, useStreamChat } from "@/hooks/useChat";
import { useDocuments } from "@/hooks/useDocuments";
import api from "@/lib/api";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";

const AVAILABLE_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "Fast & Smart" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", badge: "Ultra Fast" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", badge: "Deep Reasoning" },
];

export default function ChatPage() {
  const params = useParams();
  const chatId = typeof params?.id === "string" ? params.id : null;
  const queryClient = useQueryClient();

  const { chat, messages, isLoading, error } = useChat(chatId);
  const {
    sendMessage,
    isStreaming,
    streamingContent,
    isWaitingForFirstToken,
    error: streamError,
  } = useStreamChat();
  const { documents, isLoading: docsLoading } = useDocuments();

  // Inline title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Model selection state
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Sync title when chat data loads
  useEffect(() => {
    if (chat?.title) {
      setEditedTitle(chat.title);
    }
  }, [chat?.title]);

  // Focus title input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Close model dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setIsModelDropdownOpen(false);
      }
    };
    if (isModelDropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isModelDropdownOpen]);

  const handleSaveTitle = async () => {
    if (!chatId || !editedTitle.trim() || editedTitle === chat?.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      setIsSavingTitle(true);
      await api.patch(`/chats/${chatId}`, { title: editedTitle.trim() });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      setIsEditingTitle(false);
    } catch {
      // Revert title on failure
      setEditedTitle(chat?.title || "Conversation");
      setIsEditingTitle(false);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === "Escape") {
      setEditedTitle(chat?.title || "Conversation");
      setIsEditingTitle(false);
    }
  };

  const handleSend = async (message: string, attachedDocIds: string[]) => {
    await sendMessage(message, chatId, attachedDocIds);
  };

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="p-3 rounded-full bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-sm text-muted-foreground">
            Failed to load this conversation. It may have been deleted or you
            may not have access.
          </p>
        </div>
      </div>
    );
  }

  const currentModel =
    AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* ── Chat Header ── */}
      <header className="h-14 border-b border-border/60 bg-background/80 backdrop-blur-md px-4 flex items-center justify-between flex-shrink-0 z-10">
        {/* Left: Chat Title (Editable) */}
        <div className="flex items-center gap-2 min-w-0 max-w-md">
          {isEditingTitle ? (
            <div className="flex items-center gap-1.5 flex-1">
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                disabled={isSavingTitle}
                className="w-full text-sm font-semibold bg-surface border border-primary/40 rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                maxLength={80}
              />
              <button
                onClick={handleSaveTitle}
                disabled={isSavingTitle}
                aria-label="Save title"
                className="p-1 text-emerald-400 hover:text-emerald-300 rounded hover:bg-surface transition-colors"
              >
                {isSavingTitle ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => {
                  setEditedTitle(chat?.title || "Conversation");
                  setIsEditingTitle(false);
                }}
                disabled={isSavingTitle}
                aria-label="Cancel editing"
                className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-surface transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="group flex items-center gap-2 text-left truncate py-1 px-1.5 rounded-md hover:bg-surface/80 transition-colors"
              title="Click to rename chat"
            >
              <h1 className="text-sm font-semibold text-foreground truncate max-w-[280px]">
                {chat?.title || "Untitled Conversation"}
              </h1>
              <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          )}
        </div>

        {/* Right: Model Selector Dropdown */}
        <div className="relative" ref={modelDropdownRef}>
          <button
            onClick={() => setIsModelDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface/70 border border-border/80 hover:border-primary/40 hover:bg-surface text-xs font-medium text-muted-foreground hover:text-foreground transition-all duration-200"
            aria-expanded={isModelDropdownOpen}
            aria-haspopup="true"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>{currentModel.name}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>

          {isModelDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-card border border-border shadow-2xl p-1 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Active Reasoning Engine
              </div>
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model.id);
                    setIsModelDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                    selectedModel === model.id
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5" />
                    <span>{model.name}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface/80 text-muted-foreground">
                    {model.badge}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Stream error banner */}
      {streamError && (
        <div
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm flex-shrink-0"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {streamError}
        </div>
      )}

      {/* Message list — fills available space */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        isWaitingForFirstToken={isWaitingForFirstToken}
      />

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-border bg-card/50 backdrop-blur">
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          documents={documents}
          documentsLoading={docsLoading}
          autoFocus
        />
      </div>
    </div>
  );
}
