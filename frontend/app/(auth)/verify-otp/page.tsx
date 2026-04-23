/**
 * NexaMind Frontend — OTP Verification Page
 *
 * 6-digit OTP verification for email confirmation and 2FA.
 * Will be implemented in the authentication step.
 */

import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Verify OTP",
  description: `Verify your ${APP_NAME} account with OTP`,
};

/**
 * OTP verification page component shell.
 */
export default function VerifyOtpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold gradient-text">{APP_NAME}</h1>
          <p className="mt-2 text-muted-foreground">
            Enter your verification code
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-8 shadow-lg">
          <p className="text-center text-muted-foreground">
            OTP verification form will be implemented in the authentication step.
          </p>
        </div>
      </div>
    </div>
  );
}
