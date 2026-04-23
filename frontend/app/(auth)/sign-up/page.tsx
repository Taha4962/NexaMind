/**
 * NexaMind Frontend — Sign Up Page
 *
 * User registration with email/password.
 * Will be implemented in the authentication step.
 */

import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Sign Up",
  description: `Create your ${APP_NAME} account`,
};

/**
 * Sign up page component shell.
 */
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold gradient-text">{APP_NAME}</h1>
          <p className="mt-2 text-muted-foreground">
            Create your account
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-8 shadow-lg">
          <p className="text-center text-muted-foreground">
            Registration form will be implemented in the authentication step.
          </p>
        </div>
      </div>
    </div>
  );
}
