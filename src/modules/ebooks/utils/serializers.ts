import type { IBook } from '../models/book.model';
import type { IBookVersion } from '../models/book-version.model';
import type { IBookChapter } from '../models/book-chapter.model';
import type { IBookCategory } from '../models/book-category.model';
import type { IReadingProgress } from '../models/reading-progress.model';
import type { IBookmark } from '../models/bookmark.model';
import type { IAnnotation } from '../models/annotation.model';

type WithId<T> = T & { _id: { toString(): string } };

export function serializeBookAdmin(book: WithId<IBook>) {
  return {
    id: book._id.toString(),
    title: book.title,
    slug: book.slug,
    subtitle: book.subtitle ?? null,
    description: book.description ?? null,
    authors: book.authors ?? [],
    publisher: book.publisher ?? null,
    language: book.language,
    cover: book.cover
      ? {
          storageKey: book.cover.storageKey,
          mimeType: book.cover.mimeType ?? null,
          width: book.cover.width ?? null,
          height: book.cover.height ?? null,
          sizeBytes: book.cover.sizeBytes ?? null,
        }
      : null,
    categoryIds: (book.categoryIds ?? []).map((id) => id.toString()),
    subjects: book.subjects ?? [],
    tags: book.tags ?? [],
    educationLevels: book.educationLevels ?? [],
    accessType: book.accessType,
    status: book.status,
    currentVersionId: book.currentVersionId?.toString() ?? null,
    publishedAt: book.publishedAt ?? null,
    createdBy: book.createdBy.toString(),
    updatedBy: book.updatedBy?.toString() ?? null,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

export function serializeBookViewer(book: WithId<IBook>) {
  return {
    id: book._id.toString(),
    title: book.title,
    slug: book.slug,
    subtitle: book.subtitle ?? null,
    description: book.description ?? null,
    authors: book.authors ?? [],
    publisher: book.publisher ?? null,
    language: book.language,
    cover: book.cover ? { storageKey: book.cover.storageKey } : null,
    categoryIds: (book.categoryIds ?? []).map((id) => id.toString()),
    subjects: book.subjects ?? [],
    tags: book.tags ?? [],
    educationLevels: book.educationLevels ?? [],
    accessType: book.accessType,
    status: book.status,
    currentVersionId: book.currentVersionId?.toString() ?? null,
    publishedAt: book.publishedAt ?? null,
  };
}

export function serializeVersion(version: WithId<IBookVersion>, opts?: { includeStorageKeys?: boolean }) {
  const includeKeys = opts?.includeStorageKeys ?? true;
  return {
    id: version._id.toString(),
    bookId: version.bookId.toString(),
    versionNumber: version.versionNumber,
    formats: (version.formats ?? []).map((f) => ({
      format: f.format,
      ...(includeKeys ? { storageKey: f.storageKey } : {}),
      originalFileName: f.originalFileName ?? null,
      mimeType: f.mimeType ?? null,
      sizeBytes: f.sizeBytes ?? null,
      checksum: f.checksum ?? null,
      pageCount: f.pageCount ?? null,
    })),
    processingStatus: version.processingStatus,
    processingErrors: version.processingErrors ?? [],
    extractionMetadata: version.extractionMetadata ?? null,
    processingProgress: version.processingProgress ?? null,
    createdBy: version.createdBy.toString(),
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}

export function serializeChapter(chapter: WithId<IBookChapter>) {
  return {
    id: chapter._id.toString(),
    bookId: chapter.bookId.toString(),
    bookVersionId: chapter.bookVersionId.toString(),
    title: chapter.title,
    slug: chapter.slug,
    chapterNumber: chapter.chapterNumber,
    parentChapterId: chapter.parentChapterId?.toString() ?? null,
    level: chapter.level,
    order: chapter.order,
    formatLocations: chapter.formatLocations ?? null,
    source: chapter.source,
    status: chapter.status,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
  };
}

export function serializeCategory(category: WithId<IBookCategory>) {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description ?? null,
    parentId: category.parentId?.toString() ?? null,
    status: category.status,
    displayOrder: category.displayOrder,
    createdBy: category.createdBy.toString(),
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export function serializeProgress(doc: WithId<IReadingProgress>) {
  return {
    id: doc._id.toString(),
    bookId: doc.bookId.toString(),
    bookVersionId: doc.bookVersionId.toString(),
    format: doc.format,
    position: doc.position,
    progressPercentage: doc.progressPercentage,
    lastReadAt: doc.lastReadAt,
    updatedAt: doc.updatedAt,
  };
}

export function serializeBookmark(doc: WithId<IBookmark>) {
  return {
    id: doc._id.toString(),
    bookId: doc.bookId.toString(),
    bookVersionId: doc.bookVersionId.toString(),
    format: doc.format,
    location: doc.location,
    label: doc.label ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function serializeAnnotation(doc: WithId<IAnnotation>) {
  return {
    id: doc._id.toString(),
    bookId: doc.bookId.toString(),
    bookVersionId: doc.bookVersionId.toString(),
    chapterId: doc.chapterId?.toString() ?? null,
    format: doc.format,
    selectedText: doc.selectedText,
    color: doc.color,
    note: doc.note ?? null,
    anchor: doc.anchor,
    anchorSchemaVersion: doc.anchorSchemaVersion,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
