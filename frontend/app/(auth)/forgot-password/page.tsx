"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import axios from "axios";

import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";

const forgotSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
});

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);

  useEffect(() => {
    if (isSuccess && resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isSuccess, resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      forgotSchema.parse({ email });
      setError(undefined);
    } catch (err: any) {
      setError(err.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      // Backend should always return success (200) to prevent enumeration
      await axios.post("/api/auth/forgot-password", { email });
      setIsSuccess(true);
      setResendCooldown(60);
      toast.success("Reset link sent");
    } catch (err: any) {
      // Even on failure, show success to match security practices, unless it's a rate limit
      if (err.response?.status === 429) {
        toast.error("Too many requests. Please try again later.");
      } else {
        setIsSuccess(true);
        setResendCooldown(60);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthCard title="Check your email" description={`We sent a reset link to ${email}`}>
        <div className="space-y-4">
          <AuthButton
            onClick={() => router.push(`/verify-otp?email=${encodeURIComponent(email)}&type=reset`)}
          >
            Enter OTP Code
          </AuthButton>

          <div className="text-center text-sm">
            <span className="text-muted-foreground">Didn&apos;t receive it? </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={resendCooldown > 0 || isLoading}
              className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
            </button>
          </div>

          <div className="text-center">
            <Link href="/sign-in" className="text-sm text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset password" description="Enter your email to receive a reset code">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput
          label="Email"
          name="email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(undefined);
          }}
          error={error}
          disabled={isLoading}
        />

        <AuthButton type="submit" isLoading={isLoading} className="mt-2">
          Send reset code
        </AuthButton>
      </form>

      <div className="text-center mt-6">
        <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          &larr; Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
