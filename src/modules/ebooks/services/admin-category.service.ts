import { Book } from '../models/book.model';
import { BookCategory } from '../models/book-category.model';
import {
  AdminAuditAction,
  BookCategoryStatus,
  BookStatus,
} from '../../shared/constants';
import { writeAdminAuditLog } from '../../admin/services/audit.service';
import { ApiError } from '../../../utils/ApiError';
import { isDuplicateKeyError, isValidObjectId } from '../../../utils/mongo';
import { ensureUniqueSlug, slugify } from '../../../utils/slug';
import { serializeCategory } from '../utils/serializers';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../validators/admin-book.validators';

async function wouldCreateCategoryCycle(
  categoryId: string,
  newParentId: string | null | undefined
): Promise<boolean> {
  if (!newParentId) return false;
  if (newParentId === categoryId) return true;
  let current = newParentId;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current) || current === categoryId) return true;
    visited.add(current);
    const parent = await BookCategory.findById(current).select('parentId').lean();
    current = parent?.parentId?.toString() ?? '';
    if (!current) break;
  }
  return false;
}

export async function createCategory(params: {
  adminId: string;
  input: CreateCategoryInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  const input = params.input;
  if (input.parentId) {
    if (!isValidObjectId(input.parentId)) throw ApiError.badRequest('Invalid parentId');
    const parent = await BookCategory.findById(input.parentId).lean();
    if (!parent) throw ApiError.badRequest('Parent category not found');
  }

  const base = input.slug ? slugify(input.slug) : slugify(input.name);
  const slug = await ensureUniqueSlug(base, async (s) =>
    Boolean(await BookCategory.exists({ slug: s }))
  );

  try {
    const category = await BookCategory.create({
      name: input.name,
      slug,
      description: input.description,
      parentId: input.parentId ?? undefined,
      status: BookCategoryStatus.ACTIVE,
      displayOrder: input.displayOrder,
      createdBy: params.adminId,
    });

    await writeAdminAuditLog({
      adminId: params.adminId,
      action: AdminAuditAction.BOOK_CATEGORY_CREATE,
      resourceType: 'BookCategory',
      resourceId: category._id,
      changes: { after: { name: category.name, slug: category.slug } },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return serializeCategory(category.toObject());
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict('Category slug already exists');
    }
    throw error;
  }
}

export async function listCategoriesAdmin() {
  const items = await BookCategory.find().sort({ displayOrder: 1, name: 1 }).lean();
  return items.map(serializeCategory);
}

export async function listActiveCategories() {
  const items = await BookCategory.find({ status: BookCategoryStatus.ACTIVE })
    .sort({ displayOrder: 1, name: 1 })
    .lean();
  return items.map((c) => ({
    id: c._id.toString(),
    name: c.name,
    slug: c.slug,
    description: c.description ?? null,
    parentId: c.parentId?.toString() ?? null,
    displayOrder: c.displayOrder,
  }));
}

export async function getCategory(categoryId: string) {
  if (!isValidObjectId(categoryId)) throw ApiError.badRequest('Invalid category id');
  const category = await BookCategory.findById(categoryId).lean();
  if (!category) throw ApiError.notFound('Category not found');
  return serializeCategory(category);
}

export async function updateCategory(params: {
  adminId: string;
  categoryId: string;
  input: UpdateCategoryInput;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!isValidObjectId(params.categoryId)) throw ApiError.badRequest('Invalid category id');
  const category = await BookCategory.findById(params.categoryId);
  if (!category) throw ApiError.notFound('Category not found');

  const input = params.input;
  if (input.parentId !== undefined) {
    if (input.parentId) {
      if (!isValidObjectId(input.parentId)) throw ApiError.badRequest('Invalid parentId');
      if (await wouldCreateCategoryCycle(category._id.toString(), input.parentId)) {
        throw ApiError.badRequest('Circular category hierarchy is not allowed');
      }
      category.parentId = input.parentId as never;
    } else {
      category.parentId = undefined;
    }
  }
  if (input.name !== undefined) category.name = input.name;
  if (input.description !== undefined) category.description = input.description;
  if (input.displayOrder !== undefined) category.displayOrder = input.displayOrder;
  if (input.status !== undefined) {
    category.status = input.status as typeof category.status;
  }
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    const taken = await BookCategory.exists({ slug, _id: { $ne: category._id } });
    if (taken) throw ApiError.conflict('Category slug already exists');
    category.slug = slug;
  }

  await category.save();
  await writeAdminAuditLog({
    adminId: params.adminId,
    action: AdminAuditAction.BOOK_CATEGORY_UPDATE,
    resourceType: 'BookCategory',
    resourceId: category._id,
    changes: { after: { name: category.name, status: category.status, slug: category.slug } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return serializeCategory(category.toObject());
}

export async function deleteCategory(params: {
  adminId: string;
  categoryId: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!isValidObjectId(params.categoryId)) throw ApiError.badRequest('Invalid category id');
  const category = await BookCategory.findById(params.categoryId);
  if (!category) throw ApiError.notFound('Category not found');

  const childCount = await BookCategory.countDocuments({ parentId: category._id });
  if (childCount > 0) {
    throw ApiError.badRequest('Remove child categories before deleting');
  }

  const publishedUsage = await Book.countDocuments({
    categoryIds: category._id,
    status: BookStatus.PUBLISHED,
  });
  if (publishedUsage > 0) {
    throw ApiError.badRequest(
      'Category is assigned to published books; reassign or archive those books first'
    );
  }

  await BookCategory.deleteOne({ _id: category._id });
  await Book.updateMany(
    { categoryIds: category._id },
    { $pull: { categoryIds: category._id } }
  );

  await writeAdminAuditLog({
    adminId: params.adminId,
    action: 'BOOK_CATEGORY_DELETE',
    resourceType: 'BookCategory',
    resourceId: category._id,
    changes: { meta: { name: category.name } },
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  return { deleted: true };
}
