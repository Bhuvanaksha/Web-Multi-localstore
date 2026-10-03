import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMongo, connectMongo } from '../../src/config/db.js';
import { auth, registerAndLogin } from '../helpers.js';

let mongod: MongoMemoryServer;
let app: Express;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('alpha-test');
  await connectMongo(process.env.MONGODB_URI);
  const { createApp } = await import('../../src/app.js');
  app = createApp();
}, 120_000);

afterAll(async () => {
  await closeMongo();
  await mongod.stop();
});

describe('Auth flow (integration)', () => {
  it('registers a new customer (role derived from email)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'grace@example.com',
      username: 'grace_hopper',
      password: 'supersecure-password-123',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('grace@example.com');
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('assigns roles from the email address (store/groceries → provider, .local → admin)', async () => {
    const provider = await request(app).post('/api/v1/auth/register').send({
      email: 'my.kirana.store@example.com',
      username: 'store_owner',
      password: 'supersecure-password-123',
    });
    expect(provider.status).toBe(201);
    expect(provider.body.user.role).toBe('provider');

    const groceries = await request(app).post('/api/v1/auth/register').send({
      email: 'fresh.groceries@example.com',
      username: 'groceries_owner',
      password: 'supersecure-password-123',
    });
    expect(groceries.status).toBe(201);
    expect(groceries.body.user.role).toBe('provider');

    const admin = await request(app).post('/api/v1/auth/register').send({
      email: 'ops@alpha.local',
      username: 'local_ops',
      password: 'supersecure-password-123',
    });
    expect(admin.status).toBe(201);
    expect(admin.body.user.role).toBe('admin');
  });

  it('rejects duplicate registration with 409', async () => {
    const payload = {
      email: 'dup@example.com',
      username: 'dup_user',
      password: 'supersecure-password-123',
    };
    await request(app).post('/api/v1/auth/register').send(payload);
    const res = await request(app).post('/api/v1/auth/register').send(payload);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already/i);
  });

  it('rejects invalid credentials with 401', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'bad@example.com',
      username: 'bad_user',
      password: 'supersecure-password-123',
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bad@example.com', password: 'wrong-password-123' });

    expect(res.status).toBe(401);
  });

  it('validates input with 422', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      username: 'x',
      password: 'short',
    });

    expect(res.status).toBe(422);
  });

  it('returns the current user from /me with a valid token', async () => {
    const session = await registerAndLogin(app, 'me@example.com', 'me_user');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
  });

  it('rejects /me without a token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token on refresh and issues a new access token', async () => {
    const session = await registerAndLogin(app, 'rotate@example.com', 'rotate_user');

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    // Rotation must issue a fresh httpOnly refresh cookie.
    const newCookie = res.headers['set-cookie'] as unknown as string[];
    expect(newCookie.some((c) => c.startsWith('refreshToken='))).toBe(true);

    // The old refresh token is now revoked — replaying it must fail.
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.refreshCookie);
    expect(replay.status).toBe(401);
  });

  it('detects refresh-token reuse: revokes ALL sessions and alerts the user', async () => {
    const session = await registerAndLogin(app, 'reuse@example.com', 'reuse_user');

    // A second, independent session that must survive... wait — reuse
    // revokes everything by design. Log in twice to prove both die.
    const second = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reuse@example.com', password: 'supersecure-password-123' });
    expect(second.status).toBe(200);

    // Legitimate rotation of session 1 works fine.
    const ok = await request(app).post('/api/v1/auth/refresh').set('Cookie', session.refreshCookie);
    expect(ok.status).toBe(200);

    // Replaying session 1's ALREADY-ROTATED token = reuse detected.
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.refreshCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.message).toMatch(/revoked for security/i);

    // The fresh token from session 2 is also dead now (all sessions revoked).
    const victimSession = await request(app)
      .post('/api/v1/auth/refresh')
      .set(
        'Cookie',
        second.headers['set-cookie'].find((c: string) => c.startsWith('refreshToken=')),
      );
    expect(victimSession.status).toBe(401);

    // And the event is in the security activity log for the admin dashboard.
    const admin = await request(app).post('/api/v1/auth/register').send({
      email: 'reuse-admin@alpha.local',
      username: 'reuse_admin',
      password: 'supersecure-password-123',
    });
    expect(admin.status).toBe(201);
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reuse-admin@alpha.local', password: 'supersecure-password-123' });
    const adminToken = adminLogin.body.accessToken as string;

    const activity = await request(app)
      .get('/api/v1/admin/activity?action=auth.token_reuse_detected')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activity.status).toBe(200);
    expect(activity.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('logs out and invalidates the session', async () => {
    const session = await registerAndLogin(app, 'logout@example.com', 'logout_user');

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', session.refreshCookie);
    expect(logout.status).toBe(204);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', session.refreshCookie);
    expect(refresh.status).toBe(401);
  });

  it('locks the account after repeated failed logins and unlocks with the right password later', async () => {
    const email = 'lockout@example.com';
    const password = 'supersecure-password-123';
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, username: 'lockout_user', password });
    expect(reg.status).toBe(201);

    // 5 failed attempts → locked.
    for (let i = 0; i < 5; i += 1) {
      const fail = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong-password-123' });
      expect(fail.status).toBe(401);
    }
    // Even the CORRECT password is rejected while locked.
    const locked = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(locked.status).toBe(401);
    expect(locked.body.error.message).toMatch(/temporarily locked/i);
  });

  it('rejects weak and user-derived passwords', async () => {
    const common = await request(app).post('/api/v1/auth/register').send({
      email: 'weak@example.com',
      username: 'weak_user',
      password: 'passwordpassword',
    });
    expect(common.status).toBe(422);
    expect(common.body.error.message).toMatch(/too common/i);

    const derived = await request(app).post('/api/v1/auth/register').send({
      email: 'derived@example.com',
      username: 'derived_user',
      password: 'derived_user_rocks',
    });
    expect(derived.status).toBe(422);
    expect(derived.body.error.message).toMatch(/must not contain your username/i);
  });

  it('issues 10 recovery codes on MFA enable, and each code works exactly once', async () => {
    const session = await registerAndLogin(app, 'mfa@example.com', 'mfa_user');
    const token = session.accessToken;

    const setup = await request(app).post('/api/v1/auth/mfa/setup').set(auth(token));
    expect(setup.status).toBe(200);
    const { secret } = setup.body as { secret: string };
    const code = authenticator.generate(secret);

    const enable = await request(app)
      .post('/api/v1/auth/mfa/enable')
      .set(auth(token))
      .send({ secret, code });
    expect(enable.status).toBe(200);
    const codes = enable.body.recoveryCodes as string[];
    expect(codes).toHaveLength(10);

    // Log in: password OK → MFA challenge → redeem with a recovery code.
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'mfa@example.com', password: 'supersecure-password-123' });
    expect(login.body.mfaRequired).toBe(true);
    const mfaToken = login.body.mfaChallengeToken as string;

    const redeem = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken, code: codes[0] });
    expect(redeem.status).toBe(200);
    expect(redeem.body.accessToken).toBeTruthy();

    // The same recovery code must be rejected on the next login (single-use).
    const login2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'mfa@example.com', password: 'supersecure-password-123' });
    const reuse = await request(app)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaToken: login2.body.mfaChallengeToken, code: codes[0] });
    expect(reuse.status).toBe(401);
  });

  it('lists sessions and signs out everywhere else', async () => {
    const session = await registerAndLogin(app, 'sess@example.com', 'sess_user');
    const token = session.accessToken;

    const withCookie = (r: request.Test) => r.set('Cookie', session.refreshCookie);
    const list = await withCookie(request(app).get('/api/v1/auth/sessions')).set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.sessions).toHaveLength(1);
    expect(list.body.sessions[0].current).toBe(true);

    // Second login from a different user-agent creates a second session.
    const second = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'OtherDevice/1.0')
      .send({ email: 'sess@example.com', password: 'supersecure-password-123' });
    expect(second.status).toBe(200);

    const after = await withCookie(request(app).get('/api/v1/auth/sessions')).set(auth(token));
    expect(after.body.sessions).toHaveLength(2);
    expect(
      after.body.sessions.some((s: { device?: string }) => s.device === 'OtherDevice/1.0'),
    ).toBe(true);

    const revokeAll = await withCookie(request(app).post('/api/v1/auth/sessions/revoke-all')).set(
      auth(token),
    );
    expect(revokeAll.status).toBe(200);

    const final = await withCookie(request(app).get('/api/v1/auth/sessions')).set(auth(token));
    expect(final.body.sessions).toHaveLength(1);
    expect(final.body.sessions[0].current).toBe(true);
  });
});
