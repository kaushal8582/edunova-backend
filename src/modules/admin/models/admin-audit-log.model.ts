import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  ADMIN_AUDIT_ACTIONS,
  AdminAuditAction,
  MODEL_NAMES,
} from '../../shared/constants';

/**
 * Append-only admin activity log.
 *
 * Application code must only INSERT audit records — never update or delete them
 * in normal flows. Never store passwords, refresh tokens, verification tokens,
 * OTPs, or other authentication secrets inside `changes`.
 */
export interface IAdminAuditLogChanges {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface IAdminAuditLog {
  adminId: Types.ObjectId;
  action: AdminAuditAction | string;
  resourceType: string;
  resourceId: Types.ObjectId;
  changes?: IAdminAuditLogChanges;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export type AdminAuditLogDocument = HydratedDocument<IAdminAuditLog>;

const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|otp|hash|refresh|credential|authorization)/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertNoSensitiveKeys(
  value: unknown,
  path: string,
  invalidate: (path: string, message: string) => void,
  seen: WeakSet<object> = new WeakSet()
): void {
  if (value == null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSensitiveKeys(item, `${path}[${index}]`, invalidate, seen)
    );
    return;
  }

  // Avoid walking Mongoose docs / ObjectIds / Dates (can be circular or non-plain).
  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      invalidate(
        path,
        `Audit changes must not include sensitive key "${key}"`
      );
      return;
    }
    assertNoSensitiveKeys(nested, `${path}.${key}`, invalidate, seen);
  }
}

const changesSchema = new Schema<IAdminAuditLogChanges>(
  {
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    meta: { type: Schema.Types.Mixed },
  },
  { _id: false, strict: true }
);

const adminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: MODEL_NAMES.User,
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      // Prefer AdminAuditAction values; allow OTHER / future strings.
      validate: {
        validator(value: string) {
          return (
            (ADMIN_AUDIT_ACTIONS as readonly string[]).includes(value) ||
            value.length > 0
          );
        },
        message: 'action must be a non-empty string',
      },
    },
    resourceType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    changes: {
      type: changesSchema,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 64,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'admin_audit_logs',
    strict: true,
  }
);

adminAuditLogSchema.pre('validate', function rejectSensitiveChanges() {
  if (this.changes) {
    assertNoSensitiveKeys(this.changes, 'changes', (path, message) => {
      this.invalidate(path, message);
    });
  }
});

adminAuditLogSchema.index(
  { adminId: 1, createdAt: -1 },
  { name: 'admin_audit_logs_adminId_createdAt' }
);
adminAuditLogSchema.index(
  { resourceType: 1, resourceId: 1 },
  { name: 'admin_audit_logs_resourceType_resourceId' }
);
adminAuditLogSchema.index({ action: 1, createdAt: -1 }, { name: 'admin_audit_logs_action_createdAt' });

export const AdminAuditLog: Model<IAdminAuditLog> =
  mongoose.models[MODEL_NAMES.AdminAuditLog] ||
  mongoose.model<IAdminAuditLog>(MODEL_NAMES.AdminAuditLog, adminAuditLogSchema);
