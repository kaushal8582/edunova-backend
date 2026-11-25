import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  CHAPTER_SOURCES,
  CHAPTER_STATUSES,
  ChapterSource,
  ChapterStatus,
  MODEL_NAMES,
} from '../../shared/constants';

/**
 * Chapters are bound to a specific BookVersion because page/CFI locations can
 * change between editions. Chapter boundaries must be validated against the
 * actual uploaded book version (pageCount / EPUB spine) in the service layer —
 * this schema only validates structural consistency of the location fields.
 */
export interface IChapterPdfLocation {
  startPage?: number;
  endPage?: number;
}

export interface IChapterEpubLocation {
  startHref?: string;
  endHref?: string;
  startCfi?: string;
  endCfi?: string;
}

export interface IChapterFormatLocations {
  pdf?: IChapterPdfLocation;
  epub?: IChapterEpubLocation;
}

export interface IBookChapter {
  bookId: Types.ObjectId;
  bookVersionId: Types.ObjectId;
  title: string;
  slug: string;
  chapterNumber: number;
  parentChapterId?: Types.ObjectId;
  level: number;
  order: number;
  formatLocations?: IChapterFormatLocations;
  source: ChapterSource;
  status: ChapterStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type BookChapterDocument = HydratedDocument<IBookChapter>;

const pdfLocationSchema = new Schema<IChapterPdfLocation>(
  {
    startPage: { type: Number, min: 1 },
    endPage: { type: Number, min: 1 },
  },
  { _id: false, strict: true }
);

const epubLocationSchema = new Schema<IChapterEpubLocation>(
  {
    startHref: { type: String, trim: true, maxlength: 1024 },
    endHref: { type: String, trim: true, maxlength: 1024 },
    startCfi: { type: String, trim: true, maxlength: 2048 },
    endCfi: { type: String, trim: true, maxlength: 2048 },
  },
  { _id: false, strict: true }
);

const formatLocationsSchema = new Schema<IChapterFormatLocations>(
  {
    pdf: { type: pdfLocationSchema },
    epub: { type: epubLocationSchema },
  },
  { _id: false, strict: true }
);

const bookChapterSchema = new Schema<IBookChapter>(
  {
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
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 500,
    },
    chapterNumber: {
      type: Number,
      required: true,
      min: [1, 'chapterNumber must be a positive number'],
    },
    parentChapterId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.BookChapter,
    },
    level: {
      type: Number,
      required: true,
      min: [1, 'level must be >= 1'],
      default: 1,
    },
    order: {
      type: Number,
      required: true,
      min: [1, 'order must be a positive number'],
    },
    formatLocations: {
      type: formatLocationsSchema,
    },
    source: {
      type: String,
      enum: CHAPTER_SOURCES,
      required: true,
      default: ChapterSource.ADMIN_CREATED,
    },
    status: {
      type: String,
      enum: CHAPTER_STATUSES,
      required: true,
      default: ChapterStatus.PENDING_REVIEW,
    },
  },
  {
    timestamps: true,
    collection: 'book_chapters',
    strict: true,
  }
);

bookChapterSchema.path('formatLocations').validate(function validatePdfPageRange(
  value: IChapterFormatLocations | undefined
) {
  const pdf = value?.pdf;
  if (
    pdf &&
    typeof pdf.startPage === 'number' &&
    typeof pdf.endPage === 'number' &&
    pdf.startPage > pdf.endPage
  ) {
    return false;
  }
  return true;
}, 'PDF startPage must not be greater than endPage');

bookChapterSchema.index(
  { bookId: 1, bookVersionId: 1, order: 1 },
  { name: 'book_chapters_book_version_order' }
);
bookChapterSchema.index(
  { bookVersionId: 1, slug: 1 },
  { unique: true, name: 'book_chapters_version_slug_unique' }
);
bookChapterSchema.index({ parentChapterId: 1 }, { name: 'book_chapters_parentChapterId' });
bookChapterSchema.index(
  { bookVersionId: 1, status: 1 },
  { name: 'book_chapters_version_status' }
);

export const BookChapter: Model<IBookChapter> =
  mongoose.models[MODEL_NAMES.BookChapter] ||
  mongoose.model<IBookChapter>(MODEL_NAMES.BookChapter, bookChapterSchema);
