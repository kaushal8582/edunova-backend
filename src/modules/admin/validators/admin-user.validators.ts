import { z } from 'zod';
import { USER_ROLES, USER_STATUSES, UserRole, UserStatus } from '../../shared/constants';
import { CREATABLE_ADMIN_ROLES } from '../../../constants/permissions';

const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9]/);

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
  status: z.enum(USER_STATUSES as [string, ...string[]]).optional(),
  emailVerified: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v == null ? undefined : v === 'true')),
  sortBy: z.enum(['createdAt', 'lastLoginAt', 'email']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const userIdParamsSchema = z.object({
  userId: z.string().trim().min(1),
});

export const userSessionParamsSchema = z.object({
  userId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
});

export const updateUserStatusSchema = z
  .object({
    status: z.enum([UserStatus.ACTIVE, UserStatus.SUSPENDED] as [string, ...string[]]),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export const createAdminSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()),
    password: passwordSchema,
    role: z.enum(CREATABLE_ADMIN_ROLES as unknown as [string, ...string[]]),
  })
  .strict();

export const changeRoleSchema = z
  .object({
    role: z.enum([
      UserRole.CONTENT_ADMIN,
      UserRole.SUPPORT_ADMIN,
      UserRole.VIEWER,
    ] as [string, ...string[]]),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
