/**
 * Secure seed process for creating the initial SUPER_ADMIN.
 * Usage:
 *   SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... SUPER_ADMIN_NAME=... npx tsx src/scripts/seed-super-admin.ts
 */
import { loadEnv } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { AuthProvider, UserRole, UserStatus } from '../modules/shared/constants';
import { User } from '../modules/users/models/user.model';
import { UserProfile } from '../modules/users/models/user-profile.model';
import { hashPassword } from '../utils/password';

async function seed(): Promise<void> {
  loadEnv();
  await connectDatabase();

  const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || '';
  const fullName = (process.env.SUPER_ADMIN_NAME || 'Super Admin').trim();

  if (!email || !password || password.length < 6) {
    throw new Error(
      'Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (min 6 chars) before seeding'
    );
  }

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== UserRole.SUPER_ADMIN) {
      throw new Error(`User ${email} exists but is not SUPER_ADMIN`);
    }
    console.info(`[seed] SUPER_ADMIN already exists: ${email}`);
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    passwordHash,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    authProvider: AuthProvider.LOCAL,
    emailVerified: true,
    phoneVerified: false,
  });

  await UserProfile.create({
    userId: user._id,
    fullName,
  });

  console.info(`[seed] Created SUPER_ADMIN ${email} (${user._id.toString()})`);
}

seed()
  .catch((error) => {
    console.error('[seed] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
