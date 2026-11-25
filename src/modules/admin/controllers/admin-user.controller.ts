import { asyncHandler } from '../../../utils/asyncHandler';
import { sendSuccess } from '../../../utils/ApiResponse';
import { getClientIp, getUserAgent } from '../../../utils/client';
import * as adminUserService from '../services/admin-user.service';
import type {
  ChangeRoleInput,
  CreateAdminInput,
  ListUsersQuery,
  UpdateUserStatusInput,
} from '../validators/admin-user.validators';

export const listUsers = asyncHandler(async (req, res) => {
  const data = await adminUserService.listUsers(req.query as unknown as ListUsersQuery);
  return sendSuccess(res, 200, 'Users retrieved', data);
});

export const getUser = asyncHandler(async (req, res) => {
  const data = await adminUserService.getUserDetails(String(req.params.userId));
  return sendSuccess(res, 200, 'User details retrieved', data);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const data = await adminUserService.updateUserStatus({
    actor: { id: req.user!.id, role: req.user!.role },
    userId: String(req.params.userId),
    input: req.body as UpdateUserStatusInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'User status updated', data);
});

export const createAdmin = asyncHandler(async (req, res) => {
  const data = await adminUserService.createAdmin({
    actorId: req.user!.id,
    input: req.body as CreateAdminInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 201, 'Admin account created', data);
});

export const changeRole = asyncHandler(async (req, res) => {
  const data = await adminUserService.changeUserRole({
    actorId: req.user!.id,
    userId: String(req.params.userId),
    input: req.body as ChangeRoleInput,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'User role updated', data);
});

export const listSessions = asyncHandler(async (req, res) => {
  const sessions = await adminUserService.listUserSessionsForAdmin({
    actorId: req.user!.id,
    userId: String(req.params.userId),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'User sessions retrieved', { sessions });
});

export const revokeSession = asyncHandler(async (req, res) => {
  const data = await adminUserService.revokeUserSessionForAdmin({
    actorId: req.user!.id,
    userId: String(req.params.userId),
    sessionId: String(req.params.sessionId),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  });
  return sendSuccess(res, 200, 'Session revoked', data);
});
