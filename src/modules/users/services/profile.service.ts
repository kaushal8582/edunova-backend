import { UserProfile } from '../models/user-profile.model';
import { ApiError } from '../../../utils/ApiError';
import { serializeProfile } from '../../../utils/serializers';
import type { UpdateProfileInput } from '../validators/profile.validators';

export async function getOwnProfile(userId: string) {
  const profile = await UserProfile.findOne({ userId }).lean();
  if (!profile) {
    throw ApiError.notFound('Profile not found');
  }
  return serializeProfile(profile);
}

export async function updateOwnProfile(userId: string, input: UpdateProfileInput) {
  const profile = await UserProfile.findOne({ userId });
  if (!profile) {
    throw ApiError.notFound('Profile not found');
  }

  if (input.fullName !== undefined) profile.fullName = input.fullName;
  if (input.displayName !== undefined) {
    profile.displayName = input.displayName ?? undefined;
  }
  if (input.avatar !== undefined) {
    profile.avatar = input.avatar
      ? { storageKey: input.avatar.storageKey }
      : undefined;
  }
  if (input.dateOfBirth !== undefined) {
    profile.dateOfBirth = input.dateOfBirth ?? undefined;
  }
  if (input.gender !== undefined) {
    profile.gender = (input.gender ?? undefined) as typeof profile.gender;
  }
  if (input.education) {
    const current =
      profile.education && typeof (profile.education as { toObject?: () => unknown }).toObject === 'function'
        ? (profile.education as { toObject: () => Record<string, unknown> }).toObject()
        : ((profile.education as Record<string, unknown> | undefined) ?? {});
    profile.education = {
      ...current,
      ...Object.fromEntries(
        Object.entries(input.education).map(([k, v]) => [k, v === null ? undefined : v])
      ),
    } as typeof profile.education;
  }
  if (input.location) {
    const current =
      profile.location && typeof (profile.location as { toObject?: () => unknown }).toObject === 'function'
        ? (profile.location as { toObject: () => Record<string, unknown> }).toObject()
        : ((profile.location as Record<string, unknown> | undefined) ?? {});
    profile.location = {
      ...current,
      ...Object.fromEntries(
        Object.entries(input.location).map(([k, v]) => [k, v === null ? undefined : v])
      ),
    } as typeof profile.location;
  }
  if (input.preferences) {
    const current =
      profile.preferences &&
      typeof (profile.preferences as { toObject?: () => unknown }).toObject === 'function'
        ? (profile.preferences as { toObject: () => Record<string, unknown> }).toObject()
        : ((profile.preferences as Record<string, unknown> | undefined) ?? {});
    profile.preferences = {
      ...current,
      ...input.preferences,
    } as typeof profile.preferences;
  }

  await profile.save();
  return serializeProfile(profile.toObject());
}
