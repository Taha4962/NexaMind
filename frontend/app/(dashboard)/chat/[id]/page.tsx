/**
 * NexaMind Frontend — Individual Chat Page
 *
 * Displays a specific chat conversation with message history
 * and the chat input. Will be implemented in the UI step.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat",
};

/**
 * Individual chat page component shell.
 *
 * Receives the chat ID from the URL params and displays
 * the full conversation history with the AI assistant.
 */
export default function ChatPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            Chat: {params.id}
          </h2>
          <p className="text-muted-foreground">
            Chat interface with message history and input will be
            implemented in the UI step.
          </p>
        </div>
      </div>
    </div>
  );
}
