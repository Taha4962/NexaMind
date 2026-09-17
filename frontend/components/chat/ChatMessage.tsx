"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import type { Message } from "@/types";
import AgentBadge from "./AgentBadge";
import SourceCitations from "./SourceCitations";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground
                 transition-colors opacity-0 group-hover:opacity-100"
      aria-label={copied ? "Copied!" : "Copy code"}
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

function CodeBlock({ language, children }: { language: string; children: string }) {
  return (
    <div className="relative group my-3 rounded-xl overflow-hidden border border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-accent/80 border-b border-border">
        <span className="text-xs text-muted-foreground font-mono">
          {language || "code"}
        </span>
        <CopyButton text={children} />
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          background: "hsl(240 21% 6%)",
          fontSize: "0.8rem",
          padding: "1rem",
        }}
        PreTag="div"
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  return (
    <div className={`prose-dark text-sm leading-relaxed${isStreaming ? " streaming-cursor" : ""}`}>
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeStr = String(children).replace(/\n$/, "");
            const isBlock = codeStr.includes("\n") || match;

            if (isBlock) {
              return (
                <CodeBlock language={match?.[1] ?? ""}>
                  {codeStr}
                </CodeBlock>
              );
            }
            return (
              <code
                className="bg-accent text-primary px-1.5 py-0.5 rounded text-[0.8em] font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold mb-3 text-foreground">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mb-2 text-foreground">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mb-2 text-foreground">{children}</h3>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary/40 pl-4 text-muted-foreground italic my-3">
                {children}
              </blockquote>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {children}
              </a>
            );
          },
          hr() {
            return <hr className="border-border my-4" />;
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-border bg-accent px-3 py-2 text-left font-medium">
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="border border-border px-3 py-2">{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function ChatMessage({
  message,
  isStreaming = false,
  streamingContent,
}: ChatMessageProps) {
  const [thumbsUp, setThumbsUp] = useState(false);
  const [thumbsDown, setThumbsDown] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";
  const displayContent =
    isStreaming && streamingContent !== undefined
      ? streamingContent
      : message.content;

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end message-enter">
        <div className="max-w-[75%] lg:max-w-[65%]">
          <div className="bg-primary/15 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 message-enter group">
      {/* NexaMind avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 border border-primary/30
                      flex items-center justify-center glow-sm mt-1">
        <span className="text-xs font-bold text-primary">N</span>
      </div>

      {/* Bubble + actions */}
      <div className="flex-1 min-w-0 max-w-[85%] lg:max-w-[75%]">
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
          <MessageContent content={displayContent} isStreaming={isStreaming} />
        </div>

        {/* Footer: badge, sources, actions */}
        {!isStreaming && (
          <div className="mt-2 space-y-1.5">
            {/* Agent badge */}
            {message.agentType && (
              <AgentBadge agentType={message.agentType} />
            )}

            {/* Source citations */}
            {message.sources && message.sources.length > 0 && (
              <SourceCitations sources={message.sources} />
            )}

            {/* Action row */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopyMessage}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                aria-label={copied ? "Copied!" : "Copy message"}
                title={copied ? "Copied!" : "Copy message"}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => { setThumbsUp(!thumbsUp); setThumbsDown(false); }}
                className={`p-1.5 rounded-lg hover:bg-accent transition-colors ${
                  thumbsUp ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Thumbs up"
                aria-pressed={thumbsUp}
              >
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setThumbsDown(!thumbsDown); setThumbsUp(false); }}
                className={`p-1.5 rounded-lg hover:bg-accent transition-colors ${
                  thumbsDown ? "text-red-400" : "text-muted-foreground hover:text-foreground"
                }`}
                aria-label="Thumbs down"
                aria-pressed={thumbsDown}
              >
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
