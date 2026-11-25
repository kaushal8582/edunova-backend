import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { MODEL_NAMES } from '../../shared/constants';

/**
 * Password-reset token record.
 *
 * Store only a hash of the reset token. One-time consumption is enforced by
 * setting consumedAt at the application layer (not in this schema alone).
 *
 * TTL on expiresAt is asynchronous — always check expiresAt and consumedAt
 * before accepting a reset token.
 */
export interface IPasswordResetToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
}

export type PasswordResetTokenDocument = HydratedDocument<IPasswordResetToken>;

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
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
    collection: 'password_reset_tokens',
    strict: true,
  }
);

passwordResetTokenSchema.index({ userId: 1 }, { name: 'password_reset_tokens_userId' });
passwordResetTokenSchema.index(
  { tokenHash: 1 },
  { name: 'password_reset_tokens_tokenHash' }
);
passwordResetTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'password_reset_tokens_expiresAt_ttl' }
);

export const PasswordResetToken: Model<IPasswordResetToken> =
  mongoose.models[MODEL_NAMES.PasswordResetToken] ||
  mongoose.model<IPasswordResetToken>(
    MODEL_NAMES.PasswordResetToken,
    passwordResetTokenSchema
  );
