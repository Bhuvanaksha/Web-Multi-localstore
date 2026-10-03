import mongoose, { type Document, Schema } from 'mongoose';

export interface PasswordResetTokenDocument extends Document {
  userId: mongoose.Types.ObjectId;
  /** sha256 hash of the raw token — never store the raw token */
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<PasswordResetTokenDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

export const PasswordResetTokenModel = mongoose.model<PasswordResetTokenDocument>(
  'PasswordResetToken',
  passwordResetTokenSchema,
);
