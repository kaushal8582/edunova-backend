import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { BOOK_FORMATS, BookFormat, MODEL_NAMES } from '../../shared/constants';

/**
 * User bookmark tied to a specific book version and format.
 * PDF bookmarks use page (+ optional offset); EPUB bookmarks use cfi/href.
 */
export interface IPdfBookmarkLocation {
  page: number;
  offset?: number;
}

export interface IEpubBookmarkLocation {
  cfi?: string;
  href?: string;
}

export type IBookmarkLocation = IPdfBookmarkLocation | IEpubBookmarkLocation;

export interface IBookmark {
  userId: Types.ObjectId;
  bookId: Types.ObjectId;
  bookVersionId: Types.ObjectId;
  format: BookFormat;
  location: IBookmarkLocation;
  label?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type BookmarkDocument = HydratedDocument<IBookmark>;

const bookmarkSchema = new Schema<IBookmark>(
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
    bookVersionId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.BookVersion,
      required: true,
    },
    format: {
      type: String,
      enum: BOOK_FORMATS,
      required: true,
    },
    location: {
      type: new Schema(
        {
          page: { type: Number, min: 1 },
          offset: { type: Number, min: 0 },
          cfi: { type: String, trim: true, maxlength: 4096 },
          href: { type: String, trim: true, maxlength: 1024 },
        },
        { _id: false, strict: true }
      ),
      required: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  {
    timestamps: true,
    collection: 'bookmarks',
    strict: true,
  }
);

bookmarkSchema.pre('validate', function validateLocationForFormat() {
  const loc = this.location as (IPdfBookmarkLocation & IEpubBookmarkLocation) | undefined;
  if (!loc) {
    this.invalidate('location', 'location is required');
    return;
  }

  if (this.format === BookFormat.PDF) {
    if (typeof loc.page !== 'number' || loc.page < 1) {
      this.invalidate('location.page', 'PDF bookmarks require a positive page');
    }
  } else if (this.format === BookFormat.EPUB) {
    if (!loc.cfi && !loc.href) {
      this.invalidate('location', 'EPUB bookmarks require cfi and/or href');
    }
    if (loc.page != null) {
      this.invalidate('location.page', 'EPUB bookmarks must not store a PDF page');
    }
  }
});

bookmarkSchema.index(
  { userId: 1, bookId: 1, createdAt: -1 },
  { name: 'bookmarks_userId_bookId_createdAt' }
);
bookmarkSchema.index(
  { userId: 1, bookVersionId: 1 },
  { name: 'bookmarks_userId_bookVersionId' }
);

export const Bookmark: Model<IBookmark> =
  mongoose.models[MODEL_NAMES.Bookmark] ||
  mongoose.model<IBookmark>(MODEL_NAMES.Bookmark, bookmarkSchema);
