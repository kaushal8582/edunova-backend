import type { Types } from 'mongoose';
import { AdminAuditLog } from '../models/admin-audit-log.model';
import type { AdminAuditAction } from '../../shared/constants';

export async function writeAdminAuditLog(params: {
  adminId: string | Types.ObjectId;
  action: AdminAuditAction | string;
  resourceType: string;
  resourceId: string | Types.ObjectId;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await AdminAuditLog.create({
    adminId: params.adminId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    changes: params.changes,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}
