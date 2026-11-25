import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { BOOK_FORMATS, BookFormat, MODEL_NAMES } from '../../shared/constants';
import {
  ChapterContentExtractionStatus,
} from '../../../constants/ebook.constants';

/**
 * Extracted chapter text for future AI/search/quiz features.
 * Prefer contentStorageKey for large books; extractedText is optional for small excerpts.
 */
export interface IChapterContent {
  bookId: Types.ObjectId;
  bookVersionId: Types.ObjectId;
  chapterId: Types.ObjectId;
  format: BookFormat;
  extractedText?: string;
  contentStorageKey?: string;
  extractionStatus: ChapterContentExtractionStatus;
  wordCount?: number;
  metadata?: {
    pageStart?: number;
    pageEnd?: number;
    href?: string;
    ocrUsed?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export type ChapterContentDocument = HydratedDocument<IChapterContent>;

const chapterContentSchema = new Schema<IChapterContent>(
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
    chapterId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.BookChapter,
      required: true,
    },
    format: {
      type: String,
      enum: BOOK_FORMATS,
      required: true,
    },
    extractedText: {
      type: String,
      maxlength: 200_000,
    },
    contentStorageKey: {
      type: String,
      trim: true,
      maxlength: 512,
    },
    extractionStatus: {
      type: String,
      enum: Object.values(ChapterContentExtractionStatus),
      required: true,
      default: ChapterContentExtractionStatus.PENDING,
    },
    wordCount: {
      type: Number,
      min: 0,
    },
    metadata: {
      type: new Schema(
        {
          pageStart: { type: Number, min: 1 },
          pageEnd: { type: Number, min: 1 },
          href: { type: String, trim: true, maxlength: 1024 },
          ocrUsed: { type: Boolean },
        },
        { _id: false, strict: true }
      ),
    },
  },
  {
    timestamps: true,
    collection: 'chapter_contents',
    strict: true,
  }
);

chapterContentSchema.index(
  { chapterId: 1, format: 1 },
  { unique: true, name: 'chapter_contents_chapterId_format_unique' }
);
chapterContentSchema.index(
  { bookVersionId: 1 },
  { name: 'chapter_contents_bookVersionId' }
);

export const ChapterContent: Model<IChapterContent> =
  mongoose.models[MODEL_NAMES.ChapterContent] ||
  mongoose.model<IChapterContent>(MODEL_NAMES.ChapterContent, chapterContentSchema);
