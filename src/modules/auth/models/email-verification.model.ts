import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { MODEL_NAMES } from '../../shared/constants';

/**
 * Persistent email-verification link record.
 *
 * Store only a hash of the verification token — never the raw token or OTP.
 * Short-lived OTPs may later live in Redis; this schema remains suitable for
 * secure email verification links with one-time consumption (consumedAt).
 *
 * TTL on expiresAt is asynchronous. Auth logic must still reject expired or
 * already-consumed records even if MongoDB has not yet deleted them.
 */
export interface IEmailVerification {
  userId: Types.ObjectId;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
}

export type EmailVerificationDocument = HydratedDocument<IEmailVerification>;

const emailVerificationSchema = new Schema<IEmailVerification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 320,
    },
    tokenHash: {
      type: String,
      required: true,
      maxlength: 256,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'email_verifications',
    strict: true,
  }
);

emailVerificationSchema.index({ userId: 1 }, { name: 'email_verifications_userId' });
emailVerificationSchema.index({ tokenHash: 1 }, { name: 'email_verifications_tokenHash' });
emailVerificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'email_verifications_expiresAt_ttl' }
);

export const EmailVerification: Model<IEmailVerification> =
  mongoose.models[MODEL_NAMES.EmailVerification] ||
  mongoose.model<IEmailVerification>(
    MODEL_NAMES.EmailVerification,
    emailVerificationSchema
  );
