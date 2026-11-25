import { Book } from '../models/book.model';
import { BookVersion } from '../models/book-version.model';
import { BookChapter } from '../models/book-chapter.model';
import {
  AdminAuditAction,
  ChapterSource,
  ChapterStatus,
} from '../../shared/constants';
import { writeAdminAuditLog } from '../../admin/services/audit.service';
import { ApiError } from '../../../utils/ApiError';
import { isValidObjectId } from '../../../utils/mongo';
import { ensureUniqueSlug, slugify } from '../../../utils/slug';
import { serializeChapter } from '../utils/serializers';
import type {
  CreateChapterInput,
  ReorderChaptersInput,
  UpdateChapterInput,
} from '../validators/admin-book.validators';

async function assertVersion(bookId: string, versionId: string) {
  if (!isValidObjectId(bookId) || !isValidObjectId(versionId)) {
    throw ApiError.badRequest('Invalid id');
  }
  const version = await BookVersion.findOne({ _id: versionId, bookId }).lean();
  if (!version) throw ApiError.notFound('Version not found');
  return version;
}

async function wouldCreateCycle(
  chapterId: string,
  newParentId: string | null | undefined
): Promise<boolean> {
  if (!newParentId) return false;
  if (newParentId === chapterId) return true;

  let current = newParentId;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) return true;
    if (current === chapterId) return true;
    visited.add(current);
    const parent = await BookChapter.findById(current).select('parentChapterId').lean();
    current = parent?.parentChapterId?.toString() ?? '';
    if (!current) break;
  }
  return false;
}

export async function listChapters(bookId: string, versionId: string) {
  await assertVersion(bookId, versionId);
  const chapters = await BookChapter.find({ bookId, bookVersionId: versionId })
    .sort({ order: 1 })
    .lean();
  return chapters.map(serializeChapter);
}

