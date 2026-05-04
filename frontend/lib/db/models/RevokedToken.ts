/**
 * NexaMind — RevokedToken Mongoose Model
 *
 * Token blacklist keyed by JWT `jti` claim.
 * TTL index on expiresAt auto-removes entries once the JWT would have
 * expired naturally — no manual cleanup needed.
 */

import mongoose, { Document, Model, Schema } from "mongoose";

// ── Document Interface ───────────────────────────────────────────────────────

export interface IRevokedToken extends Document {
  /** JWT ID claim — the unique identifier for the token. */
  jti: string;
  /** Reference to the owning user. */
  userId: mongoose.Types.ObjectId;
  /** Timestamp when the token was revoked (logout/rotation). */
  revokedAt: Date;
  /** Mirrors the JWT exp — MongoDB TTL removes the doc at this time. */
  expiresAt: Date;
}

// ── Schema ───────────────────────────────────────────────────────────────────

const revokedTokenSchema = new Schema<IRevokedToken>({
  jti: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  revokedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
    // TTL index: document is deleted automatically when expiresAt is reached
    index: { expireAfterSeconds: 0 },
  },
});

// ── Model ────────────────────────────────────────────────────────────────────

const RevokedToken: Model<IRevokedToken> =
  (mongoose.models.RevokedToken as Model<IRevokedToken>) ??
  mongoose.model<IRevokedToken>("RevokedToken", revokedTokenSchema);

export default RevokedToken;
