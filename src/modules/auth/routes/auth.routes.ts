import { Router } from 'express';
import { authenticate } from '../../../middleware/authenticate';
import { ensureCsrfCookie, requireCsrfForCookieAuth } from '../../../middleware/csrf';
import {
  authLoginLimiter,
  authPasswordResetLimiter,
  authRefreshLimiter,
  authRegisterLimiter,
  authVerificationLimiter,
} from '../../../middleware/rateLimit';
import { validateRequest } from '../../../middleware/validateRequest';
import * as authController from '../controllers/auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionIdParamsSchema,
  verifyEmailSchema,
} from '../validators/auth.validators';

const router = Router();

router.post(
  '/register',
  authRegisterLimiter,
  validateRequest({ body: registerSchema }),
  authController.register
);

router.post(
  '/verify-email',
  authVerificationLimiter,
  validateRequest({ body: verifyEmailSchema }),
  authController.verifyEmail
);

router.post(
  '/resend-verification',
  authVerificationLimiter,
  validateRequest({ body: resendVerificationSchema }),
  authController.resendVerification
);

router.post(
  '/login',
  authLoginLimiter,
  ensureCsrfCookie,
  validateRequest({ body: loginSchema }),
  authController.login
);

router.post(
  '/refresh',
  authRefreshLimiter,
  ensureCsrfCookie,
  requireCsrfForCookieAuth,
  authController.refresh
);

router.post(
  '/logout',
  ensureCsrfCookie,
  requireCsrfForCookieAuth,
  authController.logout
);

router.post('/logout-all', authenticate, authController.logoutAll);

router.post(
  '/forgot-password',
  authPasswordResetLimiter,
  validateRequest({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authPasswordResetLimiter,
  validateRequest({ body: resetPasswordSchema }),
  authController.resetPassword
);

router.post(
  '/change-password',
  authenticate,
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword
);

router.get('/me', authenticate, authController.me);

router.get('/sessions', authenticate, authController.listSessions);

router.delete(
  '/sessions/:sessionId',
  authenticate,
  validateRequest({ params: sessionIdParamsSchema }),
  authController.revokeSession
);

export default router;
