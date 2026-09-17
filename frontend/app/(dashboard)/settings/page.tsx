"use client";

/**
 * NexaMind Frontend — Settings & Account Page
 *
 * Provides:
 *   - Profile info management (name, email, avatar)
 *   - Password change with strength validation
 *   - 2FA enable/confirm/disable workflows
 *   - Connected Google account status
 *   - Session sign-out triggers
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Shield,
  Key,
  Globe,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Smartphone,
  Save,
  X,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import api from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const { user, refresh } = useSession();

  // Profile Form state
  const [name, setName] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password Form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // 2FA state
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState<string | null>(null);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setIs2FAEnabled(Boolean(user.twoFactorEnabled));
    }
  }, [user]);

  // Profile Update handler
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsUpdatingProfile(true);
    setProfileSuccess(null);
    setProfileError(null);

    try {
      await api.patch("/auth/me", { name: name.trim() });
      await refresh();
      setProfileSuccess("Profile updated successfully!");
      setTimeout(() => setProfileSuccess(null), 3000);
    } catch (err: any) {
      setProfileError(
        err.response?.data?.message || err.message || "Failed to update profile."
      );
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Password Change handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    setPasswordSuccess(null);
    setPasswordError(null);

    try {
      await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setPasswordSuccess("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err: any) {
      setPasswordError(
        err.response?.data?.message || err.message || "Failed to change password."
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  // 2FA Enable (Step 1: send OTP)
  const handleToggle2FA = async () => {
    setIs2FALoading(true);
    setTwoFactorMessage(null);
    setTwoFactorError(null);

    if (is2FAEnabled) {
      // Disable 2FA
      try {
        await api.post("/auth/2fa/disable");
        setIs2FAEnabled(false);
        await refresh();
        setTwoFactorMessage("Two-factor authentication disabled.");
        setTimeout(() => setTwoFactorMessage(null), 3000);
      } catch (err: any) {
        setTwoFactorError(
          err.response?.data?.message || "Failed to disable 2FA."
        );
      } finally {
        setIs2FALoading(false);
      }
    } else {
      // Request OTP to enable 2FA
      try {
        await api.post("/auth/2fa/enable");
        setShowOtpModal(true);
        setOtpCode("");
      } catch (err: any) {
        setTwoFactorError(
          err.response?.data?.message || "Failed to request 2FA verification code."
        );
      } finally {
        setIs2FALoading(false);
      }
    }
  };

  // 2FA Confirm (Step 2: verify OTP code)
  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.length < 6) return;

    setIs2FALoading(true);
    setTwoFactorError(null);

    try {
      await api.post("/auth/2fa/confirm", { code: otpCode.trim() });
      setIs2FAEnabled(true);
      setShowOtpModal(false);
      await refresh();
      setTwoFactorMessage("Two-factor authentication enabled successfully!");
      setTimeout(() => setTwoFactorMessage(null), 3000);
    } catch (err: any) {
      setTwoFactorError(
        err.response?.data?.message || "Invalid or expired verification code."
      );
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      sessionStorage.removeItem("nexamind_access_token");
      router.push("/sign-in");
    }
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-8 max-w-4xl mx-auto w-full">
      {/* ── Top Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account & Settings</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Manage your personal profile, security credentials, and AI preferences.
        </p>
      </div>

      {/* ── 1. Profile Information ── */}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <UserIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Profile Information</h2>
            <p className="text-xs text-muted-foreground">
              Update your display name and public identity.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pt-2">
          {/* Avatar Preview */}
          <div className="w-20 h-20 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-xl font-bold text-primary flex-shrink-0 glow-sm">
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-full h-full rounded-2xl object-cover"
              />
            ) : (
              initials
            )}
          </div>

          <form onSubmit={handleUpdateProfile} className="flex-1 w-full space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                  className="w-full px-3 py-2 rounded-xl bg-surface/50 border border-border text-sm text-muted-foreground cursor-not-allowed"
                />
              </div>
            </div>

            {profileSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{profileSuccess}</span>
              </div>
            )}

            {profileError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isUpdatingProfile || name === user?.name}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {isUpdatingProfile ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Save Profile
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── 2. Security & Two-Factor Authentication ── */}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Two-Factor Authentication (2FA)</h2>
            <p className="text-xs text-muted-foreground">
              Add an extra layer of security using one-time email OTP verification.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                is2FAEnabled
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-surface text-muted-foreground border border-border"
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-foreground">Email OTP Verification</h4>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    is2FAEnabled
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-surface text-muted-foreground border-border"
                  }`}
                >
                  {is2FAEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {is2FAEnabled
                  ? "Your account requires an OTP code sent to your email on each login."
                  : "Enable 2FA to protect your account against unauthorized access."}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggle2FA}
            disabled={is2FALoading}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              is2FAEnabled
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            }`}
          >
            {is2FALoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : is2FAEnabled ? (
              "Disable 2FA"
            ) : (
              "Enable 2FA"
            )}
          </button>
        </div>

        {twoFactorMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{twoFactorMessage}</span>
          </div>
        )}

        {twoFactorError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{twoFactorError}</span>
          </div>
        )}
      </div>

      {/* ── 3. Change Password ── */}
      {user?.authProvider !== "google" && (
        <div className="rounded-2xl bg-card border border-border p-6 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Change Password</h2>
              <p className="text-xs text-muted-foreground">
                Update your login password. All other active sessions will be invalidated.
              </p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="••••••••••••"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Repeat new password"
                />
              </div>
            </div>

            {passwordSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isChangingPassword || !currentPassword || !newPassword}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {isChangingPassword && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── 4. Connected Accounts ── */}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Connected Accounts</h2>
            <p className="text-xs text-muted-foreground">
              External authentication providers linked to this account.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-border flex items-center justify-center font-bold text-lg text-foreground">
              G
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Google OAuth</h4>
              <p className="text-xs text-muted-foreground">
                {user?.authProvider === "google"
                  ? "Connected — your Google account is used to sign in."
                  : "Not connected — you use email and password authentication."}
              </p>
            </div>
          </div>

          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              user?.authProvider === "google"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-surface text-muted-foreground border-border"
            }`}
          >
            {user?.authProvider === "google" ? "Connected" : "Not Linked"}
          </span>
        </div>
      </div>

      {/* ── 5. Session & Logout ── */}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">Active Session</h3>
          <p className="text-xs text-muted-foreground">
            Sign out of your NexaMind workspace on this device.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* ── 2FA OTP Confirmation Modal ── */}
      {showOtpModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Mail className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  Verify 2FA Activation
                </h3>
              </div>
              <button
                onClick={() => setShowOtpModal(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              We sent a 6-digit verification code to{" "}
              <span className="font-semibold text-foreground">{user?.email}</span>. Enter
              the code below to confirm 2FA activation.
            </p>

            <form onSubmit={handleConfirm2FA} className="space-y-4">
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full text-center tracking-widest text-xl font-mono px-3 py-2.5 rounded-xl bg-surface border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />

              {twoFactorError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{twoFactorError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={is2FALoading || otpCode.length < 6}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {is2FALoading && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Confirm & Enable 2FA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
