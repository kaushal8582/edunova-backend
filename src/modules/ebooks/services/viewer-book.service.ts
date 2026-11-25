import { Book } from '../models/book.model';
import { BookVersion } from '../models/book-version.model';
import { BookChapter } from '../models/book-chapter.model';
import { ReadingProgress } from '../models/reading-progress.model';
import { Bookmark } from '../models/bookmark.model';
import { Annotation } from '../models/annotation.model';
import {
  BookFormat,
  BookStatus,
  ChapterStatus,
  UserRole,
  UserStatus,
} from '../../shared/constants';
import { getEnv } from '../../../config/env';
import { getObjectStorage } from '../../../infrastructure/storage';
import { ApiError } from '../../../utils/ApiError';
import { isValidObjectId } from '../../../utils/mongo';
import {
  serializeAnnotation,
  serializeBookViewer,
  serializeBookmark,
  serializeChapter,
  serializeProgress,
} from '../utils/serializers';
import { assertCanReadBook, evaluateBookAccess } from './book-access.service';
import type {
  CreateAnnotationInput,
  CreateBookmarkInput,
  ListBooksQuery,
  OpenBookInput,
  UpdateAnnotationInput,
  UpdateBookmarkInput,
  UpsertProgressInput,
} from '../validators/viewer-book.validators';

type AuthUser = { id: string; role: UserRole; status: UserStatus };

export async function listPublishedBooks(query: ListBooksQuery) {
  const filter: Record<string, unknown> = { status: BookStatus.PUBLISHED };
  if (query.categoryId) filter.categoryIds = query.categoryId;
  if (query.subject) filter.subjects = query.subject;
  if (query.educationLevel) filter.educationLevels = query.educationLevel;
  if (query.language) filter.language = query.language.toLowerCase();
  if (query.accessType) filter.accessType = query.accessType;
  if (query.search) {
    const regex = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: regex }, { authors: regex }, { description: regex }];
  }

  const skip = (query.page - 1) * query.limit;
  const sort: Record<string, 1 | -1> = {
    [query.sortBy]: query.sortOrder === 'asc' ? 1 : -1,
  };

  const [items, total] = await Promise.all([
    Book.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    Book.countDocuments(filter),
  ]);

  return {
    items: items.map(serializeBookViewer),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
    },
  };
}

export async function getPublishedBook(bookId: string, user?: AuthUser | null) {
  if (!isValidObjectId(bookId)) throw ApiError.badRequest('Invalid book id');
  const book = await Book.findById(bookId).lean();
  if (!book) throw ApiError.notFound('Book not found');

  const isAdmin = user && user.role !== UserRole.VIEWER;
  if (book.status !== BookStatus.PUBLISHED && !isAdmin) {
    throw ApiError.notFound('Book not found');
  }

  const chapterCount = book.currentVersionId
    ? await BookChapter.countDocuments({
        bookVersionId: book.currentVersionId,
        status: ChapterStatus.APPROVED,
      })
    : 0;

  const access = await evaluateBookAccess({
    bookId,
    user: user ?? null,
    requirePublished: !isAdmin,
  });

  return {
    book: serializeBookViewer(book),
    chapterCount,
    access: {
      allowed: access.allowed,
      reason: access.reason,
      accessType: access.accessType,
    },
  };
}

export async function getPublishedChapters(bookId: string, user?: AuthUser | null) {
  const details = await getPublishedBook(bookId, user);
  const versionId = details.book.currentVersionId;
  if (!versionId) return { chapters: [] };

  const chapters = await BookChapter.find({
    bookVersionId: versionId,
    status: ChapterStatus.APPROVED,
  })
    .sort({ order: 1 })
    .lean();

  return { chapters: chapters.map(serializeChapter) };
}

export async function getBookAccessForUser(bookId: string, user: AuthUser) {
  return evaluateBookAccess({ bookId, user, requirePublished: true });
}

export async function openBook(params: {
  bookId: string;
  user: AuthUser;
  input: OpenBookInput;
}) {
  await assertCanReadBook({ bookId: params.bookId, user: params.user });

  const book = await Book.findById(params.bookId).lean();
  if (!book || !book.currentVersionId) {
    throw ApiError.notFound('Book not found');
  }

  const version = await BookVersion.findById(book.currentVersionId).lean();
  if (!version) throw ApiError.notFound('Published version not found');

  const format = params.input.format as BookFormat;
  const entry = version.formats.find((f) => f.format === format);
  if (!entry) {
    throw ApiError.badRequest(`${format} is not available for this book`);
  }

  const env = getEnv();
  const storage = getObjectStorage();
  const signed = await storage.createDownloadUrl({
    key: entry.storageKey,
    expiresInSeconds: env.STORAGE_READ_URL_EXPIRES_SECONDS,
    filename: entry.originalFileName,
  });

  return {
    book: serializeBookViewer(book),
    version: {
      id: version._id.toString(),
      versionNumber: version.versionNumber,
      format,
    },
    signedUrl: signed.url,
    expiresInSeconds: signed.expiresInSeconds,
  };
}

