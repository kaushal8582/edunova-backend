import { Book } from '../models/book.model';
import { BookAccess } from '../models/book-access.model';
import {
  BookAccessType,
  UserRole,
  UserStatus,
} from '../../shared/constants';
import { roleHasPermission, Permission } from '../../../constants/permissions';
import { ApiError } from '../../../utils/ApiError';
import { isValidObjectId } from '../../../utils/mongo';

export interface BookAccessDecision {
  allowed: boolean;
  reason:
    | 'FREE'
    | 'ENTITLED'
    | 'ADMIN_PREVIEW'
    | 'NOT_PUBLISHED'
    | 'NO_ENTITLEMENT'
    | 'ACCOUNT_INACTIVE'
    | 'BOOK_NOT_FOUND';
  accessType?: BookAccessType;
  entitlement?: {
    source: string;
    startsAt?: Date | null;
    expiresAt?: Date | null;
  } | null;
}

export async function evaluateBookAccess(params: {
  bookId: string;
  user?: { id: string; role: UserRole; status: UserStatus } | null;
  requirePublished?: boolean;
}): Promise<BookAccessDecision> {
  if (!isValidObjectId(params.bookId)) {
    throw ApiError.badRequest('Invalid book id');
  }

  const book = await Book.findById(params.bookId).lean();
  if (!book) {
    return { allowed: false, reason: 'BOOK_NOT_FOUND' };
  }

  const requirePublished = params.requirePublished !== false;
  const isAdminPreview =
    params.user != null &&
    roleHasPermission(params.user.role, Permission.BOOK_READ) &&
    params.user.role !== UserRole.VIEWER;

  if (requirePublished && book.status !== 'PUBLISHED' && !isAdminPreview) {
    return {
      allowed: false,
      reason: 'NOT_PUBLISHED',
      accessType: book.accessType,
    };
  }

  if (!params.user) {
    if (book.accessType === BookAccessType.FREE && book.status === 'PUBLISHED') {
      // Catalogue can show free books, but opening requires auth in /open.
      return { allowed: false, reason: 'ACCOUNT_INACTIVE', accessType: book.accessType };
    }
    return { allowed: false, reason: 'NO_ENTITLEMENT', accessType: book.accessType };
  }

  if (params.user.status !== UserStatus.ACTIVE) {
    return { allowed: false, reason: 'ACCOUNT_INACTIVE', accessType: book.accessType };
  }

  if (isAdminPreview) {
    return { allowed: true, reason: 'ADMIN_PREVIEW', accessType: book.accessType };
  }

  if (book.accessType === BookAccessType.FREE) {
    return { allowed: true, reason: 'FREE', accessType: book.accessType };
  }

  const now = new Date();
  const entitlement = await BookAccess.findOne({
    userId: params.user.id,
    bookId: book._id,
  }).lean();

  if (!entitlement) {
    return { allowed: false, reason: 'NO_ENTITLEMENT', accessType: book.accessType };
  }

  if (entitlement.startsAt && entitlement.startsAt > now) {
    return { allowed: false, reason: 'NO_ENTITLEMENT', accessType: book.accessType };
  }
  if (entitlement.expiresAt && entitlement.expiresAt <= now) {
    return { allowed: false, reason: 'NO_ENTITLEMENT', accessType: book.accessType };
  }

  return {
    allowed: true,
    reason: 'ENTITLED',
    accessType: book.accessType,
    entitlement: {
      source: entitlement.source,
      startsAt: entitlement.startsAt ?? null,
      expiresAt: entitlement.expiresAt ?? null,
    },
  };
}

export async function assertCanReadBook(params: {
  bookId: string;
  user: { id: string; role: UserRole; status: UserStatus };
}): Promise<void> {
  const decision = await evaluateBookAccess({
    bookId: params.bookId,
    user: params.user,
    requirePublished: true,
  });
  if (!decision.allowed) {
    if (decision.reason === 'NOT_PUBLISHED' || decision.reason === 'BOOK_NOT_FOUND') {
      throw ApiError.notFound('Book not found');
    }
    if (decision.reason === 'ACCOUNT_INACTIVE') {
      throw ApiError.forbidden('Account is not active');
    }
    throw ApiError.forbidden('You do not have access to this book');
  }
}
