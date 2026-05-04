"use client";

import React, { useState, forwardRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AuthInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ className, type, label, error, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="flex flex-col space-y-1.5 w-full">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <div className="relative">
          <input
            type={isPassword ? (showPassword ? "text" : "password") : type}
            className={cn(
              "flex h-11 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
              error && "border-destructive focus-visible:ring-destructive/50",
              isPassword && "pr-10",
              className
            )}
            ref={ref}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle password visibility</span>
            </button>
          )}
        </div>
        {error && <p className="text-sm text-destructive mt-1">{error}</p>}
      </div>
    );
  }
);
AuthInput.displayName = "AuthInput";
