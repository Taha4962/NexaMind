/**
 * NexaMind Frontend — Zod Validation Schemas
 *
 * All input validation schemas with strict regex patterns for
 * email, password, name, and OTP fields. Used across auth forms
 * and API route handlers for consistent validation.
 */

import { z } from "zod";

// ══════════════════════════════════════════
// Regex Patterns
// ══════════════════════════════════════════

/** Email validation — standard RFC-like pattern */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/**
 * Password validation — enforces security requirements:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/`~\\])[A-Za-z\d!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/`~\\]{8,}$/;

/** Name validation — letters, spaces, hyphens, apostrophes (2-50 chars) */
export const NAME_REGEX = /^[a-zA-Z\s\-']{2,50}$/;

/** OTP validation — exactly 6 digits */
export const OTP_REGEX = /^\d{6}$/;

// ══════════════════════════════════════════
// Zod Schemas
// ══════════════════════════════════════════

/**
 * Registration form validation schema.
 *
 * Validates name, email, password strength, and password confirmation match.
 */
export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name must be at most 50 characters")
      .regex(NAME_REGEX, "Name can only contain letters, spaces, hyphens, and apostrophes"),
    email: z
      .string()
      .min(1, "Email is required")
      .regex(EMAIL_REGEX, "Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters")
      .regex(
        PASSWORD_REGEX,
        "Password must contain at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Login form validation schema.
 *
 * Validates email format and non-empty password.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .regex(EMAIL_REGEX, "Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required"),
});

/**
 * OTP verification schema.
 *
 * Validates 6-digit OTP code and associated email.
 */
export const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(OTP_REGEX, "OTP must contain only digits"),
  email: z
    .string()
    .min(1, "Email is required")
    .regex(EMAIL_REGEX, "Please enter a valid email address"),
});

/**
 * Forgot password schema.
 *
 * Validates email for password reset OTP request.
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .regex(EMAIL_REGEX, "Please enter a valid email address"),
});

/**
 * Password reset schema.
 *
 * Validates OTP, email, and new password with confirmation.
 */
export const resetPasswordSchema = z
  .object({
    otp: z
      .string()
      .length(6, "OTP must be exactly 6 digits")
      .regex(OTP_REGEX, "OTP must contain only digits"),
    email: z
      .string()
      .min(1, "Email is required")
      .regex(EMAIL_REGEX, "Please enter a valid email address"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters")
      .regex(
        PASSWORD_REGEX,
        "Password must contain at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ══════════════════════════════════════════
// Inferred Types
// ══════════════════════════════════════════

/** Inferred type from registerSchema */
export type RegisterInput = z.infer<typeof registerSchema>;

/** Inferred type from loginSchema */
export type LoginInput = z.infer<typeof loginSchema>;

/** Inferred type from otpSchema */
export type OtpInput = z.infer<typeof otpSchema>;

/** Inferred type from forgotPasswordSchema */
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Inferred type from resetPasswordSchema */
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
