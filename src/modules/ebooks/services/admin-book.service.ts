import { createHash } from 'node:crypto';
import { Book } from '../models/book.model';
import { BookVersion } from '../models/book-version.model';
import { BookChapter } from '../models/book-chapter.model';
import { BookCategory } from '../models/book-category.model';
import {
  AdminAuditAction,
  BookAccessType,
  BookFormat,
  BookStatus,
  BookVersionProcessingStatus,
  EducationLevel,
} from '../../shared/constants';
import { getEnv } from '../../../config/env';
import {
  ALLOWED_BOOK_EXTENSIONS,
  ALLOWED_BOOK_MIME_TYPES,
  EbookProcessingStage,
} from '../../../constants/ebook.constants';
import { buildStorageKey, getObjectStorage } from '../../../infrastructure/storage';
import { enqueueBookVersionProcessing } from '../../../infrastructure/queues/bullmq';
import { writeAdminAuditLog } from '../../admin/services/audit.service';
import { ApiError } from '../../../utils/ApiError';
import { isDuplicateKeyError, isValidObjectId } from '../../../utils/mongo';
import { ensureUniqueSlug, slugify } from '../../../utils/slug';
import { serializeBookAdmin, serializeVersion } from '../utils/serializers';
import { processBookVersionJob } from '../workers/book-processor';
import type {
  CompleteUploadInput,
  CreateBookInput,
  CreateVersionInput,
  ListAdminBooksQuery,
  UpdateBookInput,
  UploadUrlsInput,
} from '../validators/admin-book.validators';

function assertBookId(bookId: string): void {
  if (!isValidObjectId(bookId)) throw ApiError.badRequest('Invalid book id');
}

export async function createBook(params: {
  adminId: string;
  input: CreateBookInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { input } = params;
  let slug: string;
  if (input.slug) {
    slug = slugify(input.slug);
    const taken = await Book.exists({ slug });
    if (taken) throw ApiError.conflict('A book with this slug already exists');
  } else {
    slug = await ensureUniqueSlug(slugify(input.title), async (s) =>
      Boolean(await Book.exists({ slug: s }))
    );
  }

  if (input.categoryIds.length) {
    const count = await BookCategory.countDocuments({
      _id: { $in: input.categoryIds },
      status: 'ACTIVE',
    });
    if (count !== input.categoryIds.length) {
      throw ApiError.badRequest('One or more categories are invalid or inactive');
    }
  }

  try {
    const book = await Book.create({
      title: input.title,
      slug,
      subtitle: input.subtitle,
      description: input.description,
      authors: input.authors,
      publisher: input.publisher,
      language: input.language.toLowerCase(),
      cover: input.coverStorageKey
        ? { storageKey: input.coverStorageKey }
        : undefined,
      categoryIds: input.categoryIds,
      subjects: input.subjects,
      tags: input.tags,
      educationLevels: input.educationLevels as EducationLevel[],
      accessType: input.accessType as BookAccessType,
      status: BookStatus.DRAFT,
      createdBy: params.adminId,
      updatedBy: params.adminId,
    });

    await writeAdminAuditLog({
      adminId: params.adminId,
      action: AdminAuditAction.BOOK_CREATE,
      resourceType: 'Book',
      resourceId: book._id,
      changes: { after: { title: book.title, slug: book.slug, status: book.status } },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return serializeBookAdmin(book.toObject());
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict('A book with this slug already exists');
    }
    throw error;
  }
}

export async function listBooks(query: ListAdminBooksQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.accessType) filter.accessType = query.accessType;
  if (query.language) filter.language = query.language.toLowerCase();
  if (query.categoryId) filter.categoryIds = query.categoryId;
  if (query.search) {
    const regex = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: regex }, { authors: regex }, { slug: regex }];
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
    items: items.map(serializeBookAdmin),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
    },
  };
}

export async function getBook(bookId: string) {
  assertBookId(bookId);
  const book = await Book.findById(bookId).lean();
  if (!book) throw ApiError.notFound('Book not found');
  return serializeBookAdmin(book);
}

