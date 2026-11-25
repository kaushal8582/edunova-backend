import { BookFormat } from '../modules/shared/constants';

export const EbookProcessingStage = {
  QUEUED: 'QUEUED',
  DOWNLOADING: 'DOWNLOADING',
  EXTRACTING_METADATA: 'EXTRACTING_METADATA',
  EXTRACTING_CHAPTERS: 'EXTRACTING_CHAPTERS',
  EXTRACTING_TEXT: 'EXTRACTING_TEXT',
  OCR_REQUIRED: 'OCR_REQUIRED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type EbookProcessingStage =
  (typeof EbookProcessingStage)[keyof typeof EbookProcessingStage];
export const EBOOK_PROCESSING_STAGES = Object.values(EbookProcessingStage);

export const ChapterContentExtractionStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type ChapterContentExtractionStatus =
  (typeof ChapterContentExtractionStatus)[keyof typeof ChapterContentExtractionStatus];

export const ALLOWED_BOOK_MIME_TYPES: Record<BookFormat, readonly string[]> = {
  [BookFormat.PDF]: ['application/pdf'],
  [BookFormat.EPUB]: ['application/epub+zip', 'application/epub'],
};

export const ALLOWED_BOOK_EXTENSIONS: Record<BookFormat, readonly string[]> = {
  [BookFormat.PDF]: ['.pdf'],
  [BookFormat.EPUB]: ['.epub'],
};

export const BOOK_QUEUE_NAME = 'ebook-processing';
export const BOOK_PROCESS_JOB = 'process-book-version';

export const DEFAULT_MAX_PDF_BYTES = 100 * 1024 * 1024; // 100MB
export const DEFAULT_MAX_EPUB_BYTES = 50 * 1024 * 1024; // 50MB
export const DEFAULT_MAX_COVER_BYTES = 5 * 1024 * 1024; // 5MB