export async function upsertProgress(params: {
  user: AuthUser;
  bookId: string;
  input: UpsertProgressInput;
}) {
  await assertCanReadBook({ bookId: params.bookId, user: params.user });
  const input = params.input;

  if (input.format === BookFormat.PDF && typeof input.position.page !== 'number') {
    throw ApiError.badRequest('PDF progress requires page');
  }
  if (
    input.format === BookFormat.EPUB &&
    !input.position.cfi &&
    !input.position.href
  ) {
    throw ApiError.badRequest('EPUB progress requires cfi and/or href');
  }

  const existing = await ReadingProgress.findOne({
    userId: params.user.id,
    bookId: params.bookId,
  });

  if (
    existing &&
    input.clientUpdatedAt &&
    existing.lastReadAt > input.clientUpdatedAt
  ) {
    return serializeProgress(existing.toObject());
  }

  const doc = await ReadingProgress.findOneAndUpdate(
    { userId: params.user.id, bookId: params.bookId },
    {
      $set: {
        userId: params.user.id,
        bookId: params.bookId,
        bookVersionId: input.bookVersionId,
        format: input.format as BookFormat,
        position: input.position,
        progressPercentage: input.progressPercentage,
        lastReadAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  if (!doc) throw ApiError.internal('Failed to save progress');
  return serializeProgress(doc.toObject());
}

export async function getProgress(userId: string, bookId: string) {
  const doc = await ReadingProgress.findOne({ userId, bookId }).lean();
  if (!doc) throw ApiError.notFound('Progress not found');
  return serializeProgress(doc);
}

export async function listRecentProgress(userId: string, limit = 20) {
  const items = await ReadingProgress.find({ userId })
    .sort({ lastReadAt: -1 })
    .limit(limit)
    .lean();
  return items.map(serializeProgress);
}

export async function listBookmarks(user: AuthUser, bookId: string) {
  await assertCanReadBook({ bookId, user });
  const items = await Bookmark.find({ userId: user.id, bookId })
    .sort({ createdAt: -1 })
    .lean();
  return items.map(serializeBookmark);
}

export async function createBookmark(params: {
  user: AuthUser;
  bookId: string;
  input: CreateBookmarkInput;
}) {
  await assertCanReadBook({ bookId: params.bookId, user: params.user });
  const input = params.input;
  if (input.format === BookFormat.PDF && typeof input.location.page !== 'number') {
    throw ApiError.badRequest('PDF bookmarks require page');
  }
  if (
    input.format === BookFormat.EPUB &&
    !input.location.cfi &&
    !input.location.href
  ) {
    throw ApiError.badRequest('EPUB bookmarks require cfi and/or href');
  }

  const doc = await Bookmark.create({
    userId: params.user.id,
    bookId: params.bookId,
    bookVersionId: input.bookVersionId,
    format: input.format as BookFormat,
    location: input.location,
    label: input.label,
  });
  return serializeBookmark(doc.toObject());
}

export async function updateBookmark(params: {
  user: AuthUser;
  bookmarkId: string;
  input: UpdateBookmarkInput;
}) {
  if (!isValidObjectId(params.bookmarkId)) throw ApiError.badRequest('Invalid bookmark id');
  const doc = await Bookmark.findOne({ _id: params.bookmarkId, userId: params.user.id });
  if (!doc) throw ApiError.notFound('Bookmark not found');
  if (params.input.location !== undefined) doc.location = params.input.location as never;
  if (params.input.label !== undefined) doc.label = params.input.label ?? undefined;
  await doc.save();
  return serializeBookmark(doc.toObject());
}

export async function deleteBookmark(userId: string, bookmarkId: string) {
  if (!isValidObjectId(bookmarkId)) throw ApiError.badRequest('Invalid bookmark id');
  const result = await Bookmark.deleteOne({ _id: bookmarkId, userId });
  if (!result.deletedCount) throw ApiError.notFound('Bookmark not found');
  return { deleted: true };
}

export async function listAnnotations(userId: string, bookId: string) {
  const items = await Annotation.find({ userId, bookId }).sort({ createdAt: -1 }).lean();
  return items.map(serializeAnnotation);
}

export async function createAnnotation(params: {
  user: AuthUser;
  bookId: string;
  input: CreateAnnotationInput;
}) {
  await assertCanReadBook({ bookId: params.bookId, user: params.user });
  const input = params.input;
  const doc = await Annotation.create({
    userId: params.user.id,
    bookId: params.bookId,
    bookVersionId: input.bookVersionId,
    chapterId: input.chapterId,
    format: input.format as BookFormat,
    selectedText: input.selectedText,
    color: input.color,
    note: input.note,
    anchor: input.anchor,
    anchorSchemaVersion: input.anchorSchemaVersion,
    status: 'ACTIVE',
  });
  return serializeAnnotation(doc.toObject());
}

export async function updateAnnotation(params: {
  user: AuthUser;
  annotationId: string;
  input: UpdateAnnotationInput;
}) {
  if (!isValidObjectId(params.annotationId)) {
    throw ApiError.badRequest('Invalid annotation id');
  }
  const doc = await Annotation.findOne({
    _id: params.annotationId,
    userId: params.user.id,
  });
  if (!doc) throw ApiError.notFound('Annotation not found');
  if (params.input.color !== undefined) doc.color = params.input.color;
  if (params.input.note !== undefined) doc.note = params.input.note ?? undefined;
  if (params.input.selectedText !== undefined) doc.selectedText = params.input.selectedText;
  if (params.input.anchor !== undefined) doc.anchor = params.input.anchor as never;
  await doc.save();
  return serializeAnnotation(doc.toObject());
}

export async function deleteAnnotation(userId: string, annotationId: string) {
  if (!isValidObjectId(annotationId)) throw ApiError.badRequest('Invalid annotation id');
  const result = await Annotation.deleteOne({ _id: annotationId, userId });
  if (!result.deletedCount) throw ApiError.notFound('Annotation not found');
  return { deleted: true };
}