export async function updateBook(params: {
  adminId: string;
  bookId: string;
  input: UpdateBookInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertBookId(params.bookId);
  const book = await Book.findById(params.bookId);
  if (!book) throw ApiError.notFound('Book not found');

  const before = { title: book.title, status: book.status, slug: book.slug };
  const input = params.input;

  if (input.title !== undefined) book.title = input.title;
  if (input.subtitle !== undefined) book.subtitle = input.subtitle;
  if (input.description !== undefined) book.description = input.description;
  if (input.authors !== undefined) book.authors = input.authors;
  if (input.publisher !== undefined) book.publisher = input.publisher;
  if (input.language !== undefined) book.language = input.language.toLowerCase();
  if (input.subjects !== undefined) book.subjects = input.subjects;
  if (input.tags !== undefined) book.tags = input.tags;
  if (input.educationLevels !== undefined) {
    book.educationLevels = input.educationLevels as EducationLevel[];
  }
  if (input.accessType !== undefined) {
    book.accessType = input.accessType as BookAccessType;
  }
  if (input.categoryIds !== undefined) book.categoryIds = input.categoryIds as never;
  if (input.coverStorageKey !== undefined) {
    book.cover = input.coverStorageKey
      ? { storageKey: input.coverStorageKey }
      : undefined;
  }
  if (input.status !== undefined) {
    // Publishing must use dedicated publish endpoint.
    if (input.status === BookStatus.PUBLISHED) {
      throw ApiError.badRequest('Use the publish endpoint to publish a book');
    }
    book.status = input.status as typeof book.status;
  }
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    const taken = await Book.exists({ slug, _id: { $ne: book._id } });
    if (taken) throw ApiError.conflict('A book with this slug already exists');
    book.slug = slug;
  }

  book.updatedBy = params.adminId as never;
  await book.save();

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: AdminAuditAction.BOOK_UPDATE,
    resourceType: 'Book',
    resourceId: book._id,
    changes: {
      before,
      after: { title: book.title, status: book.status, slug: book.slug },
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeBookAdmin(book.toObject());
}

export async function archiveBook(params: {
  adminId: string;
  bookId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertBookId(params.bookId);
  const book = await Book.findById(params.bookId);
  if (!book) throw ApiError.notFound('Book not found');

  const previous = book.status;
  book.status = BookStatus.ARCHIVED;
  book.updatedBy = params.adminId as never;
  await book.save();

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: AdminAuditAction.BOOK_ARCHIVE,
    resourceType: 'Book',
    resourceId: book._id,
    changes: { before: { status: previous }, after: { status: book.status } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeBookAdmin(book.toObject());
}

/** Soft-delete / archive published content; hard-delete only drafts. */
export async function deleteBook(params: {
  adminId: string;
  bookId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertBookId(params.bookId);
  const book = await Book.findById(params.bookId);
  if (!book) throw ApiError.notFound('Book not found');

  if (book.status === BookStatus.PUBLISHED || book.status === BookStatus.REVIEW) {
    return archiveBook(params);
  }

  await Book.deleteOne({ _id: book._id });
  await writeAdminAuditLog({
    adminId: params.adminId,
    action: AdminAuditAction.BOOK_UPDATE,
    resourceType: 'Book',
    resourceId: book._id,
    changes: { meta: { deleted: true, previousStatus: book.status } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return { deleted: true };
}

export async function createVersion(params: {
  adminId: string;
  bookId: string;
  input: CreateVersionInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertBookId(params.bookId);
  const book = await Book.findById(params.bookId);
  if (!book) throw ApiError.notFound('Book not found');

  let versionNumber = params.input.versionNumber;
  if (!versionNumber) {
    const latest = await BookVersion.findOne({ bookId: book._id })
      .sort({ versionNumber: -1 })
      .select('versionNumber')
      .lean();
    versionNumber = (latest?.versionNumber ?? 0) + 1;
  }

  try {
    const version = await BookVersion.create({
      bookId: book._id,
      versionNumber,
      formats: [],
      processingStatus: BookVersionProcessingStatus.PENDING,
      processingErrors: [],
      processingProgress: {
        currentStage: EbookProcessingStage.QUEUED,
        progressPercentage: 0,
      },
      createdBy: params.adminId,
    });

    book.status = BookStatus.DRAFT;
    book.updatedBy = params.adminId as never;
    await book.save();

    await writeAdminAuditLog({
      adminId: params.adminId,
      action: AdminAuditAction.BOOK_VERSION_CREATE,
      resourceType: 'BookVersion',
      resourceId: version._id,
      changes: {
        after: { bookId: book._id.toString(), versionNumber },
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return serializeVersion(version.toObject());
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict('Version number already exists for this book');
    }
    throw error;
  }
}

export async function listVersions(bookId: string) {
  assertBookId(bookId);
  const versions = await BookVersion.find({ bookId }).sort({ versionNumber: -1 }).lean();
  return versions.map((v) => serializeVersion(v));
}

export async function getVersion(bookId: string, versionId: string) {
  assertBookId(bookId);
  if (!isValidObjectId(versionId)) throw ApiError.badRequest('Invalid version id');
  const version = await BookVersion.findOne({ _id: versionId, bookId }).lean();
  if (!version) throw ApiError.notFound('Version not found');
  return serializeVersion(version);
}

function validateUploadFormat(item: UploadUrlsInput['formats'][number]): void {
  const format = item.format as BookFormat;
  const env = getEnv();
  const maxBytes = format === BookFormat.PDF ? env.MAX_PDF_BYTES : env.MAX_EPUB_BYTES;
  if (item.sizeBytes > maxBytes) {
    throw ApiError.badRequest(`${format} exceeds maximum allowed size`);
  }

  const allowedMimes = ALLOWED_BOOK_MIME_TYPES[format];
  if (!allowedMimes.includes(item.mimeType)) {
    throw ApiError.badRequest(`Invalid MIME type for ${format}`);
  }

  const ext = item.originalFileName.includes('.')
    ? `.${item.originalFileName.split('.').pop()!.toLowerCase()}`
    : '';
  if (!(ALLOWED_BOOK_EXTENSIONS[format] as readonly string[]).includes(ext)) {
    throw ApiError.badRequest(`Invalid file extension for ${format}`);
  }
}

export async function createUploadUrls(params: {
  adminId: string;
  bookId: string;
  versionId: string;
  input: UploadUrlsInput;
}) {
  assertBookId(params.bookId);
  if (!isValidObjectId(params.versionId)) throw ApiError.badRequest('Invalid version id');

  const version = await BookVersion.findOne({
    _id: params.versionId,
    bookId: params.bookId,
  });
  if (!version) throw ApiError.notFound('Version not found');

  if (
    version.processingStatus === BookVersionProcessingStatus.PROCESSING ||
    version.processingStatus === BookVersionProcessingStatus.COMPLETED
  ) {
    throw ApiError.conflict('Cannot upload files for a completed/processing version');
  }

  const storage = getObjectStorage();
  const env = getEnv();
  const uploads = [];

  for (const item of params.input.formats) {
    validateUploadFormat(item);
    const key = buildStorageKey({
      bookId: params.bookId,
      versionId: params.versionId,
      format: item.format,
      filename: item.originalFileName,
    });
    const signed = await storage.createUploadUrl({
      key,
      contentType: item.mimeType,
      expiresInSeconds: env.STORAGE_UPLOAD_URL_EXPIRES_SECONDS,
      maxSizeBytes: item.sizeBytes,
    });
    uploads.push({
      format: item.format,
      storageKey: key,
      uploadUrl: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
      headers: signed.headers ?? {},
      originalFileName: item.originalFileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    });
  }

  version.processingStatus = BookVersionProcessingStatus.UPLOADING;
  version.processingProgress = {
    ...(version.processingProgress ?? {}),
    currentStage: EbookProcessingStage.QUEUED,
    progressPercentage: 5,
  };
  await version.save();

  return { uploads };
}

export async function completeUpload(params: {
  adminId: string;
  bookId: string;
  versionId: string;
  input: CompleteUploadInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertBookId(params.bookId);
  if (!isValidObjectId(params.versionId)) throw ApiError.badRequest('Invalid version id');

  const version = await BookVersion.findOne({
    _id: params.versionId,
    bookId: params.bookId,
  });
  if (!version) throw ApiError.notFound('Version not found');

  const storage = getObjectStorage();
  const env = getEnv();
  const formats = [];

  for (const item of params.input.formats) {
    const expectedPrefix = `books/${params.bookId}/versions/${params.versionId}/`;
    if (!item.storageKey.startsWith(expectedPrefix)) {
      throw ApiError.badRequest('Invalid storage key for this version');
    }

    const meta = await storage.headObject(item.storageKey);
    if (!meta) {
      throw ApiError.badRequest(`Uploaded object not found for ${item.format}`);
    }

    const maxBytes =
      item.format === BookFormat.PDF ? env.MAX_PDF_BYTES : env.MAX_EPUB_BYTES;
    if (meta.sizeBytes <= 0 || meta.sizeBytes > maxBytes) {
      throw ApiError.badRequest(`Invalid object size for ${item.format}`);
    }

    formats.push({
      format: item.format as BookFormat,
      storageKey: item.storageKey,
      mimeType: meta.contentType,
      sizeBytes: meta.sizeBytes,
      checksum: item.checksum ?? meta.etag,
      originalFileName: item.storageKey.split('/').pop(),
    });
  }

  // Merge with existing formats (replace same format, keep others).
  const byFormat = new Map(version.formats.map((f) => [f.format, f]));
  for (const f of formats) {
    byFormat.set(f.format, f);
  }
  version.formats = Array.from(byFormat.values());
  version.processingStatus = BookVersionProcessingStatus.UPLOADED;
  version.processingErrors = [];
  version.processingProgress = {
    currentStage: EbookProcessingStage.QUEUED,
    progressPercentage: 10,
    startedAt: new Date(),
  };
  await version.save();

  await Book.updateOne(
    { _id: params.bookId },
    { $set: { status: BookStatus.PROCESSING, updatedBy: params.adminId } }
  );

  const jobId = await enqueueBookVersionProcessing({
    bookId: params.bookId,
    versionId: params.versionId,
    requestedBy: params.adminId,
  });

  // When the queue is disabled, leave status as UPLOADED so publish/manual
  // chapter flows can proceed. Use retry-processing to run extraction inline.
  if (
    !jobId &&
    env.DISABLE_BOOK_QUEUE !== true &&
    process.env.NODE_ENV !== 'test'
  ) {
    try {
      await processBookVersionJob({
        bookId: params.bookId,
        versionId: params.versionId,
        requestedBy: params.adminId,
      });
    } catch {
      // Version already marked FAILED by processor.
    }
  }

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: 'BOOK_UPLOAD_COMPLETE',
    resourceType: 'BookVersion',
    resourceId: version._id,
    changes: {
      after: {
        formats: version.formats.map((f) => f.format),
        processingStatus: version.processingStatus,
      },
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return {
    version: serializeVersion(version.toObject()),
    jobId,
  };
}

export async function retryProcessing(params: {
  adminId: string;
  bookId: string;
  versionId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertBookId(params.bookId);
  if (!isValidObjectId(params.versionId)) throw ApiError.badRequest('Invalid version id');

  const version = await BookVersion.findOne({
    _id: params.versionId,
    bookId: params.bookId,
  });
  if (!version) throw ApiError.notFound('Version not found');
  if (!version.formats.length) {
    throw ApiError.badRequest('Version has no uploaded formats');
  }

  version.processingStatus = BookVersionProcessingStatus.UPLOADED;
  version.processingErrors = [];
  version.processingProgress = {
    currentStage: EbookProcessingStage.QUEUED,
    progressPercentage: 10,
    startedAt: new Date(),
  };
  await version.save();

  const jobId = await enqueueBookVersionProcessing(
    {
      bookId: params.bookId,
      versionId: params.versionId,
      requestedBy: params.adminId,
    },
    { jobId: `book-version-${params.versionId}-retry-${Date.now()}` }
  );

  if (!jobId) {
    try {
      await processBookVersionJob({
        bookId: params.bookId,
        versionId: params.versionId,
        requestedBy: params.adminId,
      });
    } catch {
      // Version already marked FAILED by processor.
    }
  }

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: 'BOOK_PROCESSING_RETRY',
    resourceType: 'BookVersion',
    resourceId: version._id,
    changes: { meta: { jobId } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return { jobId, version: serializeVersion(version.toObject()) };
}

export async function getProcessingStatus(bookId: string, versionId: string) {
  const version = await getVersion(bookId, versionId);
  return {
    processingStatus: version.processingStatus,
    processingProgress: version.processingProgress,
    processingErrors: version.processingErrors,
    extractionMetadata: version.extractionMetadata,
  };
}

export async function publishBook(params: {
  adminId: string;
  bookId: string;
  versionId?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  assertBookId(params.bookId);
  const env = getEnv();
  const book = await Book.findById(params.bookId);
  if (!book) throw ApiError.notFound('Book not found');

  const versionId = params.versionId ?? book.currentVersionId?.toString();
  let version = versionId
    ? await BookVersion.findOne({ _id: versionId, bookId: book._id })
    : await BookVersion.findOne({ bookId: book._id }).sort({ versionNumber: -1 });

  if (!version) throw ApiError.badRequest('No book version available to publish');
  if (!version.formats.length) {
    throw ApiError.badRequest('At least one uploaded format is required');
  }
  if (
    version.processingStatus !== BookVersionProcessingStatus.COMPLETED &&
    version.processingStatus !== BookVersionProcessingStatus.UPLOADED
  ) {
    // Allow publish after completed processing; if still processing, block.
    if (version.processingStatus === BookVersionProcessingStatus.PROCESSING) {
      throw ApiError.badRequest('Book version is still processing');
    }
    if (version.processingStatus === BookVersionProcessingStatus.FAILED) {
      throw ApiError.badRequest('Book version processing failed');
    }
  }

  if (!book.title?.trim()) throw ApiError.badRequest('Book title is required');
  if (env.REQUIRE_COVER_TO_PUBLISH === true && !book.cover?.storageKey) {
    throw ApiError.badRequest('Cover image is required to publish');
  }

  if (env.REQUIRE_CHAPTER_APPROVAL_TO_PUBLISH !== false) {
    const pending = await BookChapter.countDocuments({
      bookVersionId: version._id,
      status: 'PENDING_REVIEW',
    });
    const approved = await BookChapter.countDocuments({
      bookVersionId: version._id,
      status: 'APPROVED',
    });
    if (pending > 0) {
      throw ApiError.badRequest('All chapters must be reviewed before publishing');
    }
    if (approved === 0 && version.processingStatus === BookVersionProcessingStatus.COMPLETED) {
      throw ApiError.badRequest('At least one approved chapter is required');
    }
  }

  if (version.processingStatus === BookVersionProcessingStatus.UPLOADED) {
    // Auto-mark completed if chapters not required / empty TOC books.
    version.processingStatus = BookVersionProcessingStatus.COMPLETED;
    await version.save();
  }

  book.status = BookStatus.PUBLISHED;
  book.currentVersionId = version._id;
  book.publishedAt = book.publishedAt ?? new Date();
  book.updatedBy = params.adminId as never;
  await book.save();

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: AdminAuditAction.BOOK_PUBLISH,
    resourceType: 'Book',
    resourceId: book._id,
    changes: {
      after: {
        status: book.status,
        currentVersionId: version._id.toString(),
        publishedAt: book.publishedAt,
      },
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeBookAdmin(book.toObject());
}

/** Deterministic checksum helper for tests/local uploads. */
export function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
