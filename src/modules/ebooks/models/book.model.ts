import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  BOOK_ACCESS_TYPES,
  BOOK_STATUSES,
  BookAccessType,
  BookStatus,
  EDUCATION_LEVELS,
  EducationLevel,
  MODEL_NAMES,
} from '../../shared/constants';

/**
 * Book identity and catalogue metadata.
 * Does NOT store PDF/EPUB binary content — files live in object storage
 * and are referenced via BookVersion.storageKey values.
 */
export interface IBookCover {
  storageKey: string;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

export interface IBook {
  title: string;
  slug: string;
  subtitle?: string;
  description?: string;
  authors: string[];
  publisher?: string;
  language: string;
  cover?: IBookCover;
  categoryIds: Types.ObjectId[];
  subjects: string[];
  tags: string[];
  educationLevels: EducationLevel[];
  accessType: BookAccessType;
  status: BookStatus;
  currentVersionId?: Types.ObjectId;
  publishedAt?: Date;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type BookDocument = HydratedDocument<IBook>;

const coverSchema = new Schema<IBookCover>(
  {
    storageKey: { type: String, required: true, trim: true, maxlength: 512 },
    url: { type: String, trim: true, maxlength: 2048 },
    mimeType: { type: String, trim: true, maxlength: 128 },
    width: { type: Number, min: 1 },
    height: { type: Number, min: 1 },
    sizeBytes: { type: Number, min: 0 },
  },
  { _id: false, strict: true }
);

const bookSchema = new Schema<IBook>(
  {
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
    subtitle: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 20000,
    },
    authors: {
      type: [String],
      default: [],
      validate: {
        validator(value: string[]) {
          return value.every((a) => typeof a === 'string' && a.trim().length > 0);
        },
        message: 'Each author must be a non-empty string',
      },
    },
    publisher: {
      type: String,
      trim: true,
      maxlength: 256,
    },
    language: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 16,
      default: 'en',
    },
    cover: {
      type: coverSchema,
    },
    categoryIds: {
      type: [{ type: Schema.Types.ObjectId, ref: MODEL_NAMES.BookCategory }],
      default: [],
    },
    subjects: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    educationLevels: {
      type: [{ type: String, enum: EDUCATION_LEVELS }],
      default: [],
    },
    accessType: {
      type: String,
      enum: BOOK_ACCESS_TYPES,
      required: true,
      default: BookAccessType.FREE,
    },
    status: {
      type: String,
      enum: BOOK_STATUSES,
      required: true,
      default: BookStatus.DRAFT,
    },
    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.BookVersion,
    },
    publishedAt: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
    },
  },
  {
    timestamps: true,
    collection: 'books',
    strict: true,
  }
);

// Unique slug — handle E11000 duplicate-key errors at the application layer.
bookSchema.index({ slug: 1 }, { unique: true, name: 'books_slug_unique' });

// Viewer catalogue: published books by publish date / status.
bookSchema.index({ status: 1, publishedAt: -1 }, { name: 'books_status_publishedAt' });

// Pagination-friendly listing by status + creation time.
bookSchema.index({ status: 1, createdAt: -1 }, { name: 'books_status_createdAt' });

bookSchema.index({ categoryIds: 1 }, { name: 'books_categoryIds' });
bookSchema.index({ subjects: 1 }, { name: 'books_subjects' });
bookSchema.index({ accessType: 1, status: 1 }, { name: 'books_accessType_status' });
bookSchema.index({ educationLevels: 1, status: 1 }, { name: 'books_educationLevels_status' });
bookSchema.index({ tags: 1 }, { name: 'books_tags' });
bookSchema.index({ createdBy: 1 }, { name: 'books_createdBy' });
bookSchema.index(
  { title: 'text', authors: 'text', description: 'text' },
  { name: 'books_text_search', weights: { title: 10, authors: 5, description: 1 } }
);

export const Book: Model<IBook> =
  mongoose.models[MODEL_NAMES.Book] ||
  mongoose.model<IBook>(MODEL_NAMES.Book, bookSchema);
