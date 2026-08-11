"use client";

import React, { useRef, KeyboardEvent, ClipboardEvent } from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  disabled = false,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // Ensure the value array always has exactly `length` elements
  const valueArray = value.split("").slice(0, length);
  while (valueArray.length < length) {
    valueArray.push("");
  }

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return; // Only allow digits

    const newValueArray = [...valueArray];
    newValueArray[index] = char;
    
    const newValue = newValueArray.join("");
    onChange(newValue);

    // Auto-advance
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !valueArray[index] && index > 0) {
      // Move focus back on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text/plain").replace(/\D/g, "").slice(0, length);
    
    if (pastedData) {
      onChange(pastedData);
      
      // Focus the next empty input, or the last one if full
      const nextFocusIndex = Math.min(pastedData.length, length - 1);
      inputRefs.current[nextFocusIndex]?.focus();
    }
  };

  return (
    <div className="flex justify-between gap-2 w-full max-w-[340px] mx-auto">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{1}"
          maxLength={1}
          value={valueArray[index]}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            "w-12 h-14 text-center text-xl font-semibold bg-input border border-border rounded-md text-foreground transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-text-placeholder disabled:opacity-50 disabled:cursor-not-allowed",
            valueArray[index] && "border-primary/50"
          )}
        />
      ))}
    </div>
  );
}
