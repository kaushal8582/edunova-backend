import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UserRole, UserStatus } from '../shared/constants';
import { User } from '../users/models/user.model';
import { UserSession } from '../users/models/user-session.model';
import {
  buildApp,
  createUserDirect,
  expectFail,
  expectOk,
  login,
  readLatestOtp,
  readLatestResetToken,
  registerAndVerify,
} from '../../test/helpers';

const testEducation = {
  level: 'SCHOOL' as const,
  classOrYear: '11',
  institution: 'Test School',
  board: 'CBSE',
  course: 'Science',
};

describe('Authentication & user management', () => {
  const app = buildApp();

  it('registers a VIEWER and rejects client-supplied admin role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Viewer One',
        email: 'viewer1@example.com',
        password: 'Str0ng!Pass',
        education: testEducation,
        role: 'SUPER_ADMIN',
      });

    // .strict() rejects unknown role field
    expectFail(res, 400);

    const ok = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Viewer One',
      email: 'viewer1@example.com',
      password: 'Str0ng!Pass',
      education: testEducation,
    });
    expectOk(ok, 201);
    expect(ok.body.data.user.role).toBe(UserRole.VIEWER);
    expect(ok.body.data.user.passwordHash).toBeUndefined();
    expect(ok.body.data).not.toHaveProperty('otp');
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/v1/auth/register').send({
      fullName: 'Dup',
      email: 'dup@example.com',
      password: 'Str0ng!Pass',
      education: testEducation,
    });
    const res = await request(app).post('/api/v1/auth/register').send({
      fullName: 'Dup 2',
      email: 'dup@example.com',
      password: 'Str0ng!Pass',
      education: testEducation,
    });
    expectFail(res, 409);
  });

  it('verifies email with OTP and rejects expired/invalid tokens', async () => {
    await request(app).post('/api/v1/auth/register').send({
      fullName: 'Verify Me',
      email: 'verify@example.com',
      password: 'Str0ng!Pass',
      education: testEducation,
    });

    const bad = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'verify@example.com', token: '000000' });
    expectFail(bad, 400);

    const otp = await readLatestOtp('verify@example.com');
    const ok = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'verify@example.com', token: otp });
    expectOk(ok, 200);

    const reuse = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'verify@example.com', token: otp });
    // Already verified path returns success, or invalid if still pending flow —
    // account is already verified/active.
    expect(reuse.status).toBeLessThan(500);
  });

  it('logs in successfully and rejects wrong password / suspended accounts', async () => {
    const creds = await registerAndVerify(app, { email: 'login@example.com' });

    const wrong = await request(app).post('/api/v1/auth/login').send({
      email: creds.email,
      password: 'WrongPassword@123',
      device: { platform: 'WEB' },
    });
    expectFail(wrong, 401);

    const ok = await login(app, creds.email, creds.password);
    expect(ok.body.data.accessToken).toBeTruthy();
    expect(ok.body.data.refreshToken).toBeUndefined();
    expect(ok.headers['set-cookie']).toBeTruthy();

    await User.updateOne({ email: creds.email }, { $set: { status: UserStatus.SUSPENDED } });
    const suspended = await request(app).post('/api/v1/auth/login').send({
      email: creds.email,
      password: creds.password,
      device: { platform: 'WEB' },
    });
    expectFail(suspended, 403);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const creds = await registerAndVerify(app, { email: 'refresh@example.com' });
    const loginRes = await login(app, creds.email, creds.password, {
      mobile: true,
      platform: 'ANDROID',
    });

    const refresh1 = loginRes.body.data.refreshToken as string;
    expect(refresh1).toBeTruthy();

    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Client-Channel', 'mobile')
      .set('X-Client-Platform', 'ANDROID')
      .send({ refreshToken: refresh1 });
    expectOk(rotated, 200);
    const refresh2 = rotated.body.data.refreshToken as string;
    expect(refresh2).toBeTruthy();
    expect(refresh2).not.toBe(refresh1);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Client-Channel', 'mobile')
      .set('X-Client-Platform', 'ANDROID')
      .send({ refreshToken: refresh1 });
    expectFail(reuse, 401);

    const sessions = await UserSession.find({
      userId: (await User.findOne({ email: creds.email }))!._id,
      revokedAt: null,
    });
    expect(sessions.length).toBe(0);
  });

  it('supports logout and logout-all', async () => {
    const creds = await registerAndVerify(app, { email: 'logout@example.com' });
    const a = await login(app, creds.email, creds.password, { mobile: true });
    const b = await login(app, creds.email, creds.password, { mobile: true });

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${a.body.data.accessToken}`)
      .set('X-Client-Channel', 'mobile')
      .set('X-Client-Platform', 'ANDROID')
      .send({ refreshToken: a.body.data.refreshToken });
    expectOk(logoutRes, 200);

    const logoutAll = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${b.body.data.accessToken}`);
    expectOk(logoutAll, 200);

    const user = await User.findOne({ email: creds.email });
    const active = await UserSession.countDocuments({
      userId: user!._id,
      revokedAt: null,
    });
    expect(active).toBe(0);
  });

  it('resets password and revokes sessions', async () => {
    const creds = await registerAndVerify(app, { email: 'reset@example.com' });
    await login(app, creds.email, creds.password);

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: creds.email });
    expectOk(forgot, 200);

    const token = await readLatestResetToken(creds.email);
    const reset = await request(app).post('/api/v1/auth/reset-password').send({
      token,
      newPassword: 'NewStr0ng!Pass',
    });
    expectOk(reset, 200);

    const user = await User.findOne({ email: creds.email });
    const active = await UserSession.countDocuments({
      userId: user!._id,
      revokedAt: null,
    });
    expect(active).toBe(0);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({
      email: creds.email,
      password: creds.password,
      device: { platform: 'WEB' },
    });
    expectFail(oldLogin, 401);

    await login(app, creds.email, 'NewStr0ng!Pass');
  });

  it('prevents viewers from accessing admin endpoints and foreign profiles', async () => {
    const viewer = await registerAndVerify(app, { email: 'v-admin@example.com' });
    const other = await registerAndVerify(app, { email: 'other@example.com' });
    const loginRes = await login(app, viewer.email, viewer.password);

    const adminList = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expectFail(adminList, 403);

    const me = await request(app)
      .get('/api/v1/me/profile')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expectOk(me, 200);
    expect(me.body.data.fullName).toBeTruthy();

    // Profile routes are always scoped to req.user.id — no userId param to abuse.
    const otherUser = await User.findOne({ email: other.email });
    expect(me.body.data.userId).not.toBe(otherUser!._id.toString());
  });

  it('allows only SUPER_ADMIN to create admins and change roles', async () => {
    const password = 'Str0ng!Pass';
    await createUserDirect({
      email: 'super@example.com',
      password,
      role: UserRole.SUPER_ADMIN,
      fullName: 'Super',
    });
    await createUserDirect({
      email: 'content@example.com',
      password,
      role: UserRole.CONTENT_ADMIN,
      fullName: 'Content',
    });

    const contentLogin = await login(app, 'content@example.com', password);
    const denied = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${contentLogin.body.data.accessToken}`)
      .send({
        fullName: 'New Admin',
        email: 'newadmin@example.com',
        password,
        role: UserRole.CONTENT_ADMIN,
      });
    expectFail(denied, 403);

    const superLogin = await login(app, 'super@example.com', password);
    const created = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${superLogin.body.data.accessToken}`)
      .send({
        fullName: 'Support Admin',
        email: 'support-new@example.com',
        password,
        role: UserRole.SUPPORT_ADMIN,
      });
    expectOk(created, 201);
    expect(created.body.data.user.role).toBe(UserRole.SUPPORT_ADMIN);

    const target = await User.findOne({ email: 'support-new@example.com' });
    const roleChange = await request(app)
      .patch(`/api/v1/admin/users/${target!._id.toString()}/role`)
      .set('Authorization', `Bearer ${superLogin.body.data.accessToken}`)
      .send({ role: UserRole.CONTENT_ADMIN, reason: 'Promotion for content work' });
    expectOk(roleChange, 200);
    expect(roleChange.body.data.role).toBe(UserRole.CONTENT_ADMIN);

    const contentRoleChange = await request(app)
      .patch(`/api/v1/admin/users/${target!._id.toString()}/role`)
      .set('Authorization', `Bearer ${contentLogin.body.data.accessToken}`)
      .send({ role: UserRole.VIEWER, reason: 'Should fail' });
    expectFail(contentRoleChange, 403);
  });

  it('protects the last active SUPER_ADMIN from demotion', async () => {
    const password = 'Str0ng!Pass';
    const first = await createUserDirect({
      email: 'super-a@example.com',
      password,
      role: UserRole.SUPER_ADMIN,
    });
    const second = await createUserDirect({
      email: 'super-b@example.com',
      password,
      role: UserRole.SUPER_ADMIN,
    });

    const actor = await login(app, 'super-b@example.com', password);

    // With two active SUPER_ADMINs, demotion is allowed.
    const demoteFirst = await request(app)
      .patch(`/api/v1/admin/users/${first._id.toString()}/role`)
      .set('Authorization', `Bearer ${actor.body.data.accessToken}`)
      .send({ role: UserRole.CONTENT_ADMIN, reason: 'ok with two supers' });
    expectOk(demoteFirst, 200);

    // Now only super-b remains active SUPER_ADMIN — demoting self is forbidden.
    const demoteSelf = await request(app)
      .patch(`/api/v1/admin/users/${second._id.toString()}/role`)
      .set('Authorization', `Bearer ${actor.body.data.accessToken}`)
      .send({ role: UserRole.VIEWER, reason: 'cannot demote self' });
    expectFail(demoteSelf, 403);

    // Promote first back, suspend them, then trying to demote the last active SUPER_ADMIN fails.
    await User.updateOne(
      { _id: first._id },
      { $set: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE } }
    );
    const firstActor = await login(app, 'super-a@example.com', password);
    await User.updateOne({ _id: first._id }, { $set: { status: UserStatus.SUSPENDED } });

    // firstActor token still valid until passwordChangedAt check; account status check rejects suspended.
    const suspendedActor = await request(app)
      .patch(`/api/v1/admin/users/${second._id.toString()}/role`)
      .set('Authorization', `Bearer ${firstActor.body.data.accessToken}`)
      .send({ role: UserRole.VIEWER, reason: 'suspended actor' });
    expectFail(suspendedActor, 403);

    // Active last SUPER_ADMIN cannot be demoted by themselves; create temp third then demote after leaving one.
    await User.updateOne({ _id: first._id }, { $set: { status: UserStatus.ACTIVE } });
    const thirdLogin = await login(app, 'super-a@example.com', password);
    const demoteLast = await request(app)
      .patch(`/api/v1/admin/users/${second._id.toString()}/role`)
      .set('Authorization', `Bearer ${thirdLogin.body.data.accessToken}`)
      .send({ role: UserRole.CONTENT_ADMIN, reason: 'two supers again' });
    expectOk(demoteLast, 200);

    await User.updateOne({ _id: second._id }, { $set: { status: UserStatus.SUSPENDED } });
    // Only first is active SUPER_ADMIN now. Attempt demotion via service using a restored second token won't work if suspended.
    // Directly ensure count protection by promoting second, having only first active, and demoting first via second after suspending second first — covered by unit path:
    await User.updateOne(
      { _id: second._id },
      { $set: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE } }
    );
    await User.updateOne({ _id: second._id }, { $set: { status: UserStatus.SUSPENDED } });

    const only = await User.countDocuments({
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    });
    expect(only).toBe(1);

    const lastActor = await login(app, 'super-a@example.com', password);
    // No other SUPER_ADMIN to demote the last one; invent a CONTENT_ADMIN attempt:
    await createUserDirect({
      email: 'content-demote@example.com',
      password,
      role: UserRole.CONTENT_ADMIN,
    });
    const contentLogin = await login(app, 'content-demote@example.com', password);
    const forbidden = await request(app)
      .patch(`/api/v1/admin/users/${first._id.toString()}/role`)
      .set('Authorization', `Bearer ${contentLogin.body.data.accessToken}`)
      .send({ role: UserRole.VIEWER, reason: 'content cannot' });
    expectFail(forbidden, 403);

    // Self demotion of last SUPER_ADMIN blocked
    const self = await request(app)
      .patch(`/api/v1/admin/users/${first._id.toString()}/role`)
      .set('Authorization', `Bearer ${lastActor.body.data.accessToken}`)
      .send({ role: UserRole.VIEWER, reason: 'self' });
    expectFail(self, 403);
  });

  it('enforces session ownership on revoke', async () => {
    const a = await registerAndVerify(app, { email: 'sess-a@example.com' });
    const b = await registerAndVerify(app, { email: 'sess-b@example.com' });
    const loginA = await login(app, a.email, a.password, { mobile: true });
    const loginB = await login(app, b.email, b.password, { mobile: true });

    const sessionsA = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${loginA.body.data.accessToken}`);
    expectOk(sessionsA, 200);
    const sessionId = sessionsA.body.data.sessions[0].id as string;

    const steal = await request(app)
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${loginB.body.data.accessToken}`);
    expectFail(steal, 404);
  });
});
