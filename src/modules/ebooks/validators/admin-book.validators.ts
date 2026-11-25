import { z } from 'zod';
import {
  BOOK_ACCESS_TYPES,
  BOOK_FORMATS,
  BOOK_STATUSES,
  EDUCATION_LEVELS,
} from '../../shared/constants';

const objectId = z.string().trim().min(1);

export const createBookSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    slug: z.string().trim().min(1).max(500).optional(),
    subtitle: z.string().trim().max(500).optional(),
    description: z.string().trim().max(20000).optional(),
    authors: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    publisher: z.string().trim().max(256).optional(),
    language: z.string().trim().min(2).max(16).default('en'),
    coverStorageKey: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .regex(/^[a-zA-Z0-9/_.:-]+$/)
      .optional(),
    categoryIds: z.array(objectId).max(50).default([]),
    subjects: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    tags: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
    educationLevels: z
      .array(z.enum(EDUCATION_LEVELS as [string, ...string[]]))
      .default([]),
    accessType: z.enum(BOOK_ACCESS_TYPES as [string, ...string[]]).default('FREE'),
  })
  .strict();

export const updateBookSchema = createBookSchema
  .partial()
  .extend({
    status: z.enum(['DRAFT', 'REVIEW', 'ARCHIVED', 'FAILED'] as [string, ...string[]]).optional(),
  })
  .strict();

export const listAdminBooksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: z.enum(BOOK_STATUSES as [string, ...string[]]).optional(),
  accessType: z.enum(BOOK_ACCESS_TYPES as [string, ...string[]]).optional(),
  categoryId: objectId.optional(),
  language: z.string().trim().max(16).optional(),
  sortBy: z.enum(['createdAt', 'publishedAt', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const bookIdParamsSchema = z.object({ bookId: objectId });
export const versionIdParamsSchema = z.object({
  bookId: objectId,
  versionId: objectId,
});
export const chapterIdParamsSchema = z.object({ chapterId: objectId });

export const createVersionSchema = z
  .object({
    versionNumber: z.number().int().min(1).optional(),
  })
  .strict();

export const uploadUrlsSchema = z
  .object({
    formats: z
      .array(
        z.object({
          format: z.enum(BOOK_FORMATS as [string, ...string[]]),
          originalFileName: z.string().trim().min(1).max(512),
          mimeType: z.string().trim().min(3).max(128),
          sizeBytes: z.number().int().positive(),
        })
      )
      .min(1)
      .max(2),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const item of data.formats) {
      if (seen.has(item.format)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Duplicate formats in upload request',
          path: ['formats'],
        });
      }
      seen.add(item.format);
    }
  });

export const completeUploadSchema = z
  .object({
    formats: z
      .array(
        z.object({
          format: z.enum(BOOK_FORMATS as [string, ...string[]]),
          storageKey: z
            .string()
            .trim()
            .min(1)
            .max(512)
            .regex(/^[a-zA-Z0-9/_.:-]+$/),
          checksum: z.string().trim().max(128).optional(),
        })
      )
      .min(1)
      .max(2),
  })
  .strict();

const chapterFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    slug: z.string().trim().min(1).max(500).optional(),
    chapterNumber: z.number().int().min(1),
    parentChapterId: objectId.optional().nullable(),
    level: z.number().int().min(1).max(10).default(1),
    order: z.number().int().min(1),
    formatLocations: z
      .object({
        pdf: z
          .object({
            startPage: z.number().int().min(1).optional(),
            endPage: z.number().int().min(1).optional(),
          })
          .optional(),
        epub: z
          .object({
            startHref: z.string().trim().max(1024).optional(),
            endHref: z.string().trim().max(1024).optional(),
            startCfi: z.string().trim().max(2048).optional(),
            endCfi: z.string().trim().max(2048).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

function refineChapterPageRanges(
  data: { formatLocations?: { pdf?: { startPage?: number; endPage?: number } } },
  ctx: z.RefinementCtx
): void {
  const pdf = data.formatLocations?.pdf;
  if (
    pdf?.startPage != null &&
    pdf?.endPage != null &&
    pdf.startPage > pdf.endPage
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'PDF startPage must not be greater than endPage',
      path: ['formatLocations', 'pdf'],
    });
  }
}

export const createChapterSchema = chapterFieldsSchema.superRefine(refineChapterPageRanges);

export const updateChapterSchema = chapterFieldsSchema
  .partial()
  .strict()
  .superRefine(refineChapterPageRanges);

export const reorderChaptersSchema = z
  .object({
    orderedChapterIds: z.array(objectId).min(1).max(2000),
  })
  .strict();

export const rejectChapterSchema = z
  .object({
    reason: z.string().trim().min(3).max(1000).optional(),
  })
  .strict();

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    parentId: objectId.optional().nullable(),
    displayOrder: z.number().int().min(0).default(0),
  })
  .strict();

export const updateCategorySchema = createCategorySchema
  .partial()
  .extend({
    status: z.enum(['ACTIVE', 'INACTIVE'] as [string, ...string[]]).optional(),
  })
  .strict();

export const categoryIdParamsSchema = z.object({ categoryId: objectId });

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type ListAdminBooksQuery = z.infer<typeof listAdminBooksQuerySchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type UploadUrlsInput = z.infer<typeof uploadUrlsSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
export type ReorderChaptersInput = z.infer<typeof reorderChaptersSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
