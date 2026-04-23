/**
 * NexaMind Frontend — Documents Manager Page
 *
 * Upload, view, and manage documents for RAG.
 * Will be implemented in the documents UI step.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documents",
  description: "Manage your uploaded documents for AI-powered search",
};

/**
 * Documents manager page component shell.
 */
export default function DocumentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-muted-foreground mt-1">
          Upload and manage documents for RAG-powered conversations.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-8 shadow-lg">
        <p className="text-center text-muted-foreground">
          Document upload and management interface will be implemented
          in the documents UI step.
        </p>
      </div>
    </div>
  );
}
