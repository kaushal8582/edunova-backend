import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  BOOK_FORMATS,
  BOOK_VERSION_PROCESSING_STATUSES,
  BookFormat,
  BookVersionProcessingStatus,
  MODEL_NAMES,
} from '../../shared/constants';

/**
 * Versioning strategy
 * -------------------
 * A Book is an immutable identity; BookVersion holds concrete file references.
 * Publishing a new edition creates a NEW BookVersion (incrementing versionNumber)
 * rather than overwriting storage keys of a published version. Old versions are
 * retained so reading progress, bookmarks, and annotations that reference a
 * prior bookVersionId remain resolvable. Point Book.currentVersionId at the
 * active version when ready; do not mutate completed version file metadata
 * in place for published content.
 *
 * Binary PDF/EPUB bytes are NEVER stored in MongoDB — only storageKey and
 * processing metadata.
 */
export interface IBookVersionFormat {
  format: BookFormat;
  storageKey: string;
  originalFileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksum?: string;
  pageCount?: number;
  /**
   * Structured processing metadata (e.g. extractor version, OCR flags).
   * Keep keys documented at the service layer; avoid dumping arbitrary Mixed blobs.
   */
  processingMetadata?: {
    extractor?: string;
    extractorVersion?: string;
    pageDimensions?: Array<{ page: number; width: number; height: number }>;
    extra?: Record<string, string | number | boolean | null>;
  };
}

export interface IBookVersionProcessingError {
  code?: string;
  message: string;
  format?: BookFormat;
  occurredAt?: Date;
}

export interface IBookVersionExtractionMetadata {
  chapterCount?: number;
  wordCount?: number;
  hasToc?: boolean;
  languageDetected?: string;
  extra?: Record<string, string | number | boolean | null>;
}

/** Fine-grained processing progress for admin polling (not Redis-only). */
export interface IBookVersionProcessingProgress {
  currentStage?: string;
  progressPercentage?: number;
  processedPages?: number;
  totalPages?: number;
  extractedChapters?: number;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  ocrStatus?: 'NOT_REQUIRED' | 'UNAVAILABLE' | 'REQUIRED' | 'COMPLETED' | 'FAILED';
}

export interface IBookVersion {
  bookId: Types.ObjectId;
  versionNumber: number;
  formats: IBookVersionFormat[];
  processingStatus: BookVersionProcessingStatus;
  processingErrors: IBookVersionProcessingError[];
  extractionMetadata?: IBookVersionExtractionMetadata;
  processingProgress?: IBookVersionProcessingProgress;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type BookVersionDocument = HydratedDocument<IBookVersion>;

const formatSchema = new Schema<IBookVersionFormat>(
  {
    format: {
      type: String,
      enum: BOOK_FORMATS,
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 512,
    },
    originalFileName: { type: String, trim: true, maxlength: 512 },
    mimeType: { type: String, trim: true, maxlength: 128 },
    sizeBytes: {
      type: Number,
      min: [1, 'sizeBytes must be a positive number'],
    },
    checksum: { type: String, trim: true, maxlength: 128 },
    pageCount: {
      type: Number,
      min: [1, 'pageCount must be a positive number'],
    },
    processingMetadata: {
      type: new Schema(
        {
          extractor: { type: String, trim: true, maxlength: 128 },
          extractorVersion: { type: String, trim: true, maxlength: 64 },
          pageDimensions: [
            {
              page: { type: Number, min: 1 },
              width: { type: Number, min: 1 },
              height: { type: Number, min: 1 },
            },
          ],
          extra: {
            type: Map,
            of: Schema.Types.Mixed,
          },
        },
        { _id: false, strict: true }
      ),
    },
  },
  { _id: false, strict: true }
);

const processingErrorSchema = new Schema<IBookVersionProcessingError>(
  {
    code: { type: String, trim: true, maxlength: 64 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    format: { type: String, enum: BOOK_FORMATS },
    occurredAt: { type: Date, default: () => new Date() },
  },
  { _id: false, strict: true }
);

const extractionMetadataSchema = new Schema<IBookVersionExtractionMetadata>(
  {
    chapterCount: { type: Number, min: 0 },
    wordCount: { type: Number, min: 0 },
    hasToc: { type: Boolean },
    languageDetected: { type: String, trim: true, maxlength: 16 },
    extra: {
      type: Map,
      of: Schema.Types.Mixed,
    },
  },
  { _id: false, strict: true }
);

const bookVersionSchema = new Schema<IBookVersion>(
  {
    bookId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.Book,
      required: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      min: [1, 'versionNumber must be >= 1'],
    },
    formats: {
      type: [formatSchema],
      default: [],
      validate: [
        {
          // Empty formats allowed while version is awaiting uploads.
          validator(formats: IBookVersionFormat[]) {
            return Array.isArray(formats);
          },
          message: 'formats must be an array',
        },
        {
          validator(formats: IBookVersionFormat[]) {
            const seen = new Set<string>();
            for (const entry of formats) {
              if (seen.has(entry.format)) return false;
              seen.add(entry.format);
            }
            return true;
          },
          message: 'Duplicate formats are not allowed within the same version',
        },
      ],
    },
    processingStatus: {
      type: String,
      enum: BOOK_VERSION_PROCESSING_STATUSES,
      required: true,
      default: BookVersionProcessingStatus.PENDING,
    },
    processingErrors: {
      type: [processingErrorSchema],
      default: [],
    },
    extractionMetadata: {
      type: extractionMetadataSchema,
    },
    processingProgress: {
      type: new Schema<IBookVersionProcessingProgress>(
        {
          currentStage: { type: String, trim: true, maxlength: 64 },
          progressPercentage: { type: Number, min: 0, max: 100 },
          processedPages: { type: Number, min: 0 },
          totalPages: { type: Number, min: 0 },
          extractedChapters: { type: Number, min: 0 },
          errorMessage: { type: String, trim: true, maxlength: 2000 },
          startedAt: { type: Date },
          completedAt: { type: Date },
          ocrStatus: {
            type: String,
            enum: ['NOT_REQUIRED', 'UNAVAILABLE', 'REQUIRED', 'COMPLETED', 'FAILED'],
          },
        },
        { _id: false, strict: true }
      ),
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'book_versions',
    strict: true,
  }
);

bookVersionSchema.index(
  { bookId: 1, versionNumber: 1 },
  { unique: true, name: 'book_versions_bookId_versionNumber_unique' }
);
bookVersionSchema.index(
  { bookId: 1, createdAt: -1 },
  { name: 'book_versions_bookId_createdAt' }
);
bookVersionSchema.index(
  { processingStatus: 1 },
  { name: 'book_versions_processingStatus' }
);

export const BookVersion: Model<IBookVersion> =
  mongoose.models[MODEL_NAMES.BookVersion] ||
  mongoose.model<IBookVersion>(MODEL_NAMES.BookVersion, bookVersionSchema);
