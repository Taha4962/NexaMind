"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import axios from "axios";

import { AuthCard } from "@/components/auth/AuthCard";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { resetPasswordSchema } from "@/lib/validations";

type ResetInput = z.infer<typeof resetPasswordSchema>;

const getPasswordStrength = (password: string) => {
  const criteria = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[@$!%*?&#]/.test(password),
  };

  const count = Object.values(criteria).filter(Boolean).length;
  let label = "Weak";
  let color = "bg-destructive";
  
  if (count === 5) {
    label = "Strong";
    color = "bg-success";
  } else if (count >= 3) {
    label = "Medium";
    color = "bg-warning";
  }

  return { criteria, label, color, count };
};

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  const [formData, setFormData] = useState<ResetInput>({
    email: email || "",
    otp: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ResetInput, string>>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Retrieve OTP from session storage
    const otp = sessionStorage.getItem("reset_otp");
    if (!email || !otp) {
      toast.error("Missing reset context. Please try again.");
      router.push("/forgot-password");
    } else {
      setFormData((prev) => ({ ...prev, email, otp }));
    }
  }, [email, router]);

  const strength = getPasswordStrength(formData.newPassword);

  const validateField = (field: "newPassword" | "confirmPassword", value: string) => {
    try {
      if (field === "confirmPassword") {
        if (value !== formData.newPassword) throw new Error("Passwords do not match");
      } else {
        const baseSchema = (resetPasswordSchema as any)._def.schema || resetPasswordSchema;
        z.object({ newPassword: baseSchema.shape.newPassword }).parse({ newPassword: value });
      }
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        setErrors((prev) => ({ ...prev, [field]: error.errors[0].message }));
      } else {
        setErrors((prev) => ({ ...prev, [field]: error.message }));
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === "newPassword" || name === "confirmPassword") {
      validateField(name as "newPassword" | "confirmPassword", value);
      if (name === "newPassword" && formData.confirmPassword) {
        if (value !== formData.confirmPassword) {
          setErrors((prev) => ({ ...prev, confirmPassword: "Passwords do not match" }));
        } else {
          setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      resetPasswordSchema.parse(formData);
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
      const res = await axios.post("/api/auth/reset-password", formData);
      if (res.data.success) {
        sessionStorage.removeItem("reset_otp"); // Clean up
        toast.success("Password reset successfully. You can now sign in.");
        router.push("/sign-in");
      }
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to reset password";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Set new password" description="Please enter your new password below.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <AuthInput
            label="New Password"
            name="newPassword"
            type="password"
            placeholder="••••••••"
            value={formData.newPassword}
            onChange={handleChange}
            error={errors.newPassword}
            disabled={isLoading}
          />
          
          {formData.newPassword.length > 0 && (
            <div className="space-y-1 mt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Strength: {strength.label}</span>
              </div>
              <div className="flex h-1 gap-1">
                <div className={`h-full flex-1 rounded-full ${strength.count >= 1 ? strength.color : "bg-muted"}`} />
                <div className={`h-full flex-1 rounded-full ${strength.count >= 3 ? strength.color : "bg-muted"}`} />
                <div className={`h-full flex-1 rounded-full ${strength.count >= 5 ? strength.color : "bg-muted"}`} />
              </div>
            </div>
          )}
        </div>

        <AuthInput
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          placeholder="••••••••"
          value={formData.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          disabled={isLoading}
        />

        <AuthButton type="submit" isLoading={isLoading} className="mt-2">
          Reset Password
        </AuthButton>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground animate-pulse">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
