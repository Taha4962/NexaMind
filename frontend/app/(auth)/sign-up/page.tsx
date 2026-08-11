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
import { registerSchema } from "@/lib/validations";

type RegisterInput = z.infer<typeof registerSchema>;

// Password strength checker helper
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

export default function SignUpPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<RegisterInput>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterInput, string>>>({});
  const [isLoading, setIsLoading] = useState(false);

  const strength = getPasswordStrength(formData.password);

  const validateField = (field: keyof RegisterInput, value: string, fullData: any) => {
    try {
      if (field === "confirmPassword") {
        if (value !== fullData.password) throw new Error("Passwords do not match");
      } else {
        const baseSchema = (registerSchema as any)._def.schema || registerSchema;
        baseSchema.shape[field].parse(value);
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
    
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);
    validateField(name as keyof RegisterInput, value, newFormData);
    
    if (name === "password" && formData.confirmPassword) {
      validateField("confirmPassword", formData.confirmPassword, newFormData);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      registerSchema.parse(formData);
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
      const res = await axios.post("/api/auth/register", formData);
      if (res.data.success) {
        toast.success("Account created! Please verify your email.");
        router.push(`/verify-otp?email=${encodeURIComponent(formData.email)}&type=register`);
      }
    } catch (error: any) {
      const message = error.response?.data?.message || "Registration failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Create an account" description="Enter your details to get started">
      <GoogleButton />
      <AuthDivider />

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput
          label="Full Name"
          name="name"
          placeholder="John Doe"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          disabled={isLoading}
        />
        
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
        
        <div className="space-y-2">
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
          
          {formData.password.length > 0 && (
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
          Sign up
        </AuthButton>
      </form>

      <div className="text-center text-sm mt-4">
        <span className="text-muted-foreground">Already have an account? </span>
        <Link href="/sign-in" className="text-primary hover:underline">
          Sign in
        </Link>
      </div>
    </AuthCard>
  );
}
