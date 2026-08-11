"use client";

import React from "react";
import { cn } from "@/lib/utils"; // Assuming we have standard tailwind-merge cn utility
import { Shield } from "lucide-react"; // Using lucide-react for a simple logo if needed

interface AuthCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function AuthCard({ title, description, children, className, ...props }: AuthCardProps) {
  return (
    <div className="relative w-full max-w-[420px] mx-auto">
      {/* Soft radial gradient glow behind the card */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-light to-primary rounded-xl blur-xl opacity-20" />
      
      <div
        className={cn(
          "relative flex flex-col w-full p-8 space-y-6 bg-card border border-border rounded-xl shadow-2xl z-10",
          className
        )}
        {...props}
      >
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="p-3 mb-2 bg-background border border-border rounded-full shadow-sm">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
