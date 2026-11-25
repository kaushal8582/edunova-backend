import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  DEVICE_PLATFORMS,
  DevicePlatform,
  MODEL_NAMES,
} from '../../shared/constants';

/**
 * Refresh-token session record.
 *
 * Never store raw refresh tokens — only a one-way hash (refreshTokenHash).
 *
 * TTL note: the `expiresAt` TTL index enables asynchronous MongoDB cleanup.
 * TTL deletion is NOT instantaneous or transactional. Authentication logic must
 * still explicitly reject sessions that are expired or revoked, even if the
 * document has not yet been removed by the TTL monitor.
 */
export interface IUserSessionDevice {
  platform: DevicePlatform;
  deviceName?: string;
  appVersion?: string;
  deviceId?: string;
}

export interface IUserSession {
  userId: Types.ObjectId;
  refreshTokenHash: string;
  tokenFamilyId: string;
  device: IUserSessionDevice;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt: Date;
  createdAt: Date;
}

export type UserSessionDocument = HydratedDocument<IUserSession>;

const deviceSchema = new Schema<IUserSessionDevice>(
  {
    platform: {
      type: String,
      enum: DEVICE_PLATFORMS,
      required: true,
      default: DevicePlatform.OTHER,
    },
    deviceName: { type: String, trim: true, maxlength: 128 },
    appVersion: { type: String, trim: true, maxlength: 64 },
    deviceId: { type: String, trim: true, maxlength: 256 },
  },
  { _id: false, strict: true }
);

const userSessionSchema = new Schema<IUserSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
      maxlength: 256,
    },
    tokenFamilyId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    device: {
      type: deviceSchema,
      required: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 64,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
    },
    lastUsedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'user_sessions',
    strict: true,
  }
);

userSessionSchema.index({ userId: 1 }, { name: 'user_sessions_userId' });
userSessionSchema.index({ tokenFamilyId: 1 }, { name: 'user_sessions_tokenFamilyId' });

// Async TTL cleanup — still verify expiresAt / revokedAt in auth logic.
userSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'user_sessions_expiresAt_ttl' }
);

// Active sessions for a user (revokedAt missing / null).
userSessionSchema.index(
  { userId: 1, revokedAt: 1, expiresAt: 1 },
  { name: 'user_sessions_active_lookup' }
);

userSessionSchema.index(
  { userId: 1, lastUsedAt: -1 },
  { name: 'user_sessions_userId_lastUsedAt' }
);

export const UserSession: Model<IUserSession> =
  mongoose.models[MODEL_NAMES.UserSession] ||
  mongoose.model<IUserSession>(MODEL_NAMES.UserSession, userSessionSchema);
