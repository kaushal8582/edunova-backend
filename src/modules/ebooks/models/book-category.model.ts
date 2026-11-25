import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  BOOK_CATEGORY_STATUSES,
  BookCategoryStatus,
  MODEL_NAMES,
} from '../../shared/constants';

/**
 * Hierarchical book category.
 *
 * Schema validation prevents a category from parenting itself (parentId === _id).
 * Full circular-hierarchy detection (A→B→A, deep cycles) belongs in the future
 * service layer because it requires reading ancestor chains.
 */
export interface IBookCategory {
  name: string;
  slug: string;
  description?: string;
  parentId?: Types.ObjectId;
  status: BookCategoryStatus;
  displayOrder: number;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type BookCategoryDocument = HydratedDocument<IBookCategory>;

const bookCategorySchema = new Schema<IBookCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.BookCategory,
      default: undefined,
    },
    status: {
      type: String,
      enum: BOOK_CATEGORY_STATUSES,
      required: true,
      default: BookCategoryStatus.ACTIVE,
    },
    displayOrder: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'book_categories',
    strict: true,
  }
);

bookCategorySchema.pre('validate', function preventSelfParent() {
  if (this.parentId && this._id && this.parentId.equals(this._id)) {
    this.invalidate('parentId', 'A category cannot be its own parent');
  }
});

// Unique slug — handle E11000 at the application layer.
bookCategorySchema.index({ slug: 1 }, { unique: true, name: 'book_categories_slug_unique' });
bookCategorySchema.index({ parentId: 1 }, { name: 'book_categories_parentId' });
bookCategorySchema.index({ status: 1 }, { name: 'book_categories_status' });
bookCategorySchema.index(
  { parentId: 1, status: 1, displayOrder: 1 },
  { name: 'book_categories_hierarchy_order' }
);

export const BookCategory: Model<IBookCategory> =
  mongoose.models[MODEL_NAMES.BookCategory] ||
  mongoose.model<IBookCategory>(MODEL_NAMES.BookCategory, bookCategorySchema);
