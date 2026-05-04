/**
 * NexaMind — LoginAttempt Mongoose Model
 *
 * Tracks failed login attempts per email+IP pair.
 * Locks the account after 5 failures for 30 minutes.
 * Provides isLocked(), increment(), and reset() static methods.
 */

import mongoose, { Document, Model, Schema } from "mongoose";

// ── Constants ────────────────────────────────────────────────────────────────

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ── Document Interface ───────────────────────────────────────────────────────

export interface ILoginAttempt extends Document {
  email: string;
  ip: string;
  count: number;
  lockedUntil: Date | null;
  lastAttempt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Model Interface (statics) ────────────────────────────────────────────────

export interface ILoginAttemptModel extends Model<ILoginAttempt> {
  /**
   * Returns true if the email+IP is currently locked out.
   * Automatically clears expired locks.
   */
  isLocked(email: string, ip: string): Promise<boolean>;
  /**
   * Increments failure count and applies lock when threshold is reached.
   */
  increment(email: string, ip: string): Promise<void>;
  /**
   * Resets failure count and removes lock (called on successful login).
   */
  reset(email: string, ip: string): Promise<void>;
}

// ── Schema ───────────────────────────────────────────────────────────────────

const loginAttemptSchema = new Schema<ILoginAttempt, ILoginAttemptModel>(
  {
    email: {
      type: String,
      required: true,
      index: true,
    },
    ip: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    lastAttempt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Composite index for fast lookups
loginAttemptSchema.index({ email: 1, ip: 1 });

// ── Static Methods ───────────────────────────────────────────────────────────

loginAttemptSchema.statics.isLocked = async function (
  email: string,
  ip: string
): Promise<boolean> {
  const record = await this.findOne({ email, ip });
  if (!record?.lockedUntil) return false;

  if (record.lockedUntil > new Date()) return true;

  // Lock expired — clear it
  await this.updateOne(
    { email, ip },
    { $set: { count: 0, lockedUntil: null } }
  );
  return false;
};

loginAttemptSchema.statics.increment = async function (
  email: string,
  ip: string
): Promise<void> {
  const record = await this.findOneAndUpdate(
    { email, ip },
    { $inc: { count: 1 }, $set: { lastAttempt: new Date() } },
    { upsert: true, new: true }
  );

  if (record && record.count >= LOCK_THRESHOLD) {
    await this.updateOne(
      { email, ip },
      { $set: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) } }
    );
  }
};

loginAttemptSchema.statics.reset = async function (
  email: string,
  ip: string
): Promise<void> {
  await this.updateOne(
    { email, ip },
    { $set: { count: 0, lockedUntil: null, lastAttempt: new Date() } }
  );
};

// ── Model ────────────────────────────────────────────────────────────────────

const LoginAttempt: ILoginAttemptModel =
  (mongoose.models.LoginAttempt as ILoginAttemptModel) ??
  mongoose.model<ILoginAttempt, ILoginAttemptModel>(
    "LoginAttempt",
    loginAttemptSchema
  );

export default LoginAttempt;
