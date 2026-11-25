import { z } from 'zod';
import { DEVICE_PLATFORMS, EDUCATION_LEVELS } from '../../shared/constants';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(15, 'Password must be at most 15 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character');

const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s()]{7,20}$/, 'Invalid phone number')
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .optional();

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()),
  password: passwordSchema,
  phone: phoneSchema,
  education: z.object({
    level: z.enum(EDUCATION_LEVELS),
    classOrYear: z.string().trim().max(100),
    institution: z.string().trim().max(100),
    board: z.string().trim().max(100),
    course: z.string().trim().max(100),
  }),
  // Explicitly reject any attempt to pass role through registration.
}).strict();

export const verifyEmailSchema = z
  .object({
    email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()),
    token: z.string().trim().min(4).max(128),
  })
  .strict();

export const resendVerificationSchema = z
  .object({
    email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
    device: z
      .object({
        platform: z.enum(DEVICE_PLATFORMS as [string, ...string[]]),
        deviceName: z.string().trim().max(128).optional(),
        appVersion: z.string().trim().max(64).optional(),
        deviceId: z.string().trim().max(256).optional(),
      })
      .default({ platform: 'WEB' }),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().email().max(320).transform((v) => v.toLowerCase()),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(20).max(512),
    newPassword: passwordSchema,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

export const sessionIdParamsSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
