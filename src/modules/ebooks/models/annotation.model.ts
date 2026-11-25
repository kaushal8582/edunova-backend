import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  ANNOTATION_STATUSES,
  AnnotationStatus,
  BOOK_FORMATS,
  BookFormat,
  isValidAnnotationColor,
  MODEL_NAMES,
} from '../../shared/constants';

/**
 * Highlights / annotations for future AI explanations.
 *
 * Annotations are permanently tied to bookVersionId. Publishing a new book
 * version must NOT silently migrate or move old anchors — set status to
 * NEEDS_REANCHOR and run a future re-anchoring pipeline that maps selectedText
 * + anchor onto the new version using anchorSchemaVersion-aware logic.
 */
export interface IPdfAnnotationRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IPdfAnnotationAnchor {
  page: number;
  startOffset?: number;
  endOffset?: number;
  rectangles?: IPdfAnnotationRectangle[];
}

export interface IEpubAnnotationAnchor {
  cfi?: string;
  href?: string;
  startOffset?: number;
  endOffset?: number;
}

export type IAnnotationAnchor = IPdfAnnotationAnchor | IEpubAnnotationAnchor;

export interface IAnnotation {
  userId: Types.ObjectId;
  bookId: Types.ObjectId;
  bookVersionId: Types.ObjectId;
  chapterId?: Types.ObjectId;
  format: BookFormat;
  selectedText: string;
  color: string;
  note?: string;
  anchor: IAnnotationAnchor;
  anchorSchemaVersion: number;
  status: AnnotationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type AnnotationDocument = HydratedDocument<IAnnotation>;

const rectangleSchema = new Schema<IPdfAnnotationRectangle>(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true, min: 0 },
    height: { type: Number, required: true, min: 0 },
  },
  { _id: false, strict: true }
);

const annotationSchema = new Schema<IAnnotation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
    bookId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.Book,
      required: true,
    },
    bookVersionId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.BookVersion,
      required: true,
    },
    chapterId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.BookChapter,
    },
    format: {
      type: String,
      enum: BOOK_FORMATS,
      required: true,
    },
    selectedText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },
    color: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
      validate: {
        validator: isValidAnnotationColor,
        message:
          'color must be a named highlight (yellow, green, blue, pink, orange, purple) or a hex color',
      },
    },
    note: {
      type: String,
      trim: true,
      maxlength: 5000,
    },
    /**
     * Keep selectedText and anchor together as a stable highlight unit.
     * PDF: page + offsets + rectangles. EPUB: cfi/href + offsets.
     */
    anchor: {
      type: new Schema(
        {
          page: { type: Number, min: 1 },
          startOffset: { type: Number, min: 0 },
          endOffset: { type: Number, min: 0 },
          rectangles: { type: [rectangleSchema], default: undefined },
          cfi: { type: String, trim: true, maxlength: 4096 },
          href: { type: String, trim: true, maxlength: 1024 },
        },
        { _id: false, strict: true }
      ),
      required: true,
    },
    anchorSchemaVersion: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    status: {
      type: String,
      enum: ANNOTATION_STATUSES,
      required: true,
      default: AnnotationStatus.ACTIVE,
    },
  },
  {
    timestamps: true,
    collection: 'annotations',
    strict: true,
  }
);

annotationSchema.pre('validate', function validateAnchorForFormat() {
  const anchor = this.anchor as (IPdfAnnotationAnchor & IEpubAnnotationAnchor) | undefined;
  if (!anchor) {
    this.invalidate('anchor', 'anchor is required');
    return;
  }

  if (this.format === BookFormat.PDF) {
    if (typeof anchor.page !== 'number' || anchor.page < 1) {
      this.invalidate('anchor.page', 'PDF annotations require a positive page');
    }
  } else if (this.format === BookFormat.EPUB) {
    if (!anchor.cfi && !anchor.href) {
      this.invalidate('anchor', 'EPUB annotations require cfi and/or href');
    }
    if (anchor.page != null) {
      this.invalidate('anchor.page', 'EPUB annotations must not store a PDF page');
    }
  }

  if (
    typeof anchor.startOffset === 'number' &&
    typeof anchor.endOffset === 'number' &&
    anchor.startOffset > anchor.endOffset
  ) {
    this.invalidate('anchor', 'startOffset must not be greater than endOffset');
  }
});

annotationSchema.index(
  { userId: 1, bookId: 1, bookVersionId: 1 },
  { name: 'annotations_userId_bookId_bookVersionId' }
);
annotationSchema.index(
  { userId: 1, bookId: 1, createdAt: -1 },
  { name: 'annotations_userId_bookId_createdAt' }
);
annotationSchema.index({ chapterId: 1 }, { name: 'annotations_chapterId' });
annotationSchema.index({ status: 1 }, { name: 'annotations_status' });

export const Annotation: Model<IAnnotation> =
  mongoose.models[MODEL_NAMES.Annotation] ||
  mongoose.model<IAnnotation>(MODEL_NAMES.Annotation, annotationSchema);
