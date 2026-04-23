/**
 * NexaMind Frontend — Custom 404 Page
 *
 * Displayed when a user navigates to a route that doesn't exist.
 */

import Link from "next/link";
import { ROUTES, APP_NAME } from "@/lib/constants";

/**
 * Custom 404 Not Found page.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center space-y-6">
        <h1 className="text-8xl font-bold gradient-text">404</h1>
        <h2 className="text-2xl font-semibold text-foreground">
          Page Not Found
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back to {APP_NAME}.
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <Link
            href={ROUTES.HOME}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go Home
          </Link>
          <Link
            href={ROUTES.DASHBOARD}
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
