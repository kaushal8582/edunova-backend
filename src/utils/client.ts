import type { Request } from 'express';
import { DevicePlatform } from '../modules/shared/constants';

/**
 * Mobile refresh-token delivery is allowed only when the client explicitly
 * identifies as a supported mobile channel via trusted header.
 * Never rely on body.device.platform alone for this security decision.
 */
export function isTrustedMobileClient(req: Request): boolean {
  const channel = String(req.header('x-client-channel') ?? '')
    .trim()
    .toLowerCase();
  if (channel !== 'mobile') {
    return false;
  }

  const platform = String(req.header('x-client-platform') ?? '')
    .trim()
    .toUpperCase();

  return platform === DevicePlatform.ANDROID || platform === DevicePlatform.IOS;
}

export function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim();
  }
  return req.ip;
}

export function getUserAgent(req: Request): string | undefined {
  const ua = req.get('user-agent');
  return ua ? ua.slice(0, 512) : undefined;
}
