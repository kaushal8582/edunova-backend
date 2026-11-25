import { z } from 'zod';
import {
  BOOK_ACCESS_TYPES,
  BOOK_FORMATS,
  EDUCATION_LEVELS,
  ANNOTATION_COLOR_NAMES,
} from '../../shared/constants';

const objectId = z.string().trim().min(1);

export const listBooksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  categoryId: objectId.optional(),
  subject: z.string().trim().max(100).optional(),
  educationLevel: z.enum(EDUCATION_LEVELS as [string, ...string[]]).optional(),
  language: z.string().trim().max(16).optional(),
  accessType: z.enum(BOOK_ACCESS_TYPES as [string, ...string[]]).optional(),
  sortBy: z.enum(['publishedAt', 'title', 'createdAt']).default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const openBookSchema = z
  .object({
    format: z.enum(BOOK_FORMATS as [string, ...string[]]),
  })
  .strict();

export const upsertProgressSchema = z
  .object({
    bookVersionId: objectId,
    format: z.enum(BOOK_FORMATS as [string, ...string[]]),
    progressPercentage: z.number().min(0).max(100),
    position: z.object({
      page: z.number().int().min(1).optional(),
      offset: z.number().min(0).optional(),
      cfi: z.string().trim().max(4096).optional(),
      href: z.string().trim().max(1024).optional(),
      progression: z.number().min(0).max(1).optional(),
    }),
    clientUpdatedAt: z.coerce.date().optional(),
  })
  .strict();

export const createBookmarkSchema = z
  .object({
    bookVersionId: objectId,
    format: z.enum(BOOK_FORMATS as [string, ...string[]]),
    location: z.object({
      page: z.number().int().min(1).optional(),
      offset: z.number().min(0).optional(),
      cfi: z.string().trim().max(4096).optional(),
      href: z.string().trim().max(1024).optional(),
    }),
    label: z.string().trim().max(200).optional(),
  })
  .strict();

export const updateBookmarkSchema = z
  .object({
    location: createBookmarkSchema.shape.location.optional(),
    label: z.string().trim().max(200).optional().nullable(),
  })
  .strict();

export const createAnnotationSchema = z
  .object({
    bookVersionId: objectId,
    chapterId: objectId.optional(),
    format: z.enum(BOOK_FORMATS as [string, ...string[]]),
    selectedText: z.string().trim().min(1).max(10000),
    color: z.union([
      z.enum(ANNOTATION_COLOR_NAMES as [string, ...string[]]),
      z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/),
    ]),
    note: z.string().trim().max(5000).optional(),
    anchor: z.object({
      page: z.number().int().min(1).optional(),
      startOffset: z.number().min(0).optional(),
      endOffset: z.number().min(0).optional(),
      rectangles: z
        .array(
          z.object({
            x: z.number(),
            y: z.number(),
            width: z.number().min(0),
            height: z.number().min(0),
          })
        )
        .optional(),
      cfi: z.string().trim().max(4096).optional(),
      href: z.string().trim().max(1024).optional(),
    }),
    anchorSchemaVersion: z.number().int().min(1).default(1),
  })
  .strict();

export const updateAnnotationSchema = z
  .object({
    color: createAnnotationSchema.shape.color.optional(),
    note: z.string().trim().max(5000).optional().nullable(),
    selectedText: z.string().trim().min(1).max(10000).optional(),
    anchor: createAnnotationSchema.shape.anchor.optional(),
  })
  .strict();

export const bookIdParamsSchema = z.object({ bookId: objectId });
export const bookmarkIdParamsSchema = z.object({ bookmarkId: objectId });
export const annotationIdParamsSchema = z.object({ annotationId: objectId });

export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;
export type OpenBookInput = z.infer<typeof openBookSchema>;
export type UpsertProgressInput = z.infer<typeof upsertProgressSchema>;
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;
export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
export type UpdateAnnotationInput = z.infer<typeof updateAnnotationSchema>;
