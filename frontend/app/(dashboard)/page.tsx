/**
 * NexaMind Frontend — Dashboard Home Page
 *
 * New chat home page — the default landing page after login.
 * Will display a welcome message and quick actions.
 */

import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Dashboard",
  description: `${APP_NAME} — Start a new chat or continue a conversation`,
};

/**
 * Dashboard home page component shell.
 */
export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl font-bold gradient-text">
          Welcome to {APP_NAME}
        </h1>
        <p className="text-lg text-muted-foreground">
          Your personal AI agent with memory, document understanding,
          and web search capabilities.
        </p>
        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          <p className="text-muted-foreground">
            Chat interface will be implemented in the UI step.
            Start a new conversation by typing your message below.
          </p>
        </div>
      </div>
    </div>
  );
}
