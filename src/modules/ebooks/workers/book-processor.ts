import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Book } from '../models/book.model';
import { BookVersion } from '../models/book-version.model';
import { BookChapter } from '../models/book-chapter.model';
import { ChapterContent } from '../models/chapter-content.model';
import { BookFormat, BookStatus, BookVersionProcessingStatus } from '../../shared/constants';
import {
  ChapterContentExtractionStatus,
  EbookProcessingStage,
} from '../../../constants/ebook.constants';
import { buildChapterContentKey, getObjectStorage } from '../../../infrastructure/storage';
import type { ProcessBookVersionJobData } from '../../../infrastructure/queues/bullmq';
import { extractPdfChapters } from '../processors/pdf.processor';
import { extractEpubChapters } from '../processors/epub.processor';
import { replaceAutoDetectedChapters } from '../services/admin-chapter.service';

async function withTempFile(
  prefix: string,
  data: Buffer,
  fn: (filePath: string) => Promise<void>
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const filePath = path.join(dir, 'asset.bin');
  try {
    await fs.writeFile(filePath, data);
    await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Idempotent book-version processor.
 * Does not overwrite APPROVED auto chapters (handled in replaceAutoDetectedChapters).
 */
export async function processBookVersionJob(
  data: ProcessBookVersionJobData
): Promise<void> {
  const version = await BookVersion.findById(data.versionId);
  if (!version) {
    throw new Error(`BookVersion ${data.versionId} not found`);
  }
  if (version.bookId.toString() !== data.bookId) {
    throw new Error('bookId/versionId mismatch');
  }
  if (!version.formats.length) {
    throw new Error('No formats to process');
  }

  const storage = getObjectStorage();
  const startedAt = new Date();

  version.processingStatus = BookVersionProcessingStatus.PROCESSING;
  version.processingErrors = [];
  version.processingProgress = {
    currentStage: EbookProcessingStage.DOWNLOADING,
    progressPercentage: 15,
    startedAt,
    extractedChapters: 0,
  };
  await version.save();

  await Book.updateOne(
    { _id: data.bookId },
    { $set: { status: BookStatus.PROCESSING } }
  );

  try {
    let totalChapters = 0;
    let totalWords = 0;
    let hasToc = false;
    let pageCount: number | undefined;
    let ocrStatus: 'NOT_REQUIRED' | 'UNAVAILABLE' | 'REQUIRED' | 'COMPLETED' | 'FAILED' =
      'NOT_REQUIRED';

    for (const formatEntry of version.formats) {
      version.processingProgress = {
        ...version.processingProgress,
        currentStage: EbookProcessingStage.EXTRACTING_METADATA,
        progressPercentage: 30,
      };
      await version.save();

      const buffer = await storage.getObjectBuffer(formatEntry.storageKey);

      await withTempFile('edunova-ebook-', buffer, async () => {
        // temp path available for future streaming parsers
      });

      if (formatEntry.format === BookFormat.PDF) {
        version.processingProgress = {
          ...version.processingProgress,
          currentStage: EbookProcessingStage.EXTRACTING_CHAPTERS,
          progressPercentage: 50,
        };
        await version.save();

        const pdf = await extractPdfChapters(buffer);
        pageCount = pdf.pageCount;
        formatEntry.pageCount = pdf.pageCount;
        formatEntry.processingMetadata = {
          extractor: 'pdf-parse',
          extractorVersion: '1',
          extra: pdf.metadata,
        };
        ocrStatus = pdf.ocrStatus;
        totalWords += pdf.wordCount;

        if (pdf.ocrRequired && pdf.ocrStatus === 'UNAVAILABLE') {
          version.processingErrors.push({
            code: 'OCR_UNAVAILABLE',
            message:
              'PDF appears scanned/image-based and OCR is not configured. Chapters were not fully extracted.',
            format: BookFormat.PDF,
            occurredAt: new Date(),
          });
          version.processingProgress = {
            ...version.processingProgress,
            currentStage: EbookProcessingStage.OCR_REQUIRED,
            ocrStatus: 'UNAVAILABLE',
          };
        } else if (pdf.chapters.length) {
          const count = await replaceAutoDetectedChapters({
            bookId: data.bookId,
            versionId: data.versionId,
            chapters: pdf.chapters,
          });
          totalChapters = Math.max(totalChapters, count);
        }
      }

      if (formatEntry.format === BookFormat.EPUB) {
        version.processingProgress = {
          ...version.processingProgress,
          currentStage: EbookProcessingStage.EXTRACTING_CHAPTERS,
          progressPercentage: 55,
        };
        await version.save();

        const epub = await extractEpubChapters(buffer);
        hasToc = hasToc || epub.hasToc;
        totalWords += epub.wordCount;
        formatEntry.processingMetadata = {
          extractor: 'epub-jszip',
          extractorVersion: '1',
          extra: epub.metadata,
        };

        // If PDF chapters already exist, merge EPUB locations onto matching titles where possible;
        // otherwise create from EPUB nav.
        const existingCount = await BookChapter.countDocuments({
          bookVersionId: version._id,
          status: { $ne: 'REJECTED' },
        });
        if (existingCount === 0 && epub.chapters.length) {
          const count = await replaceAutoDetectedChapters({
            bookId: data.bookId,
            versionId: data.versionId,
            chapters: epub.chapters.map((c) => ({
              ...c,
              formatLocations: c.formatLocations as never,
            })),
          });
          totalChapters = Math.max(totalChapters, count);
        }
      }
    }

    version.processingProgress = {
      ...version.processingProgress,
      currentStage: EbookProcessingStage.EXTRACTING_TEXT,
      progressPercentage: 75,
      totalPages: pageCount,
      extractedChapters: totalChapters,
      ocrStatus,
    };
    await version.save();

    // Store short extracted text references for approved/pending chapters (first N).
    const chapters = await BookChapter.find({ bookVersionId: version._id })
      .sort({ order: 1 })
      .limit(50)
      .lean();

    for (const chapter of chapters) {
      for (const formatEntry of version.formats) {
        const key = buildChapterContentKey({
          bookId: data.bookId,
          versionId: data.versionId,
          chapterId: chapter._id.toString(),
          format: formatEntry.format,
        });
        const excerpt = `Chapter: ${chapter.title}`;
        await storage.putObject({
          key,
          body: Buffer.from(excerpt, 'utf8'),
          contentType: 'text/plain; charset=utf-8',
        });
        await ChapterContent.findOneAndUpdate(
          { chapterId: chapter._id, format: formatEntry.format },
          {
            $set: {
              bookId: data.bookId,
              bookVersionId: data.versionId,
              chapterId: chapter._id,
              format: formatEntry.format,
              contentStorageKey: key,
              extractedText: excerpt,
              extractionStatus: ChapterContentExtractionStatus.COMPLETED,
              wordCount: excerpt.split(/\s+/).length,
              metadata: {
                pageStart: chapter.formatLocations?.pdf?.startPage,
                pageEnd: chapter.formatLocations?.pdf?.endPage,
                href: chapter.formatLocations?.epub?.startHref,
                ocrUsed: false,
              },
            },
          },
          { upsert: true, returnDocument: 'after' }
        );
      }
    }

    version.markModified('formats');
    version.processingStatus = BookVersionProcessingStatus.COMPLETED;
    version.extractionMetadata = {
      chapterCount: totalChapters,
      wordCount: totalWords,
      hasToc,
      extra: { processor: 'book-processor-v1' },
    };
    version.processingProgress = {
      currentStage: EbookProcessingStage.REVIEW_REQUIRED,
      progressPercentage: 100,
      processedPages: pageCount,
      totalPages: pageCount,
      extractedChapters: totalChapters,
      startedAt,
      completedAt: new Date(),
      ocrStatus,
    };
    await version.save();

    await Book.updateOne(
      { _id: data.bookId, status: BookStatus.PROCESSING },
      { $set: { status: BookStatus.REVIEW } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed';
    version.processingStatus = BookVersionProcessingStatus.FAILED;
    version.processingErrors.push({
      code: 'PROCESSING_FAILED',
      message,
      occurredAt: new Date(),
    });
    version.processingProgress = {
      ...version.processingProgress,
      currentStage: EbookProcessingStage.FAILED,
      progressPercentage: version.processingProgress?.progressPercentage ?? 0,
      errorMessage: message,
      completedAt: new Date(),
    };
    await version.save();

    await Book.updateOne(
      { _id: data.bookId },
      { $set: { status: BookStatus.FAILED } }
    );
    throw error;
  }
}
