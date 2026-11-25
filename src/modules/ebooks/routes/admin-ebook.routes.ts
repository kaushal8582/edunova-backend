import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate';
import { authorize } from '../../../middleware/authorize';
import { Permission } from '../../../constants/permissions';
import { validateRequest } from '../../../middleware/validateRequest';
import * as ctrl from '../controllers/admin-book.controller';
import {
  bookIdParamsSchema,
  categoryIdParamsSchema,
  chapterIdParamsSchema,
  completeUploadSchema,
  createBookSchema,
  createCategorySchema,
  createChapterSchema,
  createVersionSchema,
  listAdminBooksQuerySchema,
  rejectChapterSchema,
  reorderChaptersSchema,
  updateBookSchema,
  updateCategorySchema,
  updateChapterSchema,
  uploadUrlsSchema,
  versionIdParamsSchema,
} from '../validators/admin-book.validators';

const router = Router();
router.use(authenticate);

// Categories
router.post(
  '/categories',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ body: createCategorySchema }),
  ctrl.createCategory
);
router.get('/categories', authorize(Permission.BOOK_READ), ctrl.listCategories);
router.get(
  '/categories/:categoryId',
  authorize(Permission.BOOK_READ),
  validateRequest({ params: categoryIdParamsSchema }),
  ctrl.getCategory
);
router.patch(
  '/categories/:categoryId',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  ctrl.updateCategory
);
router.delete(
  '/categories/:categoryId',
  authorize(Permission.BOOK_DELETE),
  validateRequest({ params: categoryIdParamsSchema }),
  ctrl.deleteCategory
);

// Books
router.post(
  '/books',
  authorize(Permission.BOOK_CREATE),
  validateRequest({ body: createBookSchema }),
  ctrl.createBook
);
router.get(
  '/books',
  authorize(Permission.BOOK_READ),
  validateRequest({ query: listAdminBooksQuerySchema }),
  ctrl.listBooks
);
router.get(
  '/books/:bookId',
  authorize(Permission.BOOK_READ),
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.getBook
);
router.patch(
  '/books/:bookId',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: bookIdParamsSchema, body: updateBookSchema }),
  ctrl.updateBook
);
router.delete(
  '/books/:bookId',
  authorize(Permission.BOOK_DELETE),
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.deleteBook
);

router.post(
  '/books/:bookId/publish',
  authorize(Permission.BOOK_PUBLISH),
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.publishBook
);
router.post(
  '/books/:bookId/archive',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.archiveBook
);

// Versions / upload / processing
router.post(
  '/books/:bookId/versions',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: bookIdParamsSchema, body: createVersionSchema }),
  ctrl.createVersion
);
router.get(
  '/books/:bookId/versions',
  authorize(Permission.BOOK_READ),
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.listVersions
);
router.get(
  '/books/:bookId/versions/:versionId',
  authorize(Permission.BOOK_READ),
  validateRequest({ params: versionIdParamsSchema }),
  ctrl.getVersion
);
router.post(
  '/books/:bookId/versions/:versionId/upload-urls',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: versionIdParamsSchema, body: uploadUrlsSchema }),
  ctrl.createUploadUrls
);
router.post(
  '/books/:bookId/versions/:versionId/complete-upload',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: versionIdParamsSchema, body: completeUploadSchema }),
  ctrl.completeUpload
);
router.post(
  '/books/:bookId/versions/:versionId/retry-processing',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: versionIdParamsSchema }),
  ctrl.retryProcessing
);
router.get(
  '/books/:bookId/versions/:versionId/processing-status',
  authorize(Permission.BOOK_READ),
  validateRequest({ params: versionIdParamsSchema }),
  ctrl.processingStatus
);

// Chapters
router.get(
  '/books/:bookId/versions/:versionId/chapters',
  authorize(Permission.BOOK_READ),
  validateRequest({ params: versionIdParamsSchema }),
  ctrl.listChapters
);
router.post(
  '/books/:bookId/versions/:versionId/chapters',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: versionIdParamsSchema, body: createChapterSchema }),
  ctrl.createChapter
);
router.patch(
  '/books/:bookId/versions/:versionId/chapters/reorder',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: versionIdParamsSchema, body: reorderChaptersSchema }),
  ctrl.reorderChapters
);
router.get(
  '/chapters/:chapterId',
  authorize(Permission.BOOK_READ),
  validateRequest({ params: chapterIdParamsSchema }),
  ctrl.getChapter
);
router.patch(
  '/chapters/:chapterId',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: chapterIdParamsSchema, body: updateChapterSchema }),
  ctrl.updateChapter
);
router.delete(
  '/chapters/:chapterId',
  authorize(Permission.BOOK_UPDATE),
  validateRequest({ params: chapterIdParamsSchema }),
  ctrl.deleteChapter
);
router.post(
  '/chapters/:chapterId/approve',
  authorize(Permission.BOOK_PUBLISH),
  validateRequest({ params: chapterIdParamsSchema }),
  ctrl.approveChapter
);
router.post(
  '/chapters/:chapterId/reject',
  authorize(Permission.BOOK_PUBLISH),
  validateRequest({ params: chapterIdParamsSchema, body: rejectChapterSchema }),
  ctrl.rejectChapter
);

export default router;
