/**
 * useKeyboardShortcuts — registers global keyboard shortcuts for the chat UI.
 *
 * Shortcuts:
 *   Ctrl/Cmd + K  → Start new chat (navigate to /)
 *   Ctrl/Cmd + /  → Focus sidebar search
 *   Escape        → Close any open modal (fires a custom "nexamind:escape" event)
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd + K → new chat
      if (isMeta && e.key === "k") {
        e.preventDefault();
        router.push("/");
        return;
      }

      // Ctrl/Cmd + / → focus sidebar search
      if (isMeta && e.key === "/") {
        e.preventDefault();
        const searchInput = document.getElementById(
          "sidebar-search"
        ) as HTMLInputElement | null;
        searchInput?.focus();
        searchInput?.select();
        return;
      }

      // Escape → broadcast close-modal event
      if (e.key === "Escape") {
        window.dispatchEvent(new CustomEvent("nexamind:escape"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);
}
