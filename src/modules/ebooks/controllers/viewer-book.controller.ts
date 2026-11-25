import { asyncHandler } from '../../../utils/asyncHandler';
import { sendSuccess } from '../../../utils/ApiResponse';
import * as viewerBookService from '../services/viewer-book.service';
import * as adminCategoryService from '../services/admin-category.service';
import type {
  CreateAnnotationInput,
  CreateBookmarkInput,
  ListBooksQuery,
  OpenBookInput,
  UpdateAnnotationInput,
  UpdateBookmarkInput,
  UpsertProgressInput,
} from '../validators/viewer-book.validators';

export const listBooks = asyncHandler(async (req, res) => {
  const data = await viewerBookService.listPublishedBooks(
    req.query as unknown as ListBooksQuery
  );
  return sendSuccess(res, 200, 'Books retrieved', data);
});

export const getBook = asyncHandler(async (req, res) => {
  const data = await viewerBookService.getPublishedBook(
    String(req.params.bookId),
    req.user ?? null
  );
  return sendSuccess(res, 200, 'Book retrieved', data);
});

export const getChapters = asyncHandler(async (req, res) => {
  const data = await viewerBookService.getPublishedChapters(
    String(req.params.bookId),
    req.user ?? null
  );
  return sendSuccess(res, 200, 'Chapters retrieved', data);
});

export const getAccess = asyncHandler(async (req, res) => {
  const data = await viewerBookService.getBookAccessForUser(
    String(req.params.bookId),
    req.user!
  );
  return sendSuccess(res, 200, 'Access evaluated', data);
});

export const openBook = asyncHandler(async (req, res) => {
  const data = await viewerBookService.openBook({
    bookId: String(req.params.bookId),
    user: req.user!,
    input: req.body as OpenBookInput,
  });
  return sendSuccess(res, 200, 'Book opened', data);
});

export const listCategories = asyncHandler(async (_req, res) => {
  const data = await adminCategoryService.listActiveCategories();
  return sendSuccess(res, 200, 'Categories retrieved', { categories: data });
});

export const upsertProgress = asyncHandler(async (req, res) => {
  const data = await viewerBookService.upsertProgress({
    user: req.user!,
    bookId: String(req.params.bookId),
    input: req.body as UpsertProgressInput,
  });
  return sendSuccess(res, 200, 'Progress saved', data);
});

export const getProgress = asyncHandler(async (req, res) => {
  const data = await viewerBookService.getProgress(req.user!.id, String(req.params.bookId));
  return sendSuccess(res, 200, 'Progress retrieved', data);
});

export const listRecent = asyncHandler(async (req, res) => {
  const data = await viewerBookService.listRecentProgress(req.user!.id);
  return sendSuccess(res, 200, 'Recent progress', { items: data });
});

export const listAllProgress = asyncHandler(async (req, res) => {
  const data = await viewerBookService.listRecentProgress(req.user!.id, 100);
  return sendSuccess(res, 200, 'Progress list', { items: data });
});

export const listBookmarks = asyncHandler(async (req, res) => {
  const data = await viewerBookService.listBookmarks(req.user!, String(req.params.bookId));
  return sendSuccess(res, 200, 'Bookmarks retrieved', { bookmarks: data });
});

export const createBookmark = asyncHandler(async (req, res) => {
  const data = await viewerBookService.createBookmark({
    user: req.user!,
    bookId: String(req.params.bookId),
    input: req.body as CreateBookmarkInput,
  });
  return sendSuccess(res, 201, 'Bookmark created', data);
});

export const updateBookmark = asyncHandler(async (req, res) => {
  const data = await viewerBookService.updateBookmark({
    user: req.user!,
    bookmarkId: String(req.params.bookmarkId),
    input: req.body as UpdateBookmarkInput,
  });
  return sendSuccess(res, 200, 'Bookmark updated', data);
});

export const deleteBookmark = asyncHandler(async (req, res) => {
  const data = await viewerBookService.deleteBookmark(
    req.user!.id,
    String(req.params.bookmarkId)
  );
  return sendSuccess(res, 200, 'Bookmark deleted', data);
});

export const listAnnotations = asyncHandler(async (req, res) => {
  const data = await viewerBookService.listAnnotations(
    req.user!.id,
    String(req.params.bookId)
  );
  return sendSuccess(res, 200, 'Annotations retrieved', { annotations: data });
});

export const createAnnotation = asyncHandler(async (req, res) => {
  const data = await viewerBookService.createAnnotation({
    user: req.user!,
    bookId: String(req.params.bookId),
    input: req.body as CreateAnnotationInput,
  });
  return sendSuccess(res, 201, 'Annotation created', data);
});

export const updateAnnotation = asyncHandler(async (req, res) => {
  const data = await viewerBookService.updateAnnotation({
    user: req.user!,
    annotationId: String(req.params.annotationId),
    input: req.body as UpdateAnnotationInput,
  });
  return sendSuccess(res, 200, 'Annotation updated', data);
});

export const deleteAnnotation = asyncHandler(async (req, res) => {
  const data = await viewerBookService.deleteAnnotation(
    req.user!.id,
    String(req.params.annotationId)
  );
  return sendSuccess(res, 200, 'Annotation deleted', data);
});
