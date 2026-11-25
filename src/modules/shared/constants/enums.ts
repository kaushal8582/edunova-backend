/**
 * Shared domain enums/constants for Mongoose schemas.
 * Prefer these over hardcoded string literals in model definitions.
 */

// ─── Users / Auth ───────────────────────────────────────────────────────────

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CONTENT_ADMIN: 'CONTENT_ADMIN',
  SUPPORT_ADMIN: 'SUPPORT_ADMIN',
  VIEWER: 'VIEWER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = Object.values(UserRole);

/**
 * Public registration must always assign VIEWER via trusted backend logic.
 * Never trust a client-supplied admin role.
 */
export const PUBLIC_REGISTRATION_ROLE: UserRole = UserRole.VIEWER;

export const UserStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export const USER_STATUSES = Object.values(UserStatus);

export const AuthProvider = {
  LOCAL: 'LOCAL',
  GOOGLE: 'GOOGLE',
  APPLE: 'APPLE',
} as const;
export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];
export const AUTH_PROVIDERS = Object.values(AuthProvider);

export const ThemePreference = {
  LIGHT: 'LIGHT',
  DARK: 'DARK',
  SYSTEM: 'SYSTEM',
} as const;
export type ThemePreference = (typeof ThemePreference)[keyof typeof ThemePreference];
export const THEME_PREFERENCES = Object.values(ThemePreference);

export const EducationLevel = {
  SCHOOL: 'SCHOOL',
  COLLEGE: 'COLLEGE',
  COMPETITIVE_EXAM: 'COMPETITIVE_EXAM',
  OTHER: 'OTHER',
} as const;
export type EducationLevel = (typeof EducationLevel)[keyof typeof EducationLevel];
export const EDUCATION_LEVELS = Object.values(EducationLevel);

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  NON_BINARY: 'NON_BINARY',
  PREFER_NOT_TO_SAY: 'PREFER_NOT_TO_SAY',
  OTHER: 'OTHER',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];
export const GENDERS = Object.values(Gender);

export const DevicePlatform = {
  WEB: 'WEB',
  ANDROID: 'ANDROID',
  IOS: 'IOS',
  OTHER: 'OTHER',
} as const;
export type DevicePlatform = (typeof DevicePlatform)[keyof typeof DevicePlatform];
export const DEVICE_PLATFORMS = Object.values(DevicePlatform);

// ─── eBooks ─────────────────────────────────────────────────────────────────

export const BookAccessType = {
  FREE: 'FREE',
  PREMIUM: 'PREMIUM',
  RESTRICTED: 'RESTRICTED',
} as const;
export type BookAccessType = (typeof BookAccessType)[keyof typeof BookAccessType];
export const BOOK_ACCESS_TYPES = Object.values(BookAccessType);

export const BookStatus = {
  DRAFT: 'DRAFT',
  PROCESSING: 'PROCESSING',
  REVIEW: 'REVIEW',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
  FAILED: 'FAILED',
} as const;
export type BookStatus = (typeof BookStatus)[keyof typeof BookStatus];
export const BOOK_STATUSES = Object.values(BookStatus);

export const BookFormat = {
  PDF: 'PDF',
  EPUB: 'EPUB',
} as const;
export type BookFormat = (typeof BookFormat)[keyof typeof BookFormat];
export const BOOK_FORMATS = Object.values(BookFormat);

