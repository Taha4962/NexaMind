"use client";

import type { AgentType } from "@/types";

interface AgentBadgeProps {
  agentType: AgentType | null;
}

const BADGE_CONFIG: Record<
  Exclude<AgentType, "direct">,
  { label: string; icon: string; className: string }
> = {
  rag: {
    label: "From documents",
    icon: "📄",
    className:
      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  memory: {
    label: "From memory",
    icon: "🧠",
    className:
      "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  web: {
    label: "From web",
    icon: "🌐",
    className:
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
};

export default function AgentBadge({ agentType }: AgentBadgeProps) {
  if (!agentType || agentType === "direct") return null;

  const config = BADGE_CONFIG[agentType];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}
    >
      <span role="img" aria-hidden="true">
        {config.icon}
      </span>
      {config.label}
    </span>
  );
}
