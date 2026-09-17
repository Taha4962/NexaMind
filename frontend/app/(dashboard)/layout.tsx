"use client";

/**
 * NexaMind Frontend — Dashboard Layout (Client Component)
 *
 * Two-column layout: collapsible ChatSidebar (280px) + main content area.
 * Top bar with NexaMind logo and user avatar dropdown.
 * Must be a client component because it manages sidebar collapse state.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Settings,
  Brain,
  FileText,
  ChevronDown,
} from "lucide-react";
import ChatSidebar from "@/components/chat/ChatSidebar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSession } from "@/hooks/useSession";
import api from "@/lib/api";

function UserMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user } = useSession();

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      sessionStorage.removeItem("nexamind_access_token");
      router.push("/sign-in");
    }
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="relative">
      <button
        id="user-menu-button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent
                   text-muted-foreground hover:text-foreground transition-colors"
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div
          className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center
                     justify-center text-xs font-semibold text-primary"
        >
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <span className="text-sm font-medium hidden sm:block max-w-[120px] truncate">
          {user?.name ?? "Account"}
        </span>
        <ChevronDown className="w-3.5 h-3.5 hidden sm:block" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div
            className="absolute right-0 top-full mt-1.5 w-52 bg-popover border border-border
                       rounded-xl shadow-2xl z-40 overflow-hidden py-1"
            role="menu"
          >
            {user && (
              <div className="px-3 py-2.5 border-b border-border mb-1">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            )}
            <button
              onClick={() => { router.push("/memory"); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground
                         hover:bg-accent hover:text-foreground transition-colors"
              role="menuitem"
            >
              <Brain className="w-4 h-4" />
              Memory
            </button>
            <button
              onClick={() => { router.push("/documents"); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground
                         hover:bg-accent hover:text-foreground transition-colors"
              role="menuitem"
            >
              <FileText className="w-4 h-4" />
              Documents
            </button>
            <button
              onClick={() => { router.push("/settings"); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground
                         hover:bg-accent hover:text-foreground transition-colors"
              role="menuitem"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400
                           hover:bg-red-500/10 transition-colors"
                role="menuitem"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <ChatSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="flex h-12 items-center justify-between border-b border-border px-4 flex-shrink-0 bg-card/50 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center glow-sm">
              <span className="text-[10px] font-bold text-primary">N</span>
            </div>
            <span className="text-sm font-semibold text-foreground hidden sm:block">
              NexaMind
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/40 hidden lg:block">
              Ctrl+K new chat · Ctrl+/ search
            </span>
            <UserMenu />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
