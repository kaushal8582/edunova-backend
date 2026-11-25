import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  AUTH_PROVIDERS,
  AuthProvider,
  MODEL_NAMES,
  USER_ROLES,
  USER_STATUSES,
  UserRole,
  UserStatus,
} from '../../shared/constants';

/**
 * Authentication identity document.
 *
 * Indexes are declared via schema.index() — not field-level `unique: true`.
 * Callers must handle MongoDB duplicate-key errors (E11000) on email/phone.
 *
 * passwordHash is never a plaintext password. OAuth users (GOOGLE/APPLE) may
 * omit passwordHash entirely.
 */
export interface IUser {
  email: string;
  phone?: string;
  passwordHash?: string;
  role: UserRole;
  status: UserStatus;
  authProvider: AuthProvider;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;
export type UserObjectId = Types.ObjectId;

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 320,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 32,
      // Partial unique index defined below — only when phone is present.
    },
    /**
     * Stored password hash only. Excluded from default query results and
     * stripped from toJSON/toObject so normal API serialization cannot leak it.
     * Auth services must explicitly `.select('+passwordHash')` when needed.
     */
    passwordHash: {
      type: String,
      select: false,
      maxlength: 256,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      required: true,
      default: UserRole.VIEWER,
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      required: true,
      default: UserStatus.PENDING_VERIFICATION,
    },
    authProvider: {
      type: String,
      enum: AUTH_PROVIDERS,
      required: true,
      default: AuthProvider.LOCAL,
    },
    emailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    lastLoginAt: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'users',
    strict: true,
    toJSON: {
      transform(_doc, ret) {
        // Defense-in-depth: never expose passwordHash in serialized responses.
        delete (ret as { passwordHash?: string }).passwordHash;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret) {
        delete (ret as { passwordHash?: string }).passwordHash;
        return ret;
      },
    },
  }
);

// Unique email. Handle E11000 duplicate-key errors at the application layer.
userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });

// Unique phone only when a string value is present (sparse-style partial index).
userSchema.index(
  { phone: 1 },
  {
    unique: true,
    name: 'users_phone_unique_partial',
    partialFilterExpression: { phone: { $type: 'string' } },
  }
);

userSchema.index({ role: 1, status: 1 }, { name: 'users_role_status' });
userSchema.index({ status: 1, createdAt: -1 }, { name: 'users_status_createdAt' });

export const User: Model<IUser> =
  mongoose.models[MODEL_NAMES.User] ||
  mongoose.model<IUser>(MODEL_NAMES.User, userSchema);
