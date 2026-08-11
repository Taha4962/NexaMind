/**
 * NexaMind — Email Utilities
 *
 * Nodemailer transport for sending branded OTP emails.
 * Provides generateOtp(), hashOtp(), and sendOtpEmail().
 *
 * Email sending is always wrapped in try/catch by callers —
 * auth flows must not fail if the SMTP server is unavailable.
 */

import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

// ── OTP Helpers ───────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random 6-digit OTP string.
 * Uses crypto.randomInt for uniform distribution.
 */
export function generateOtp(): string {
  // randomInt(100000, 1000000) → always 6 digits
  return String(randomInt(100000, 1000000));
}

/**
 * Hash a plain-text OTP with bcrypt (10 rounds — faster than 12 for short codes).
 */
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10);
}

// ── Email Subjects ────────────────────────────────────────────────────────────

const SUBJECTS: Record<"register" | "reset" | "two_factor", string> = {
  register: "Verify your NexaMind account",
  reset: "Reset your NexaMind password",
  two_factor: "Your NexaMind login code",
};

// ── Nodemailer Transport (created lazily per call) ────────────────────────────

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT ?? 587),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

// ── HTML Template ─────────────────────────────────────────────────────────────

function buildHtml(
  name: string,
  otp: string,
  type: "register" | "reset" | "two_factor"
): string {
  const headings: Record<typeof type, string> = {
    register: "Verify Your Account",
    reset: "Reset Your Password",
    two_factor: "Your Login Code",
  };

  const bodies: Record<typeof type, string> = {
    register:
      "Welcome to NexaMind! Use the code below to verify your email address and activate your account.",
    reset:
      "You requested a password reset. Use the code below to set a new password. If you didn't request this, you can safely ignore this email.",
    two_factor:
      "Use the code below to complete your sign-in. Never share this code with anyone.",
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${headings[type]}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:16px;border:1px solid #1e1e2e;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6c47ff 0%,#a78bfa 100%);padding:36px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                ⚡ NexaMind
              </div>
              <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;letter-spacing:0.5px;">
                Personal AI Agent
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f1f1f5;">
                ${headings[type]}
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#8b8b9e;line-height:1.6;">
                Hi ${name}, ${bodies[type]}
              </p>

              <!-- OTP Box -->
              <div style="background:#1a1a2e;border:1px solid #2d2d4e;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
                <div style="font-size:11px;font-weight:600;color:#6c47ff;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">
                  Your Verification Code
                </div>
                <div style="font-size:42px;font-weight:800;color:#ffffff;letter-spacing:10px;font-variant-numeric:tabular-nums;">
                  ${otp}
                </div>
              </div>

              <!-- Expiry Notice -->
              <div style="background:#1e1a0f;border:1px solid #3d3010;border-radius:8px;padding:14px 16px;margin-bottom:28px;display:flex;align-items:center;">
                <span style="font-size:13px;color:#d4a017;">
                  ⏱ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
                </span>
              </div>

              <p style="margin:0;font-size:13px;color:#5a5a6e;line-height:1.6;">
                If you didn't request this, please ignore this email or
                <a href="mailto:support@nexamind.ai" style="color:#6c47ff;text-decoration:none;">contact support</a>
                if you have concerns.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0d0d14;border-top:1px solid #1e1e2e;padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#3a3a4e;">
                © ${new Date().getFullYear()} NexaMind · All rights reserved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a branded OTP email to the given address.
 *
 * @param to   - Recipient email address
 * @param name - Recipient display name
 * @param otp  - Plain-text 6-digit OTP (NOT the hash)
 * @param type - OTP purpose: 'register' | 'reset' | 'two_factor'
 *
 * @throws Error if SMTP delivery fails (caller should catch and log)
 */
export async function sendOtpEmail(
  to: string,
  name: string,
  otp: string,
  type: "register" | "reset" | "two_factor"
): Promise<void> {
  const transporter = createTransport();

  await transporter.sendMail({
    from:
      process.env.EMAIL_FROM ??
      `NexaMind <${process.env.EMAIL_USER ?? "noreply@nexamind.ai"}>`,
    to,
    subject: SUBJECTS[type],
    html: buildHtml(name, otp, type),
  });
}
