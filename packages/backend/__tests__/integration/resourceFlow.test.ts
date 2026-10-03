import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMongo, connectMongo } from '../../src/config/db.js';
import { type Session, auth, createUserWithRole, registerAndLogin } from '../helpers.js';

let mongod: MongoMemoryServer;
let app: Express;
let author: Session;
let admin: Session;

const validResource = {
  title: 'A comprehensive guide to modern MERN architecture',
  content: '<p>This article explains the full architecture in detail with examples.</p>',
  excerpt: 'Learn MERN architecture.',
  category: 'Engineering',
  tags: ['mern', 'architecture'],
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('alpha-test');
  await connectMongo(process.env.MONGODB_URI);
  const { createApp } = await import('../../src/app.js');
  app = createApp();

  // Legacy author role — community posts are published by member accounts.
  author = await registerAndLogin(app, 'author@example.com', 'the_author', undefined, 'member');
  await createUserWithRole('admin@example.com', 'the_admin', 'admin');
  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@example.com', password: 'supersecure-password-123' });
  admin = {
    accessToken: adminLogin.body.accessToken,
    refreshCookie: '',
    user: adminLogin.body.user,
  };
}, 120_000);

afterAll(async () => {
  await closeMongo();
  await mongod.stop();
});

describe('Resource lifecycle (integration)', () => {
  it('creates a draft resource', async () => {
    const res = await request(app)
      .post('/api/v1/resources')
      .set(auth(author.accessToken))
      .send(validResource);

    expect(res.status).toBe(201);
    expect(res.body.resource.status).toBe('draft');
    expect(res.body.resource.slug).toMatch(/^a-comprehensive-guide/);
  });

  it('requires authentication to create', async () => {
    const res = await request(app).post('/api/v1/resources').send(validResource);
    expect(res.status).toBe(401);
  });

  it('enforces the FSM: draft -> pending_review -> pending_review is a 409', async () => {
    const created = await request(app)
      .post('/api/v1/resources')
      .set(auth(author.accessToken))
      .send(validResource);
    const id = created.body.resource.id;

    const submit = await request(app)
      .post(`/api/v1/resources/${id}/submit`)
      .set(auth(author.accessToken));
    expect(submit.status).toBe(200);
    expect(submit.body.resource.status).toBe('pending_review');

    // Submitting again is an illegal transition.
    const again = await request(app)
      .post(`/api/v1/resources/${id}/submit`)
      .set(auth(author.accessToken));
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/Invalid transition/);
  });

  it('only moderators/admins can approve (403 for members)', async () => {
    const created = await request(app)
      .post('/api/v1/resources')
      .set(auth(author.accessToken))
      .send(validResource);
    const id = created.body.resource.id;

    const res = await request(app)
      .post(`/api/v1/resources/${id}/approve`)
      .set(auth(author.accessToken));
    expect(res.status).toBe(403);
  });

  it('admin approval publishes the resource and it appears in the feed', async () => {
    const created = await request(app)
      .post('/api/v1/resources')
      .set(auth(author.accessToken))
      .send(validResource);
    const id = created.body.resource.id;
    await request(app).post(`/api/v1/resources/${id}/submit`).set(auth(author.accessToken));

    const approve = await request(app)
      .post(`/api/v1/resources/${id}/approve`)
      .set(auth(admin.accessToken));
    expect(approve.status).toBe(200);
    expect(approve.body.resource.status).toBe('published');
    expect(approve.body.resource.publishedAt).toBeTruthy();

    const feed = await request(app).get('/api/v1/resources').query({ category: 'Engineering' });
    expect(feed.status).toBe(200);
    expect(feed.body.total).toBeGreaterThanOrEqual(1);
    expect(feed.body.items.map((r: { id: string }) => r.id)).toContain(id);
  });

  it('soft-deletes a resource so it disappears from the feed', async () => {
    const created = await request(app)
      .post('/api/v1/resources')
      .set(auth(author.accessToken))
      .send(validResource);
    const id = created.body.resource.id;
    await request(app).post(`/api/v1/resources/${id}/submit`).set(auth(author.accessToken));
    await request(app).post(`/api/v1/resources/${id}/approve`).set(auth(admin.accessToken));

    const del = await request(app).delete(`/api/v1/resources/${id}`).set(auth(author.accessToken));
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const feed = await request(app).get('/api/v1/resources');
    expect(feed.body.items.map((r: { id: string }) => r.id)).not.toContain(id);
  });

  it('search falls back to $regex and finds published content', async () => {
    const created = await request(app)
      .post('/api/v1/resources')
      .set(auth(author.accessToken))
      .send({
        title: 'The definitive guide to MongoDB indexing strategies',
        content: '<p>Deep dive into indexes, compound keys and covered queries.</p>',
        category: 'Database',
        tags: ['mongodb'],
      });
    const id = created.body.resource.id;

    // Publish it through the FSM
    await request(app).post(`/api/v1/resources/${id}/submit`).set(auth(author.accessToken));
    await request(app).post(`/api/v1/resources/${id}/approve`).set(auth(admin.accessToken));

    const res = await request(app).get('/api/v1/search').query({ q: 'indexing' });
    expect(res.status).toBe(200);
    expect(res.body.engine).toBe('regex'); // Atlas unavailable on local test Mongo
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });
});