export const BookVersionProcessingStatus = {
  PENDING: 'PENDING',
  UPLOADING: 'UPLOADING',
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type BookVersionProcessingStatus =
  (typeof BookVersionProcessingStatus)[keyof typeof BookVersionProcessingStatus];
export const BOOK_VERSION_PROCESSING_STATUSES = Object.values(BookVersionProcessingStatus);

export const BookCategoryStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type BookCategoryStatus =
  (typeof BookCategoryStatus)[keyof typeof BookCategoryStatus];
export const BOOK_CATEGORY_STATUSES = Object.values(BookCategoryStatus);

export const ChapterSource = {
  AUTO_DETECTED: 'AUTO_DETECTED',
  AI_SUGGESTED: 'AI_SUGGESTED',
  ADMIN_CREATED: 'ADMIN_CREATED',
  IMPORTED_TOC: 'IMPORTED_TOC',
} as const;
export type ChapterSource = (typeof ChapterSource)[keyof typeof ChapterSource];
export const CHAPTER_SOURCES = Object.values(ChapterSource);

export const ChapterStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ChapterStatus = (typeof ChapterStatus)[keyof typeof ChapterStatus];
export const CHAPTER_STATUSES = Object.values(ChapterStatus);

export const UserBookAccessType = {
  FREE: 'FREE',
  PREMIUM: 'PREMIUM',
  GRANTED: 'GRANTED',
} as const;
export type UserBookAccessType =
  (typeof UserBookAccessType)[keyof typeof UserBookAccessType];
export const USER_BOOK_ACCESS_TYPES = Object.values(UserBookAccessType);

export const BookAccessSource = {
  ADMIN_GRANT: 'ADMIN_GRANT',
  SUBSCRIPTION: 'SUBSCRIPTION',
  PURCHASE: 'PURCHASE',
  PROMOTIONAL: 'PROMOTIONAL',
} as const;
export type BookAccessSource = (typeof BookAccessSource)[keyof typeof BookAccessSource];
export const BOOK_ACCESS_SOURCES = Object.values(BookAccessSource);

export const AnnotationStatus = {
  ACTIVE: 'ACTIVE',
  NEEDS_REANCHOR: 'NEEDS_REANCHOR',
} as const;
export type AnnotationStatus = (typeof AnnotationStatus)[keyof typeof AnnotationStatus];
export const ANNOTATION_STATUSES = Object.values(AnnotationStatus);

/** Named highlight colors; hex colors (#RGB / #RRGGBB / #RRGGBBAA) are also allowed. */
export const AnnotationColorName = {
  YELLOW: 'yellow',
  GREEN: 'green',
  BLUE: 'blue',
  PINK: 'pink',
  ORANGE: 'orange',
  PURPLE: 'purple',
} as const;
export type AnnotationColorName =
  (typeof AnnotationColorName)[keyof typeof AnnotationColorName];
export const ANNOTATION_COLOR_NAMES = Object.values(AnnotationColorName);

export const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export function isValidAnnotationColor(value: string): boolean {
  return (
    (ANNOTATION_COLOR_NAMES as readonly string[]).includes(value) ||
    HEX_COLOR_REGEX.test(value)
  );
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export const AdminAuditAction = {
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_SUSPEND: 'USER_SUSPEND',
  USER_ACTIVATE: 'USER_ACTIVATE',
  USER_DELETE: 'USER_DELETE',
  ROLE_CHANGE: 'ROLE_CHANGE',
  BOOK_CREATE: 'BOOK_CREATE',
  BOOK_UPDATE: 'BOOK_UPDATE',
  BOOK_PUBLISH: 'BOOK_PUBLISH',
  BOOK_ARCHIVE: 'BOOK_ARCHIVE',
  BOOK_VERSION_CREATE: 'BOOK_VERSION_CREATE',
  BOOK_CATEGORY_CREATE: 'BOOK_CATEGORY_CREATE',
  BOOK_CATEGORY_UPDATE: 'BOOK_CATEGORY_UPDATE',
  BOOK_ACCESS_GRANT: 'BOOK_ACCESS_GRANT',
  BOOK_ACCESS_REVOKE: 'BOOK_ACCESS_REVOKE',
  CHAPTER_APPROVE: 'CHAPTER_APPROVE',
  CHAPTER_REJECT: 'CHAPTER_REJECT',
  OTHER: 'OTHER',
} as const;
export type AdminAuditAction = (typeof AdminAuditAction)[keyof typeof AdminAuditAction];
export const ADMIN_AUDIT_ACTIONS = Object.values(AdminAuditAction);

export const MODEL_NAMES = {
  User: 'User',
  UserProfile: 'UserProfile',
  UserSession: 'UserSession',
  EmailVerification: 'EmailVerification',
  PasswordResetToken: 'PasswordResetToken',
  Book: 'Book',
  BookVersion: 'BookVersion',
  BookCategory: 'BookCategory',
  BookChapter: 'BookChapter',
  ChapterContent: 'ChapterContent',
  BookAccess: 'BookAccess',
  ReadingProgress: 'ReadingProgress',
  Bookmark: 'Bookmark',
  Annotation: 'Annotation',
  AdminAuditLog: 'AdminAuditLog',
} as const;
export type ModelName = (typeof MODEL_NAMES)[keyof typeof MODEL_NAMES];
