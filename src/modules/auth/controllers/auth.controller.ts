import type { Request, Response } from 'express';
import { asyncHandler } from '../../../utils/asyncHandler';
import { sendSuccess } from '../../../utils/ApiResponse';
import { clearRefreshTokenCookie, setRefreshTokenCookie } from '../../../utils/cookies';
import { isTrustedMobileClient } from '../../../utils/client';
import * as authService from '../services/auth.service';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '../validators/auth.validators';

export const register = asyncHandler(async (req, res) => {
  const data = await authService.registerUser(req.body as RegisterInput);
  return sendSuccess(res, 201, 'Registration successful. Please verify your email.', data);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const data = await authService.verifyEmail(req.body as VerifyEmailInput);
  return sendSuccess(res, 200, 'Email verified successfully', data);
});

export const resendVerification = asyncHandler(async (req, res) => {
  const data = await authService.resendVerification(req.body as ResendVerificationInput);
  return sendSuccess(res, 200, data.message, {});
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body as LoginInput, req);

  if (!result.deliverRefreshInBody) {
    setRefreshTokenCookie(res, result.refreshToken);
  }

  return sendSuccess(res, 200, 'Login successful', {
    accessToken: result.accessToken,
    user: result.user,
    ...(result.deliverRefreshInBody ? { refreshToken: result.refreshToken } : {}),
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refreshTokens(req);

  if (!result.deliverRefreshInBody) {
    setRefreshTokenCookie(res, result.refreshToken);
  }

  return sendSuccess(res, 200, 'Token refreshed', {
    accessToken: result.accessToken,
    ...(result.deliverRefreshInBody ? { refreshToken: result.refreshToken } : {}),
  });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logoutCurrentSession(req);
  clearRefreshTokenCookie(res);
  return sendSuccess(res, 200, 'Logged out successfully', {});
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAllSessions(req.user!.id);
  clearRefreshTokenCookie(res);
  return sendSuccess(res, 200, 'Logged out from all devices', {});
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const data = await authService.forgotPassword(req.body as ForgotPasswordInput);
  return sendSuccess(res, 200, data.message, {});
});

export const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.body as ResetPasswordInput);
  clearRefreshTokenCookie(res);
  return sendSuccess(res, 200, 'Password reset successful', data);
});

export const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(
    req.user!.id,
    req.user!.sessionId,
    req.body as ChangePasswordInput
  );

  if (isTrustedMobileClient(req)) {
    return sendSuccess(res, 200, 'Password changed successfully', {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }

  setRefreshTokenCookie(res, result.refreshToken);
  return sendSuccess(res, 200, 'Password changed successfully', {
    accessToken: result.accessToken,
  });
});

export const me = asyncHandler(async (req, res) => {
  const data = await authService.getCurrentUser(req.user!.id);
  return sendSuccess(res, 200, 'Current user', data);
});

export const listSessions = asyncHandler(async (req, res) => {
  const data = await authService.listUserSessions(req.user!.id, req.user!.sessionId);
  return sendSuccess(res, 200, 'Active sessions', { sessions: data });
});

export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId);
  const result = await authService.revokeOwnSession(
    req.user!.id,
    sessionId,
    req.user!.sessionId
  );

  if (result.revokedCurrent) {
    clearRefreshTokenCookie(res);
  }

  return sendSuccess(res, 200, 'Session revoked', {});
});