export async function createChapter(params: {
  adminId: string;
  bookId: string;
  versionId: string;
  input: CreateChapterInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  await assertVersion(params.bookId, params.versionId);
  const input = params.input;

  if (input.parentChapterId) {
    const parent = await BookChapter.findOne({
      _id: input.parentChapterId,
      bookVersionId: params.versionId,
    }).lean();
    if (!parent) throw ApiError.badRequest('Parent chapter not found in this version');
  }

  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.title);
  const slug = await ensureUniqueSlug(baseSlug, async (s) =>
    Boolean(
      await BookChapter.exists({ bookVersionId: params.versionId, slug: s })
    )
  );

  const chapter = await BookChapter.create({
    bookId: params.bookId,
    bookVersionId: params.versionId,
    title: input.title,
    slug,
    chapterNumber: input.chapterNumber,
    parentChapterId: input.parentChapterId ?? undefined,
    level: input.level,
    order: input.order,
    formatLocations: input.formatLocations,
    source: ChapterSource.ADMIN_CREATED,
    status: ChapterStatus.PENDING_REVIEW,
  });

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: 'CHAPTER_CREATE',
    resourceType: 'BookChapter',
    resourceId: chapter._id,
    changes: { after: { title: chapter.title, order: chapter.order } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeChapter(chapter.toObject());
}

export async function getChapter(chapterId: string) {
  if (!isValidObjectId(chapterId)) throw ApiError.badRequest('Invalid chapter id');
  const chapter = await BookChapter.findById(chapterId).lean();
  if (!chapter) throw ApiError.notFound('Chapter not found');
  return serializeChapter(chapter);
}

export async function updateChapter(params: {
  adminId: string;
  chapterId: string;
  input: UpdateChapterInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!isValidObjectId(params.chapterId)) throw ApiError.badRequest('Invalid chapter id');
  const chapter = await BookChapter.findById(params.chapterId);
  if (!chapter) throw ApiError.notFound('Chapter not found');

  const input = params.input;
  if (input.parentChapterId !== undefined) {
    const parentId = input.parentChapterId;
    if (parentId) {
      const parent = await BookChapter.findOne({
        _id: parentId,
        bookVersionId: chapter.bookVersionId,
      }).lean();
      if (!parent) throw ApiError.badRequest('Parent chapter not found in this version');
      if (await wouldCreateCycle(chapter._id.toString(), parentId)) {
        throw ApiError.badRequest('Circular chapter hierarchy is not allowed');
      }
      chapter.parentChapterId = parentId as never;
    } else {
      chapter.parentChapterId = undefined;
    }
  }

  if (input.title !== undefined) chapter.title = input.title;
  if (input.chapterNumber !== undefined) chapter.chapterNumber = input.chapterNumber;
  if (input.level !== undefined) chapter.level = input.level;
  if (input.order !== undefined) chapter.order = input.order;
  if (input.formatLocations !== undefined) {
    chapter.formatLocations = input.formatLocations as never;
  }
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    const taken = await BookChapter.exists({
      bookVersionId: chapter.bookVersionId,
      slug,
      _id: { $ne: chapter._id },
    });
    if (taken) throw ApiError.conflict('Chapter slug already exists in this version');
    chapter.slug = slug;
  }

  // Manual edits after auto-detect keep ADMIN_CREATED/IMPORTED unless already admin.
  if (chapter.source === ChapterSource.AUTO_DETECTED || chapter.source === ChapterSource.AI_SUGGESTED) {
    chapter.source = ChapterSource.ADMIN_CREATED;
  }
  chapter.status = ChapterStatus.PENDING_REVIEW;
  await chapter.save();

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: 'CHAPTER_UPDATE',
    resourceType: 'BookChapter',
    resourceId: chapter._id,
    changes: { after: { title: chapter.title, order: chapter.order, status: chapter.status } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeChapter(chapter.toObject());
}

export async function deleteChapter(params: {
  adminId: string;
  chapterId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!isValidObjectId(params.chapterId)) throw ApiError.badRequest('Invalid chapter id');
  const chapter = await BookChapter.findById(params.chapterId);
  if (!chapter) throw ApiError.notFound('Chapter not found');

  const childCount = await BookChapter.countDocuments({ parentChapterId: chapter._id });
  if (childCount > 0) {
    throw ApiError.badRequest('Remove or reassign child chapters before deleting');
  }

  await BookChapter.deleteOne({ _id: chapter._id });
  await writeAdminAuditLog({
    adminId: params.adminId,
    action: 'CHAPTER_DELETE',
    resourceType: 'BookChapter',
    resourceId: chapter._id,
    changes: { meta: { title: chapter.title } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return { deleted: true };
}

export async function reorderChapters(params: {
  adminId: string;
  bookId: string;
  versionId: string;
  input: ReorderChaptersInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  await assertVersion(params.bookId, params.versionId);
  const ids = params.input.orderedChapterIds;
  const chapters = await BookChapter.find({
    bookVersionId: params.versionId,
    _id: { $in: ids },
  });
  if (chapters.length !== ids.length) {
    throw ApiError.badRequest('One or more chapters do not belong to this version');
  }

  const ops = ids.map((id, index) => ({
    updateOne: {
      filter: { _id: id, bookVersionId: params.versionId },
      update: { $set: { order: index + 1 } },
    },
  }));
  await BookChapter.bulkWrite(ops);

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: 'CHAPTER_REORDER',
    resourceType: 'BookVersion',
    resourceId: params.versionId,
    changes: { meta: { count: ids.length } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return listChapters(params.bookId, params.versionId);
}

export async function approveChapter(params: {
  adminId: string;
  chapterId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!isValidObjectId(params.chapterId)) throw ApiError.badRequest('Invalid chapter id');
  const chapter = await BookChapter.findById(params.chapterId);
  if (!chapter) throw ApiError.notFound('Chapter not found');
  chapter.status = ChapterStatus.APPROVED;
  await chapter.save();

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: AdminAuditAction.CHAPTER_APPROVE,
    resourceType: 'BookChapter',
    resourceId: chapter._id,
    changes: { after: { status: chapter.status } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeChapter(chapter.toObject());
}

export async function rejectChapter(params: {
  adminId: string;
  chapterId: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!isValidObjectId(params.chapterId)) throw ApiError.badRequest('Invalid chapter id');
  const chapter = await BookChapter.findById(params.chapterId);
  if (!chapter) throw ApiError.notFound('Chapter not found');
  chapter.status = ChapterStatus.REJECTED;
  await chapter.save();

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: AdminAuditAction.CHAPTER_REJECT,
    resourceType: 'BookChapter',
    resourceId: chapter._id,
    changes: {
      after: { status: chapter.status },
      meta: params.reason ? { reason: params.reason } : undefined,
    },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeChapter(chapter.toObject());
}

export async function replaceAutoDetectedChapters(params: {
  bookId: string;
  versionId: string;
  chapters: Array<{
    title: string;
    chapterNumber: number;
    order: number;
    level: number;
    parentOrder?: number | null;
    formatLocations?: CreateChapterInput['formatLocations'];
    source?: ChapterSource;
  }>;
}): Promise<number> {
  // Idempotent: remove only AUTO_DETECTED / AI_SUGGESTED that are not approved.
  await BookChapter.deleteMany({
    bookVersionId: params.versionId,
    source: { $in: [ChapterSource.AUTO_DETECTED, ChapterSource.AI_SUGGESTED, ChapterSource.IMPORTED_TOC] },
    status: { $ne: ChapterStatus.APPROVED },
  });

  const createdIds: string[] = [];
  const orderToId = new Map<number, string>();

  for (const item of params.chapters) {
    const slug = await ensureUniqueSlug(slugify(item.title), async (s) =>
      Boolean(await BookChapter.exists({ bookVersionId: params.versionId, slug: s }))
    );

    let parentChapterId: string | undefined;
    if (item.parentOrder != null && orderToId.has(item.parentOrder)) {
      parentChapterId = orderToId.get(item.parentOrder);
    }

    const doc = await BookChapter.create({
      bookId: params.bookId,
      bookVersionId: params.versionId,
      title: item.title,
      slug,
      chapterNumber: item.chapterNumber,
      parentChapterId,
      level: item.level,
      order: item.order,
      formatLocations: item.formatLocations,
      source: item.source ?? ChapterSource.AUTO_DETECTED,
      status: ChapterStatus.PENDING_REVIEW,
    });
    createdIds.push(doc._id.toString());
    orderToId.set(item.order, doc._id.toString());
  }

  void Book;
  return createdIds.length;
}
