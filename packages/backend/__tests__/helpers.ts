import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { UserModel } from '../src/models/UserModel.js';

export interface Session {
  accessToken: string;
  refreshCookie: string;
  user: { id: string; email: string; username: string; role: string };
}

/**
 * Registers a fresh user and logs them in, returning token + cookies.
 *
 * When `role` is omitted the account goes through the public register
 * endpoint (role is derived from the email address). When a legacy role like
 * 'member' is needed (e.g. to test the author flow), the user is created
 * directly in the DB with that role and logged in.
 */
export async function registerAndLogin(
  app: Express,
  email: string,
  username: string,
  password = 'supersecure-password-123',
  role?: 'member' | 'moderator' | 'admin',
): Promise<Session> {
  if (role) {
    await UserModel.create({ email, username, password, role });
  } else {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, username, password });
    expect(reg.status).toBe(201);
  }

  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(login.status).toBe(200);

  const setCookie = login.headers['set-cookie'] as unknown as string[];
  const refreshCookie = Array.isArray(setCookie)
    ? setCookie.find((c) => c.startsWith('refreshToken='))
    : undefined;
  expect(refreshCookie, 'refreshToken cookie should be set').toBeTruthy();

  return {
    accessToken: login.body.accessToken as string,
    refreshCookie: refreshCookie as string,
    user: login.body.user as Session['user'],
  };
}

/** Creates a user directly in the DB with the requested role (password hashed by the model). */
export async function createUserWithRole(
  email: string,
  username: string,
  role: 'member' | 'moderator' | 'admin',
  password = 'supersecure-password-123',
) {
  return UserModel.create({ email, username, password, role });
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
