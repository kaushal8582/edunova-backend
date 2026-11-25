import { asyncHandler } from '../../../utils/asyncHandler';
import { sendSuccess } from '../../../utils/ApiResponse';
import * as profileService from '../services/profile.service';
import type { UpdateProfileInput } from '../validators/profile.validators';

export const getProfile = asyncHandler(async (req, res) => {
  const data = await profileService.getOwnProfile(req.user!.id);
  return sendSuccess(res, 200, 'Profile retrieved', data);
});

export const updateProfile = asyncHandler(async (req, res) => {
  const data = await profileService.updateOwnProfile(
    req.user!.id,
    req.body as UpdateProfileInput
  );
  return sendSuccess(res, 200, 'Profile updated', data);
});
