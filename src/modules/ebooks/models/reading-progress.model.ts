import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { BOOK_FORMATS, BookFormat, MODEL_NAMES } from '../../shared/constants';

/**
 * Cross-device reading progress
 * ---------------------------
 * One document per (userId, bookId). When the user opens the book on another
 * device, the client reads this record and jumps to `position` for the stored
 * format/version. Clients should upsert `lastReadAt` / position frequently.
 * Switching book versions updates bookVersionId; format-specific position
 * fields must match `format` (PDF pages vs EPUB CFI — never store a PDF page
 * number as EPUB progress).
 */
export interface IPdfReadingPosition {
  page: number;
  offset?: number;
}

export interface IEpubReadingPosition {
  cfi?: string;
  href?: string;
  progression?: number;
}

/**
 * Discriminated by the parent document's `format` field.
 * Only the matching shape should be populated.
 */
export type IReadingPosition = IPdfReadingPosition | IEpubReadingPosition;

export interface IReadingProgress {
  userId: Types.ObjectId;
  bookId: Types.ObjectId;
  bookVersionId: Types.ObjectId;
  format: BookFormat;
  position: IReadingPosition;
  progressPercentage: number;
  lastReadAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ReadingProgressDocument = HydratedDocument<IReadingProgress>;

const readingProgressSchema = new Schema<IReadingProgress>(
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
    /**
     * Format-specific position. Validated in pre('validate') against `format`.
     * Explicit sub-paths avoid a free-form Mixed dump while remaining flexible.
     */
    position: {
      type: new Schema(
        {
          // PDF
          page: { type: Number, min: 1 },
          offset: { type: Number, min: 0 },
          // EPUB
          cfi: { type: String, trim: true, maxlength: 4096 },
          href: { type: String, trim: true, maxlength: 1024 },
          progression: { type: Number, min: 0, max: 1 },
        },
        { _id: false, strict: true }
      ),
      required: true,
    },
    progressPercentage: {
      type: Number,
      required: true,
      min: [0, 'progressPercentage must be between 0 and 100'],
      max: [100, 'progressPercentage must be between 0 and 100'],
      default: 0,
    },
    lastReadAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    collection: 'reading_progress',
    strict: true,
  }
);

readingProgressSchema.pre('validate', function validatePositionForFormat() {
  const pos = this.position as (IPdfReadingPosition & IEpubReadingPosition) | undefined;
  if (!pos) {
    this.invalidate('position', 'position is required');
    return;
  }

  if (this.format === BookFormat.PDF) {
    if (typeof pos.page !== 'number' || pos.page < 1) {
      this.invalidate('position.page', 'PDF progress requires a positive page number');
    }
    if (pos.cfi != null || pos.href != null || pos.progression != null) {
      this.invalidate(
        'position',
        'PDF progress must not include EPUB fields (cfi, href, progression)'
      );
    }
  } else if (this.format === BookFormat.EPUB) {
    if (!pos.cfi && !pos.href) {
      this.invalidate('position', 'EPUB progress requires cfi and/or href');
    }
    if (pos.page != null) {
      this.invalidate(
        'position.page',
        'EPUB progress must not store a PDF page number'
      );
    }
  }
});

readingProgressSchema.index(
  { userId: 1, bookId: 1 },
  { unique: true, name: 'reading_progress_userId_bookId_unique' }
);
readingProgressSchema.index(
  { userId: 1, lastReadAt: -1 },
  { name: 'reading_progress_userId_lastReadAt' }
);
readingProgressSchema.index(
  { bookVersionId: 1 },
  { name: 'reading_progress_bookVersionId' }
);

export const ReadingProgress: Model<IReadingProgress> =
  mongoose.models[MODEL_NAMES.ReadingProgress] ||
  mongoose.model<IReadingProgress>(MODEL_NAMES.ReadingProgress, readingProgressSchema);
