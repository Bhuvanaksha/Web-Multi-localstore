import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '../config/env.js';
import { redisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

let io: SocketIOServer | null = null;

const presenceKey = (resourceId: string) => `presence:resource:${resourceId}`;

/**
 * Emits the current presence count for a resource room. Never blocks on
 * Redis: when Redis is unavailable the count degrades to 0 immediately.
 */
function emitPresence(resourceId: string): void {
  if (!io) return;
  const room = `resource:${resourceId}`;
  const broadcast = (count: number) => io?.to(room).emit('presence:update', { resourceId, count });

  if (redisClient.status !== 'ready') {
    broadcast(0);
    return;
  }
  redisClient
    .scard(presenceKey(resourceId))
    .then(broadcast)
    .catch(() => broadcast(0));
}

/** Adds/removes a user from the presence set without blocking the socket. */
function updatePresence(resourceId: string, userId: string, op: 'add' | 'remove'): void {
  if (redisClient.status !== 'ready') {
    // Degrade gracefully: broadcast a 0 count so subscribers still get the event.
    emitPresence(resourceId);
    return;
  }
  const command =
    op === 'add' ? redisClient.sadd.bind(redisClient) : redisClient.srem.bind(redisClient);
  command(presenceKey(resourceId), userId)
    .then(() => emitPresence(resourceId))
    .catch(() => emitPresence(resourceId));
}

/**
 * Emits a socket event to a room. No-ops gracefully when socket.io has not
 * been initialized (e.g. during tests) or the event name is reserved.
 */
export function emitToRoom(room: string, event: string, payload: unknown): void {
  if (!io) return;
  if (event === 'subscribe:resource' || event === 'unsubscribe:resource') return;
  io.to(room).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  // Authenticate every socket with the same JWT used for REST.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication error: missing token'));
    try {
      const payload = jwt.verify(token, config.accessTokenPublicKey, {
        algorithms: ['RS256'],
      }) as { userId: string; role: string };
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      socket.data.resourceRooms = new Set<string>();
      next();
    } catch {
      next(new Error('Authentication error: invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    const resourceRooms = socket.data.resourceRooms as Set<string>;
    void socket.join(`user:${userId}`);
    logger.debug('socket connected', { userId });

    socket.on('subscribe:resource', async (resourceId: string) => {
      // eslint-disable-next-line no-console
      console.log('[srv] subscribe:resource', resourceId, 'from', userId);
      if (typeof resourceId !== 'string') return;
      await socket.join(`resource:${resourceId}`);
      resourceRooms.add(resourceId);
      updatePresence(resourceId, userId, 'add');
    });

    socket.on('unsubscribe:resource', async (resourceId: string) => {
      if (typeof resourceId !== 'string') return;
      await socket.leave(`resource:${resourceId}`);
      resourceRooms.delete(resourceId);
      updatePresence(resourceId, userId, 'remove');
    });

    // Keep-alive: client sends { cb } and receives { pong }.
    socket.on('ping', (cb: unknown) => {
      if (typeof cb === 'function') cb({ pong: Date.now() });
    });

    socket.on('disconnect', () => {
      for (const resourceId of resourceRooms) {
        updatePresence(resourceId, userId, 'remove');
      }
      resourceRooms.clear();
      logger.debug('socket disconnected', { userId });
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}
