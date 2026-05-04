/**
 * NexaMind — User Mongoose Model
 *
 * Stores registered users for both email/password and Google OAuth flows.
 * Provides comparePassword() and toSafeObject() instance methods.
 */

import mongoose, { Document, Model, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import type { User as UserShape, UserRole, AuthProvider } from "@/types";

// ── Document Interface ──────────────────────────────────────────────────────

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string | null;
  googleId?: string;
  isVerified: boolean;
  isTwoFactorEnabled: boolean;
  role: UserRole;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Compare plain-text password against the stored bcrypt hash. */
  comparePassword(plaintext: string): Promise<boolean>;
  /** Return user data safe for API responses (no passwordHash). */
  toSafeObject(): UserShape;
}

interface IUserModel extends Model<IUser> {}

// ── Schema ──────────────────────────────────────────────────────────────────

const userSchema = new Schema<IUser, IUserModel>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    googleId: {
      type: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isTwoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"] satisfies UserRole[],
      default: "user",
    },
    avatar: {
      type: String,
    },
  },
  { timestamps: true }
);

// Sparse index so multiple null googleId values don't conflict
userSchema.index({ googleId: 1 }, { sparse: true });

// ── Instance Methods ─────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (
  this: IUser,
  plaintext: string
): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plaintext, this.passwordHash);
};

userSchema.methods.toSafeObject = function (this: IUser): UserShape {
  const authProvider: AuthProvider = this.googleId ? "google" : "email";
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    authProvider,
    isVerified: this.isVerified,
    avatarUrl: this.avatar ?? null,
    twoFactorEnabled: this.isTwoFactorEnabled,
    createdAt: this.createdAt.toISOString(),
  };
};

// ── Model (singleton-safe for Next.js hot reload) ───────────────────────────

const User: IUserModel =
  (mongoose.models.User as IUserModel) ??
  mongoose.model<IUser, IUserModel>("User", userSchema);

export default User;
