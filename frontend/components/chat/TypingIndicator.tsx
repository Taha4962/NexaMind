"use client";

export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 message-enter">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center glow-sm">
        <span className="text-xs font-bold text-primary">N</span>
      </div>

      {/* Bouncing dots */}
      <div className="flex items-center gap-1.5 bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 mt-1">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}
