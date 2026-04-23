/**
 * NexaMind Frontend — Dashboard Layout
 *
 * Auth-protected layout shell for all dashboard pages.
 * Provides the sidebar, header, and main content area.
 * Redirects unauthenticated users to /sign-in.
 */

import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: `%s | ${APP_NAME}`,
  },
};

/**
 * Dashboard layout component.
 *
 * Wraps all dashboard pages with a consistent layout including
 * sidebar navigation, header, and main content area. Authentication
 * is enforced by the middleware — this layout assumes the user is
 * authenticated by the time it renders.
 */
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar — will be implemented in the UI step */}
      <aside className="hidden md:flex w-72 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 border-b border-border">
          <h2 className="text-xl font-bold gradient-text">{APP_NAME}</h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground">
            Sidebar navigation will be built in the UI step.
          </p>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header — will be implemented in the UI step */}
        <header className="flex h-16 items-center justify-between border-b border-border px-6">
          <div />
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Header will be built in the UI step.
            </p>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
