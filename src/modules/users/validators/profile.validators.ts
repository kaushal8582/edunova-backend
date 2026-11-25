import { z } from 'zod';
import { EDUCATION_LEVELS, GENDERS, THEME_PREFERENCES } from '../../shared/constants';

const storageKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(
    /^[a-zA-Z0-9/_.:-]+$/,
    'avatar.storageKey must be a validated object-storage key (no arbitrary URLs)'
  );

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200).optional(),
    displayName: z.string().trim().max(100).optional().nullable(),
    avatar: z
      .object({
        storageKey: storageKeySchema,
      })
      .optional()
      .nullable(),
    dateOfBirth: z.coerce.date().optional().nullable(),
    gender: z.enum(GENDERS as [string, ...string[]]).optional().nullable(),
    education: z
      .object({
        level: z.enum(EDUCATION_LEVELS as [string, ...string[]]).optional(),
        classOrYear: z.string().trim().max(64).optional().nullable(),
        institution: z.string().trim().max(256).optional().nullable(),
        board: z.string().trim().max(128).optional().nullable(),
        course: z.string().trim().max(256).optional().nullable(),
      })
      .optional(),
    location: z
      .object({
        city: z.string().trim().max(128).optional().nullable(),
        state: z.string().trim().max(128).optional().nullable(),
        country: z.string().trim().max(128).optional().nullable(),
      })
      .optional(),
    preferences: z
      .object({
        language: z.string().trim().max(16).optional(),
        theme: z.enum(THEME_PREFERENCES as [string, ...string[]]).optional(),
        notificationsEnabled: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
