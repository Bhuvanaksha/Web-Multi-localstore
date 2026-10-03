import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { type Socket as ClientSocket, io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMongo, connectMongo } from '../../src/config/db.js';
import { initSocket } from '../../src/socket/index.js';
import { type Session, registerAndLogin } from '../helpers.js';

let mongod: MongoMemoryServer;
let app: Express;
let httpServer: HttpServer;
let baseUrl: string;

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event);
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('alpha-test');
  await connectMongo(process.env.MONGODB_URI);

  const { createApp } = await import('../../src/app.js');
  app = createApp();

  httpServer = app.listen(0);
  initSocket(httpServer);
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
}, 120_000);

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await closeMongo();
  await mongod.stop();
});

describe('WebSocket realtime (integration)', () => {
  let session: Session;
  let resourceId: string;

  beforeAll(async () => {
    session = await registerAndLogin(app, 'socket@example.com', 'socket_user', undefined, 'member');

    // Publish a resource directly so it can be voted on.
    const created = await request(app)
      .post('/api/v1/resources')
      .set(authHeader(session))
      .send({
        title: 'A realtime voting playground resource',
        content: '<p>Realtime vote updates over websockets.</p>',
        category: 'Engineering',
        tags: ['realtime'],
      });
    resourceId = created.body.resource.id;

    const { ResourceModel } = await import('../../src/models/ResourceModel.js');
    await ResourceModel.updateOne(
      { _id: resourceId },
      { $set: { status: 'published', publishedAt: new Date() } },
    );
  });

  function authHeader(s: Session) {
    return { Authorization: `Bearer ${s.accessToken}` };
  }

  function connect(token: string): ClientSocket {
    return ioClient(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
  }

  it('rejects sockets with an invalid token', async () => {
    const socket = connect('not-a-valid-jwt');
    const err = await waitForEvent<Error>(socket, 'connect_error');
    expect(err.message).toMatch(/invalid token|Authentication error/i);
    socket.close();
  });

  it('authenticates a valid token and receives vote:update broadcasts', async () => {
    const socket = connect(session.accessToken);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connect timeout')), 3000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (e: Error) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    socket.onAny((event, ...args) => {
      // eslint-disable-next-line no-console
      console.log('[cli] received', event, JSON.stringify(args));
    });

    // Register listeners BEFORE triggering so no events are missed.
    const presencePromise = waitForEvent<{ resourceId: string; count: number }>(
      socket,
      'presence:update',
    );
    const votePromise = waitForEvent<{
      targetId: string;
      targetType: string;
      counts: { upvotes: number; score: number };
    }>(socket, 'vote:update');

    // Join the resource room — fires presence:update (count 0 without Redis).
    socket.emit('subscribe:resource', resourceId);
    const presence = await presencePromise;
    expect(presence.resourceId).toBe(resourceId);

    // Trigger a vote over HTTP — the socket should hear vote:update.
    const res = await request(app)
      .post('/api/v1/votes/toggle')
      .set(authHeader(session))
      .send({ targetId: resourceId, targetType: 'Resource', value: 1 });
    expect(res.status).toBe(200);

    const update = await votePromise;
    expect(update.targetId).toBe(resourceId);
    expect(update.counts.score).toBe(1);

    socket.close();
  });

  it('supports the ping keep-alive round trip', async () => {
    const socket = connect(session.accessToken);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });

    const pong = await new Promise<{ pong: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ping timeout')), 2000);
      socket.emit('ping', (data: { pong: number }) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
    expect(typeof pong.pong).toBe('number');

    socket.close();
  });
});
