"use client";

/**
 * NexaMind Frontend — Dashboard Home (New Chat)
 *
 * Empty state with centered ChatInput and suggested prompt chips.
 * On first message send, redirects to /chat/[id].
 */

import { useRouter } from "next/navigation";
import { Sparkles, FileText, Brain, Globe } from "lucide-react";
import ChatInput from "@/components/chat/ChatInput";
import { useStreamChat } from "@/hooks/useChat";
import { useDocuments } from "@/hooks/useDocuments";

const SUGGESTED_PROMPTS = [
  {
    icon: FileText,
    label: "Summarize my documents",
    prompt: "Please summarize the key points from my uploaded documents.",
    color: "text-blue-400",
    bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20 hover:border-blue-500/40",
  },
  {
    icon: Brain,
    label: "What do you remember about me?",
    prompt: "What do you know and remember about me so far?",
    color: "text-purple-400",
    bg: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20 hover:border-purple-500/40",
  },
  {
    icon: Globe,
    label: "Latest AI news",
    prompt: "What are the latest developments and news in AI today?",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40",
  },
  {
    icon: Sparkles,
    label: "Help me brainstorm ideas",
    prompt: "I need help brainstorming ideas for a new project. Can you guide me?",
    color: "text-amber-400",
    bg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/40",
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const { sendMessage, isStreaming } = useStreamChat();
  const { documents, isLoading: docsLoading } = useDocuments();

  const handleSend = async (message: string, attachedDocIds: string[]) => {
    const resolvedChatId = await sendMessage(message, null, attachedDocIds);
    if (resolvedChatId) {
      router.push(`/chat/${resolvedChatId}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
      {/* Hero section */}
      <div className="text-center space-y-3 mb-10">
        <div
          className="w-16 h-16 mx-auto rounded-2xl bg-primary/20 border border-primary/30
                     flex items-center justify-center glow-primary mb-4"
        >
          <span className="text-2xl font-bold gradient-text">N</span>
        </div>
        <h1 className="text-3xl font-bold gradient-text">
          How can I help you today?
        </h1>
        <p className="text-muted-foreground text-sm max-w-md">
          Ask me anything — I can search your documents, recall past
          conversations, look up the web, or just chat.
        </p>
      </div>

      {/* Suggested prompts */}
      <div className="grid grid-cols-2 gap-2 w-full max-w-xl mb-8">
        {SUGGESTED_PROMPTS.map(({ icon: Icon, label, prompt, color, bg }) => (
          <button
            key={label}
            onClick={() => handleSend(prompt, [])}
            disabled={isStreaming}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left
                        border transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed
                        ${bg}`}
          >
            <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
            <span className="text-muted-foreground">{label}</span>
          </button>
        ))}
      </div>

      {/* Chat input */}
      <div className="w-full max-w-2xl">
        <div className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
          <ChatInput
            onSend={handleSend}
            isStreaming={isStreaming}
            documents={documents}
            documentsLoading={docsLoading}
            placeholder="Message NexaMind — ask anything..."
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
