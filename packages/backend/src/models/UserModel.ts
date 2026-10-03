import { type Role, RoleEnum } from '@alpha/shared';
import bcrypt from 'bcryptjs';
import mongoose, { type Document, type Model, Schema } from 'mongoose';
import { AuthenticationError } from '../utils/errors.js';

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  bio?: string;
}

export interface UserDocument extends Document {
  email: string;
  username: string;
  password: string;
  profile?: UserProfile;
  role: Role;
  isActive: boolean;
  emailVerified: boolean;
  /** TOTP secret — `select: false`, never exposed via the API. */
  mfaSecret?: string;
  mfaEnabled: boolean;
  /** Hashed one-time MFA recovery codes — `select: false`. */
  mfaRecoveryCodes?: string[];
  /** Brute-force protection: consecutive failed logins + lockout window. */
  failedLoginAttempts: number;
  lockoutUntil?: Date;
  lastLoginIp?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

export interface UserModel extends Model<UserDocument> {
  findByCredentials(email: string, password: string): Promise<UserDocument>;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, select: false },
    profile: {
      firstName: { type: String },
      lastName: { type: String },
      bio: { type: String, maxlength: 500 },
    },
    role: { type: String, enum: RoleEnum.options, default: 'member' },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    mfaEnabled: { type: Boolean, default: false },
    mfaRecoveryCodes: { type: [String], select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date },
    lastLoginIp: { type: String },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

// Hash password (salt rounds 12) only when it changes.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (
  this: UserDocument,
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

/** Failed logins allowed before the account locks, and the lock duration. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

userSchema.statics.findByCredentials = async function (
  this: Model<UserDocument>,
  email: string,
  password: string,
): Promise<UserDocument> {
  const user = await this.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) throw new AuthenticationError('Invalid email or password');
  if (!user.isActive) throw new AuthenticationError('Account is deactivated');

  // Account locked from too many failed attempts.
  if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60_000);
    throw new AuthenticationError(`Account temporarily locked — try again in ${mins} min`);
  }

  const ok = await user.comparePassword(password);
  if (!ok) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      user.lockoutUntil = new Date(Date.now() + LOCKOUT_MS);
      user.failedLoginAttempts = 0; // reset counter for the next window
    }
    await user.save();
    throw new AuthenticationError('Invalid email or password');
  }

  // Successful login clears the failure counter and any lockout.
  if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined;
    await user.save();
  }
  return user;
};

export const UserModel = mongoose.model<UserDocument, UserModel>('User', userSchema);
