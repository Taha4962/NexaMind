"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import type { Message } from "@/types";
import ChatMessage from "./ChatMessage";
import TypingIndicator from "./TypingIndicator";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  isWaitingForFirstToken: boolean;
}

export default function MessageList({
  messages,
  isStreaming,
  streamingContent,
  isWaitingForFirstToken,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isUserScrollingRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  // Auto-scroll when new content arrives (unless user scrolled up)
  useEffect(() => {
    if (!isUserScrollingRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages.length, streamingContent, scrollToBottom]);

  // Show/hide scroll button based on scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setShowScrollButton(distanceFromBottom > 120);
      isUserScrollingRef.current = distanceFromBottom > 120;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Create a synthetic streaming message to show accumulating text
  const streamingMessage: Message | null =
    isStreaming && streamingContent
      ? {
          id: "__streaming__",
          role: "assistant",
          content: streamingContent,
          sources: [],
          agentType: null,
          createdAt: new Date().toISOString(),
        }
      : null;

  const isEmpty =
    messages.length === 0 && !isStreaming && !isWaitingForFirstToken;

  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">
          Start the conversation below.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-4 py-6 space-y-6 scroll-smooth"
        style={{ scrollbarGutter: "stable" }}
      >
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Typing indicator: waiting for first token */}
        {isWaitingForFirstToken && <TypingIndicator />}

        {/* Live streaming message */}
        {streamingMessage && (
          <ChatMessage
            key="__streaming__"
            message={streamingMessage}
            isStreaming
            streamingContent={streamingContent}
          />
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollButton && (
        <button
          onClick={() => {
            isUserScrollingRef.current = false;
            scrollToBottom("smooth");
          }}
          className="absolute bottom-4 right-4 p-2 rounded-full bg-primary/90 text-primary-foreground
                     shadow-lg hover:bg-primary transition-all duration-200 glow-sm
                     flex items-center justify-center"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
