"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import {
  Send,
  Paperclip,
  X,
  FileText,
  Loader2,
} from "lucide-react";
import type { Document } from "@/types";

interface ChatInputProps {
  onSend: (message: string, attachedDocIds: string[]) => void;
  isStreaming: boolean;
  documents?: Document[];
  documentsLoading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const MAX_CHARS = 4000;

export default function ChatInput({
  onSend,
  isStreaming,
  documents = [],
  documentsLoading = false,
  placeholder = "Message NexaMind...",
  autoFocus = false,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [attachedDocIds, setAttachedDocIds] = useState<string[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const readyDocs = documents.filter((d) => d.status === "completed");
  const charCount = message.length;
  const isNearLimit = charCount > MAX_CHARS * 0.85;
  const isOverLimit = charCount > MAX_CHARS;

  // Auto-grow textarea
  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [message, adjustHeight]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Close picker on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowDocPicker(false);
      }
    };
    if (showDocPicker) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDocPicker]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isStreaming || isOverLimit) return;
    onSend(trimmed, attachedDocIds);
    setMessage("");
    setAttachedDocIds([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const toggleDoc = (docId: string) => {
    setAttachedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const removeAttachment = (docId: string) => {
    setAttachedDocIds((prev) => prev.filter((id) => id !== docId));
  };

  const attachedDocs = readyDocs.filter((d) => attachedDocIds.includes(d.id));

  return (
    <div className="relative px-4 pb-4 pt-2">
      {/* Attached doc chips */}
      {attachedDocs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachedDocs.map((doc) => (
            <span
              key={doc.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs
                         bg-blue-500/10 border border-blue-500/20 text-blue-400"
            >
              <FileText className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[140px]">{doc.filename}</span>
              <button
                onClick={() => removeAttachment(doc.id)}
                className="ml-0.5 hover:text-blue-200 transition-colors"
                aria-label={`Remove ${doc.filename}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input container */}
      <div
        className={`flex items-end gap-2 bg-card border rounded-2xl px-3 py-2 transition-all duration-150
                    ${isOverLimit ? "border-red-500/50" : "border-border focus-within:border-primary/40 focus-within:glow-sm"}`}
      >
        {/* Attach button */}
        <div className="relative" ref={pickerRef}>
          <button
            id="chat-attach-button"
            onClick={() => setShowDocPicker((v) => !v)}
            disabled={isStreaming || readyDocs.length === 0}
            className={`flex-shrink-0 p-1.5 rounded-lg transition-colors mb-1
                        ${attachedDocIds.length > 0
                          ? "text-blue-400 hover:bg-blue-500/10"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }
                        disabled:opacity-40 disabled:cursor-not-allowed`}
            aria-label="Attach documents"
            title="Scope search to specific documents"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Document picker popover */}
          {showDocPicker && (
            <div
              className="absolute bottom-full left-0 mb-2 w-72 bg-popover border border-border
                         rounded-xl shadow-2xl z-20 overflow-hidden"
            >
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-xs font-semibold text-foreground">
                  Scope to documents
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select documents to search. Leave empty to search all.
                </p>
              </div>
              <div className="max-h-56 overflow-y-auto p-1.5">
                {documentsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : readyDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-3">
                    No ready documents found.
                  </p>
                ) : (
                  readyDocs.map((doc) => {
                    const isSelected = attachedDocIds.includes(doc.id);
                    return (
                      <button
                        key={doc.id}
                        onClick={() => toggleDoc(doc.id)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left
                                    text-sm transition-colors mb-0.5
                                    ${isSelected
                                      ? "bg-primary/10 text-foreground"
                                      : "hover:bg-accent text-muted-foreground hover:text-foreground"
                                    }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center
                                      transition-colors
                                      ${isSelected
                                        ? "bg-primary border-primary"
                                        : "border-border"
                                      }`}
                        >
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate">{doc.filename}</span>
                      </button>
                    );
                  })
                )}
              </div>
              {attachedDocIds.length > 0 && (
                <div className="px-3 py-2 border-t border-border">
                  <button
                    onClick={() => setAttachedDocIds([])}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          id="chat-message-input"
          value={message}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Waiting for response..." : placeholder}
          disabled={isStreaming}
          rows={1}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50
                     resize-none outline-none py-1.5 leading-relaxed disabled:opacity-50
                     disabled:cursor-not-allowed min-h-[36px] max-h-[200px]"
          style={{ scrollbarWidth: "none" }}
          aria-label="Message input"
          aria-describedby="char-counter"
        />

        {/* Character counter + send */}
        <div className="flex-shrink-0 flex items-end gap-1.5 mb-1">
          {isNearLimit && (
            <span
              id="char-counter"
              className={`text-xs tabular-nums ${
                isOverLimit ? "text-red-400" : "text-muted-foreground"
              }`}
            >
              {MAX_CHARS - charCount}
            </span>
          )}
          <button
            id="chat-send-button"
            onClick={handleSend}
            disabled={
              isStreaming || !message.trim() || isOverLimit
            }
            className="p-2 rounded-xl bg-primary text-primary-foreground
                       hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all duration-150 flex items-center justify-center glow-sm"
            aria-label="Send message"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground/40 mt-1.5">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
