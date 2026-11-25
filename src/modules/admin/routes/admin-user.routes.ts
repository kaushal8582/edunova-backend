import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate';
import { authorize, authorizeAny } from '../../../middleware/authorize';
import { Permission } from '../../../constants/permissions';
import { validateRequest } from '../../../middleware/validateRequest';
import * as adminUserController from '../controllers/admin-user.controller';
import {
  changeRoleSchema,
  createAdminSchema,
  listUsersQuerySchema,
  updateUserStatusSchema,
  userIdParamsSchema,
  userSessionParamsSchema,
} from '../validators/admin-user.validators';

const router = Router();

router.use(authenticate);

router.get(
  '/users',
  authorize(Permission.USER_READ),
  validateRequest({ query: listUsersQuerySchema }),
  adminUserController.listUsers
);

router.get(
  '/users/:userId',
  authorize(Permission.USER_READ),
  validateRequest({ params: userIdParamsSchema }),
  adminUserController.getUser
);

router.patch(
  '/users/:userId/status',
  authorizeAny(Permission.USER_SUSPEND, Permission.USER_ACTIVATE),
  validateRequest({ params: userIdParamsSchema, body: updateUserStatusSchema }),
  adminUserController.updateStatus
);

router.post(
  '/admins',
  authorize(Permission.ADMIN_CREATE),
  validateRequest({ body: createAdminSchema }),
  adminUserController.createAdmin
);

router.patch(
  '/users/:userId/role',
  authorize(Permission.ADMIN_ROLE_UPDATE),
  validateRequest({ params: userIdParamsSchema, body: changeRoleSchema }),
  adminUserController.changeRole
);

router.get(
  '/users/:userId/sessions',
  authorize(Permission.USER_SESSION_READ),
  validateRequest({ params: userIdParamsSchema }),
  adminUserController.listSessions
);

router.delete(
  '/users/:userId/sessions/:sessionId',
  authorize(Permission.USER_SESSION_REVOKE),
  validateRequest({ params: userSessionParamsSchema }),
  adminUserController.revokeSession
);

export default router;
