/**
 * NexaMind — OtpVerification Mongoose Model
 *
 * Stores hashed OTP codes for email verification, password reset, and 2FA.
 * MongoDB TTL index auto-deletes expired documents via expiresAt field.
 */

import mongoose, { Document, Model, Schema } from "mongoose";

// ── Types ────────────────────────────────────────────────────────────────────

export type OtpType = "register" | "reset" | "two_factor";

// ── Document Interface ───────────────────────────────────────────────────────

export interface IOtpVerification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  otpHash: string;
  type: OtpType;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

// ── Schema ───────────────────────────────────────────────────────────────────

const otpVerificationSchema = new Schema<IOtpVerification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["register", "reset", "two_factor"] satisfies OtpType[],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // TTL index: MongoDB removes document when current time passes expiresAt
      index: { expireAfterSeconds: 0 },
    },
    used: {
      type: Boolean,
      default: false,
    },
  },
  {
    // Only createdAt — no updatedAt needed
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// ── Model ────────────────────────────────────────────────────────────────────

const OtpVerification: Model<IOtpVerification> =
  (mongoose.models.OtpVerification as Model<IOtpVerification>) ??
  mongoose.model<IOtpVerification>("OtpVerification", otpVerificationSchema);

export default OtpVerification;
