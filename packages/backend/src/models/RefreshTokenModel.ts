import mongoose, { type Document, Schema } from 'mongoose';

export interface RefreshTokenDocument extends Document {
  userId: mongoose.Types.ObjectId;
  /** sha256 hash of the raw token — never store the raw token */
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  /** Session metadata for the “manage sessions” screen. */
  device?: string;
  ip?: string;
  lastUsedAt?: Date;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    revoked: { type: Boolean, default: false },
    device: { type: String, maxlength: 200 },
    ip: { type: String, maxlength: 64 },
    lastUsedAt: { type: Date },
  },
  { timestamps: true },
);

// Fast lookup for reuse detection: find a revoked token by hash.
refreshTokenSchema.index({ tokenHash: 1, revoked: 1 });

refreshTokenSchema.index({ userId: 1, createdAt: -1 });

export const RefreshTokenModel = mongoose.model<RefreshTokenDocument>(
  'RefreshToken',
  refreshTokenSchema,
);
