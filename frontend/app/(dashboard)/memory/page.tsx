/**
 * NexaMind Frontend — Memory Dashboard Page
 *
 * View and manage AI memories about the user.
 * Will be implemented in the memory UI step.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Memory",
  description: "View and manage what the AI remembers about you",
};

/**
 * Memory dashboard page component shell.
 */
export default function MemoryPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Memory</h1>
        <p className="text-muted-foreground mt-1">
          View and manage what the AI remembers about you across conversations.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-8 shadow-lg">
        <p className="text-center text-muted-foreground">
          Memory dashboard with fact/preference management will be
          implemented in the memory UI step.
        </p>
      </div>
    </div>
  );
}
