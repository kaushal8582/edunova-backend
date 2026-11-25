import { Router } from 'express';
import { authenticate, optionalAuth } from '../../../middleware/authenticate';
import { validateRequest } from '../../../middleware/validateRequest';
import * as ctrl from '../controllers/viewer-book.controller';
import {
  annotationIdParamsSchema,
  bookIdParamsSchema,
  bookmarkIdParamsSchema,
  createAnnotationSchema,
  createBookmarkSchema,
  listBooksQuerySchema,
  openBookSchema,
  updateAnnotationSchema,
  updateBookmarkSchema,
  upsertProgressSchema,
} from '../validators/viewer-book.validators';

const booksRouter = Router();
const meBooksRouter = Router();
const meLibraryRouter = Router();
const categoriesRouter = Router();

categoriesRouter.get('/', ctrl.listCategories);

booksRouter.get('/', validateRequest({ query: listBooksQuerySchema }), ctrl.listBooks);
booksRouter.get(
  '/:bookId',
  optionalAuth,
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.getBook
);
booksRouter.get(
  '/:bookId/chapters',
  optionalAuth,
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.getChapters
);
booksRouter.get(
  '/:bookId/access',
  authenticate,
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.getAccess
);
booksRouter.post(
  '/:bookId/open',
  authenticate,
  validateRequest({ params: bookIdParamsSchema, body: openBookSchema }),
  ctrl.openBook
);

meBooksRouter.use(authenticate);
meBooksRouter.get('/recent', ctrl.listRecent);
meBooksRouter.get('/progress', ctrl.listAllProgress);
meBooksRouter.get(
  '/:bookId/progress',
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.getProgress
);
meBooksRouter.put(
  '/:bookId/progress',
  validateRequest({ params: bookIdParamsSchema, body: upsertProgressSchema }),
  ctrl.upsertProgress
);
meBooksRouter.get(
  '/:bookId/bookmarks',
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.listBookmarks
);
meBooksRouter.post(
  '/:bookId/bookmarks',
  validateRequest({ params: bookIdParamsSchema, body: createBookmarkSchema }),
  ctrl.createBookmark
);
meBooksRouter.get(
  '/:bookId/annotations',
  validateRequest({ params: bookIdParamsSchema }),
  ctrl.listAnnotations
);
meBooksRouter.post(
  '/:bookId/annotations',
  validateRequest({ params: bookIdParamsSchema, body: createAnnotationSchema }),
  ctrl.createAnnotation
);

meLibraryRouter.use(authenticate);
meLibraryRouter.patch(
  '/bookmarks/:bookmarkId',
  validateRequest({ params: bookmarkIdParamsSchema, body: updateBookmarkSchema }),
  ctrl.updateBookmark
);
meLibraryRouter.delete(
  '/bookmarks/:bookmarkId',
  validateRequest({ params: bookmarkIdParamsSchema }),
  ctrl.deleteBookmark
);
meLibraryRouter.patch(
  '/annotations/:annotationId',
  validateRequest({ params: annotationIdParamsSchema, body: updateAnnotationSchema }),
  ctrl.updateAnnotation
);
meLibraryRouter.delete(
  '/annotations/:annotationId',
  validateRequest({ params: annotationIdParamsSchema }),
  ctrl.deleteAnnotation
);

export { booksRouter, meBooksRouter, meLibraryRouter, categoriesRouter };
