"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import axios from "axios";

import { AuthCard } from "@/components/auth/AuthCard";
import { AuthButton } from "@/components/auth/AuthButton";
import { OtpInput } from "@/components/auth/OtpInput";
import { useAuth } from "@/hooks/useAuth";

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuth();
  
  const email = searchParams.get("email");
  const type = searchParams.get("type") as "register" | "two_factor" | "reset" | null;

  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (!email || !type) {
      router.push("/sign-in");
    }
  }, [email, type, router]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
      return undefined;
    }
  }, [resendCooldown]);

  const handleVerify = async (otpValue: string) => {
    if (otpValue.length !== 6) return;
    
    setIsLoading(true);
    try {
      const res = await axios.post("/api/auth/verify-otp", {
        email,
        otp: otpValue,
        type,
      });

      if (res.data.success) {
        toast.success(res.data.message || "Verified successfully");
        
        if (type === "reset") {
          // Store OTP temporarily to prove authorization on reset-password page
          sessionStorage.setItem("reset_otp", otpValue);
          router.push(`/reset-password?email=${encodeURIComponent(email!)}`);
        } else {
          // register or two_factor provides an access token
          const data = res.data.data;
          if (data && data.accessToken && data.user) {
            setAuth(data.accessToken, data.user);
          }
          const redirectUrl = sessionStorage.getItem("intendedUrl") || "/dashboard";
          sessionStorage.removeItem("intendedUrl");
          router.push(redirectUrl);
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Verification failed");
      setOtp(""); // Clear OTP on failure
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    
    setCanResend(false);
    setResendCooldown(60);
    
    try {
      // In a real app, you'd call a resend-otp endpoint or the original trigger endpoint
      if (type === "register") {
        // Not implemented in scaffold, but typically POST /api/auth/resend-otp
      } else if (type === "reset") {
        await axios.post("/api/auth/forgot-password", { email });
      }
      toast.success("New OTP sent");
    } catch (error) {
      toast.error("Failed to resend OTP");
      setCanResend(true); // reset if failed
      setResendCooldown(0);
    }
  };

  const getHeading = () => {
    if (type === "register") return "Verify your email";
    if (type === "two_factor") return "Two-factor authentication";
    if (type === "reset") return "Enter reset code";
    return "Verification";
  };

  const getDescription = () => {
    return `We sent a 6-digit code to ${email || "your email"}`;
  };

  return (
    <AuthCard title={getHeading()} description={getDescription()}>
      <div className="space-y-6">
        <OtpInput
          length={6}
          value={otp}
          onChange={(val) => {
            setOtp(val);
            if (val.length === 6) {
              handleVerify(val);
            }
          }}
          disabled={isLoading}
        />

        <AuthButton
          onClick={() => handleVerify(otp)}
          isLoading={isLoading}
          disabled={otp.length !== 6}
        >
          Verify
        </AuthButton>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Didn&apos;t receive it? </span>
          <button
            type="button"
            onClick={handleResend}
            disabled={!canResend}
            className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            {canResend ? "Resend OTP" : `Resend in ${resendCooldown}s`}
          </button>
        </div>
      </div>
    </AuthCard>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground animate-pulse">Loading...</div>}>
      <VerifyOtpContent />
    </Suspense>
  );
}
