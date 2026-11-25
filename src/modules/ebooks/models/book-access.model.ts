import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  BOOK_ACCESS_SOURCES,
  BookAccessSource,
  MODEL_NAMES,
  USER_BOOK_ACCESS_TYPES,
  UserBookAccessType,
} from '../../shared/constants';

/**
 * Per-user entitlement to a book (free, premium, or admin/subscription grant).
 *
 * One access document per (userId, bookId). Renewals / plan changes should
 * update startsAt / expiresAt / source on the same record rather than inserting
 * duplicates. Payment and entitlement evaluation belong in a future service layer.
 *
 * Subscription integration can set source=SUBSCRIPTION and populate expiresAt
 * from the billing period without schema changes.
 */
export interface IBookAccess {
  userId: Types.ObjectId;
  bookId: Types.ObjectId;
  accessType: UserBookAccessType;
  source: BookAccessSource;
  startsAt?: Date;
  expiresAt?: Date;
  grantedBy?: Types.ObjectId;
  createdAt: Date;
}

export type BookAccessDocument = HydratedDocument<IBookAccess>;

const bookAccessSchema = new Schema<IBookAccess>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
    bookId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.Book,
      required: true,
    },
    accessType: {
      type: String,
      enum: USER_BOOK_ACCESS_TYPES,
      required: true,
    },
    source: {
      type: String,
      enum: BOOK_ACCESS_SOURCES,
      required: true,
    },
    startsAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'book_access',
    strict: true,
  }
);

bookAccessSchema.path('expiresAt').validate(function expiresAfterStart(
  this: IBookAccess,
  value: Date | undefined
) {
  if (value && this.startsAt && value < this.startsAt) {
    return false;
  }
  return true;
}, 'expiresAt must be greater than or equal to startsAt');

// Prevent duplicate grants for the same user+book. Handle E11000 at app layer.
bookAccessSchema.index(
  { userId: 1, bookId: 1 },
  { unique: true, name: 'book_access_userId_bookId_unique' }
);
bookAccessSchema.index({ bookId: 1 }, { name: 'book_access_bookId' });
bookAccessSchema.index(
  { userId: 1, expiresAt: 1 },
  { name: 'book_access_userId_expiresAt' }
);
bookAccessSchema.index({ source: 1 }, { name: 'book_access_source' });

export const BookAccess: Model<IBookAccess> =
  mongoose.models[MODEL_NAMES.BookAccess] ||
  mongoose.model<IBookAccess>(MODEL_NAMES.BookAccess, bookAccessSchema);
