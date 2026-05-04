"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import axios from "axios";

import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { AuthDivider } from "@/components/auth/AuthDivider";
import { loginSchema } from "@/lib/validations";
import { useAuth } from "@/hooks/useAuth";

type LoginInput = z.infer<typeof loginSchema>;

export default function SignInPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  
  const [formData, setFormData] = useState<LoginInput>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginInput, string>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null);

  const validateField = (field: keyof LoginInput, value: string) => {
    try {
      loginSchema.shape[field].parse(value);
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        setErrors((prev) => ({ ...prev, [field]: error.errors[0].message }));
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    validateField(name as keyof LoginInput, value);
    setLockoutMessage(null); // Clear lockout warning when typing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLockoutMessage(null);
    
    try {
      loginSchema.parse(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: any = {};
        error.errors.forEach((err) => {
          if (err.path[0]) newErrors[err.path[0]] = err.message;
        });
        setErrors(newErrors);
      }
      return;
    }

    setIsLoading(true);
    try {
      const res = await axios.post("/api/auth/login", formData);
      const data = res.data.data;

      if (data.requiresTwoFactor) {
        toast.info("Two-factor authentication required.");
        router.push(`/verify-otp?email=${encodeURIComponent(formData.email)}&type=two_factor`);
        return;
      }

      if (res.data.success && data.accessToken && data.user) {
        setAuth(data.accessToken, data.user);
        toast.success("Welcome back!");
        // Look for intended redirect in sessionStorage
        const redirectUrl = sessionStorage.getItem("intendedUrl") || "/dashboard";
        sessionStorage.removeItem("intendedUrl");
        router.push(redirectUrl);
      }
    } catch (error: any) {
      const message = error.response?.data?.message || "Invalid credentials";
      
      // Handle lockout specifically
      if (error.response?.status === 429 && error.response?.data?.error === "ACCOUNT_LOCKED") {
        setLockoutMessage(message);
      } else {
        toast.error(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Welcome back" description="Sign in to your account">
      <GoogleButton />
      <AuthDivider />

      <form onSubmit={handleSubmit} className="space-y-4">
        {lockoutMessage && (
          <div className="p-3 text-sm bg-destructive/10 border border-destructive/20 text-destructive rounded-md">
            {lockoutMessage}
          </div>
        )}

        <AuthInput
          label="Email"
          name="email"
          type="email"
          placeholder="name@example.com"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          disabled={isLoading}
        />
        
        <div className="space-y-1">
          <AuthInput
            label="Password"
            name="password"
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            disabled={isLoading}
          />
          <div className="flex justify-end mt-1">
            <Link 
              href="/forgot-password" 
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="remember"
            className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-background"
          />
          <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
            Remember me
          </label>
        </div>

        <AuthButton type="submit" isLoading={isLoading} className="mt-2">
          Sign in
        </AuthButton>
      </form>

      <div className="text-center text-sm mt-4">
        <span className="text-muted-foreground">Don&apos;t have an account? </span>
        <Link href="/sign-up" className="text-primary hover:underline">
          Sign up
        </Link>
      </div>
    </AuthCard>
  );
}
