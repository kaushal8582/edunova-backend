import { asyncHandler } from '../../../utils/asyncHandler';
import { sendSuccess } from '../../../utils/ApiResponse';
import { getClientIp, getUserAgent } from '../../../utils/client';
import * as adminBookService from '../services/admin-book.service';
import * as adminChapterService from '../services/admin-chapter.service';
import * as adminCategoryService from '../services/admin-category.service';
import type {
  CompleteUploadInput,
  CreateBookInput,
  CreateCategoryInput,
  CreateChapterInput,
  CreateVersionInput,
  ListAdminBooksQuery,
  ReorderChaptersInput,
  UpdateBookInput,
  UpdateCategoryInput,
  UpdateChapterInput,
  UploadUrlsInput,
} from '../validators/admin-book.validators';

export const createBook = asyncHandler(async (req, res) => {
  const data = await adminBookService.createBook({
    adminId: req.user!.id,
    input: req.body as CreateBookInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 201, 'Book created', data);
});

export const listBooks = asyncHandler(async (req, res) => {
  const data = await adminBookService.listBooks(req.query as unknown as ListAdminBooksQuery);
  return sendSuccess(res, 200, 'Books retrieved', data);
});

export const getBook = asyncHandler(async (req, res) => {
  const data = await adminBookService.getBook(String(req.params.bookId));
  return sendSuccess(res, 200, 'Book retrieved', data);
});

export const updateBook = asyncHandler(async (req, res) => {
  const data = await adminBookService.updateBook({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    input: req.body as UpdateBookInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Book updated', data);
});

export const deleteBook = asyncHandler(async (req, res) => {
  const data = await adminBookService.deleteBook({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Book deleted or archived', data);
});

export const createVersion = asyncHandler(async (req, res) => {
  const data = await adminBookService.createVersion({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    input: req.body as CreateVersionInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 201, 'Book version created', data);
});

export const listVersions = asyncHandler(async (req, res) => {
  const data = await adminBookService.listVersions(String(req.params.bookId));
  return sendSuccess(res, 200, 'Versions retrieved', { versions: data });
});

export const getVersion = asyncHandler(async (req, res) => {
  const data = await adminBookService.getVersion(
    String(req.params.bookId),
    String(req.params.versionId)
  );
  return sendSuccess(res, 200, 'Version retrieved', data);
});

export const createUploadUrls = asyncHandler(async (req, res) => {
  const data = await adminBookService.createUploadUrls({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    versionId: String(req.params.versionId),
    input: req.body as UploadUrlsInput,
  });
  return sendSuccess(res, 200, 'Upload URLs created', data);
});

export const completeUpload = asyncHandler(async (req, res) => {
  const data = await adminBookService.completeUpload({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    versionId: String(req.params.versionId),
    input: req.body as CompleteUploadInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Upload completed', data);
});

export const retryProcessing = asyncHandler(async (req, res) => {
  const data = await adminBookService.retryProcessing({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    versionId: String(req.params.versionId),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Processing retry queued', data);
});

export const processingStatus = asyncHandler(async (req, res) => {
  const data = await adminBookService.getProcessingStatus(
    String(req.params.bookId),
    String(req.params.versionId)
  );
  return sendSuccess(res, 200, 'Processing status', data);
});

export const publishBook = asyncHandler(async (req, res) => {
  const data = await adminBookService.publishBook({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    versionId: typeof req.body?.versionId === 'string' ? req.body.versionId : undefined,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Book published', data);
});

export const archiveBook = asyncHandler(async (req, res) => {
  const data = await adminBookService.archiveBook({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Book archived', data);
});

export const listChapters = asyncHandler(async (req, res) => {
  const data = await adminChapterService.listChapters(
    String(req.params.bookId),
    String(req.params.versionId)
  );
  return sendSuccess(res, 200, 'Chapters retrieved', { chapters: data });
});

export const createChapter = asyncHandler(async (req, res) => {
  const data = await adminChapterService.createChapter({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    versionId: String(req.params.versionId),
    input: req.body as CreateChapterInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 201, 'Chapter created', data);
});

export const getChapter = asyncHandler(async (req, res) => {
  const data = await adminChapterService.getChapter(String(req.params.chapterId));
  return sendSuccess(res, 200, 'Chapter retrieved', data);
});

export const updateChapter = asyncHandler(async (req, res) => {
  const data = await adminChapterService.updateChapter({
    adminId: req.user!.id,
    chapterId: String(req.params.chapterId),
    input: req.body as UpdateChapterInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Chapter updated', data);
});

export const deleteChapter = asyncHandler(async (req, res) => {
  const data = await adminChapterService.deleteChapter({
    adminId: req.user!.id,
    chapterId: String(req.params.chapterId),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Chapter deleted', data);
});

export const reorderChapters = asyncHandler(async (req, res) => {
  const data = await adminChapterService.reorderChapters({
    adminId: req.user!.id,
    bookId: String(req.params.bookId),
    versionId: String(req.params.versionId),
    input: req.body as ReorderChaptersInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Chapters reordered', { chapters: data });
});

export const approveChapter = asyncHandler(async (req, res) => {
  const data = await adminChapterService.approveChapter({
    adminId: req.user!.id,
    chapterId: String(req.params.chapterId),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Chapter approved', data);
});

export const rejectChapter = asyncHandler(async (req, res) => {
  const data = await adminChapterService.rejectChapter({
    adminId: req.user!.id,
    chapterId: String(req.params.chapterId),
    reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Chapter rejected', data);
});

export const createCategory = asyncHandler(async (req, res) => {
  const data = await adminCategoryService.createCategory({
    adminId: req.user!.id,
    input: req.body as CreateCategoryInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 201, 'Category created', data);
});

export const listCategories = asyncHandler(async (_req, res) => {
  const data = await adminCategoryService.listCategoriesAdmin();
  return sendSuccess(res, 200, 'Categories retrieved', { categories: data });
});

export const getCategory = asyncHandler(async (req, res) => {
  const data = await adminCategoryService.getCategory(String(req.params.categoryId));
  return sendSuccess(res, 200, 'Category retrieved', data);
});

export const updateCategory = asyncHandler(async (req, res) => {
  const data = await adminCategoryService.updateCategory({
    adminId: req.user!.id,
    categoryId: String(req.params.categoryId),
    input: req.body as UpdateCategoryInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Category updated', data);
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const data = await adminCategoryService.deleteCategory({
    adminId: req.user!.id,
    categoryId: String(req.params.categoryId),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Category deleted', data);
});
