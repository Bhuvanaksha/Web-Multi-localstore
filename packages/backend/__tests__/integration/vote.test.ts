import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMongo, connectMongo } from '../../src/config/db.js';
import { ResourceModel } from '../../src/models/ResourceModel.js';
import { type Session, auth, registerAndLogin } from '../helpers.js';

let mongod: MongoMemoryServer;
let app: Express;
let session: Session;
let resourceId: string;

async function publishResource(id: string) {
  await ResourceModel.updateOne(
    { _id: id },
    { $set: { status: 'published', publishedAt: new Date() } },
  );
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('alpha-test');
  await connectMongo(process.env.MONGODB_URI);
  const { createApp } = await import('../../src/app.js');
  app = createApp();

  session = await registerAndLogin(app, 'voter@example.com', 'the_voter', undefined, 'member');

  const created = await request(app)
    .post('/api/v1/resources')
    .set(auth(session.accessToken))
    .send({
      title: 'An article worth upvoting today',
      content: '<p>Content with substance and meaning.</p>',
      category: 'Community',
      tags: ['voting'],
    });
  resourceId = created.body.resource.id;
  await publishResource(resourceId);
}, 120_000);

afterAll(async () => {
  await closeMongo();
  await mongod.stop();
});

describe('Votes (integration)', () => {
  it('upvotes increment the count', async () => {
    const res = await request(app)
      .post('/api/v1/votes/toggle')
      .set(auth(session.accessToken))
      .send({ targetId: resourceId, targetType: 'Resource', value: 1 });

    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ upvotes: 1, downvotes: 0, score: 1 });
  });

  it('voting the same value again toggles the vote off (idempotent)', async () => {
    const res = await request(app)
      .post('/api/v1/votes/toggle')
      .set(auth(session.accessToken))
      .send({ targetId: resourceId, targetType: 'Resource', value: 1 });

    expect(res.status).toBe(200);
    expect(res.body.counts.score).toBe(0);
    expect(res.body.counts.upvotes).toBe(0);
  });

  it('downvotes produce a negative score and sync the resource upvoteCount', async () => {
    await request(app)
      .post('/api/v1/votes/toggle')
      .set(auth(session.accessToken))
      .send({ targetId: resourceId, targetType: 'Resource', value: -1 });

    const detail = await request(app).get(`/api/v1/resources/${resourceId}`);
    expect(detail.body.resource.upvoteCount).toBe(-1);
  });
});

describe('Comments (integration)', () => {
  it('builds a nested tree with correct depths and paths', async () => {
    const root = await request(app)
      .post('/api/v1/comments')
      .set(auth(session.accessToken))
      .send({ resourceId, parentId: null, content: 'Root comment' });
    expect(root.status).toBe(201);
    expect(root.body.comment.depth).toBe(0);

    const reply = await request(app)
      .post('/api/v1/comments')
      .set(auth(session.accessToken))
      .send({ resourceId, parentId: root.body.comment.id, content: 'A reply' });
    expect(reply.status).toBe(201);
    expect(reply.body.comment.depth).toBe(1);
    expect(reply.body.comment.path.startsWith(root.body.comment.path)).toBe(true);

    const tree = await request(app).get(`/api/v1/resources/${resourceId}/comments`);
    expect(tree.status).toBe(200);
    expect(tree.body.comments).toHaveLength(1);
    expect(tree.body.comments[0].children).toHaveLength(1);
  });

  it('rejects comments on a missing resource with 404', async () => {
    const res = await request(app)
      .post('/api/v1/comments')
      .set(auth(session.accessToken))
      .send({ resourceId: '000000000000000000000000', parentId: null, content: 'orphan' });
    expect(res.status).toBe(404);
  });
});
