import { generateKeyPairSync } from 'node:crypto';

// Debian 12+ has no MongoDB binaries < 7.0.3 — pin a compatible version.
process.env.MONGOMS_VERSION = '7.0.14';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

process.env.NODE_ENV = 'test';
process.env.PORT = '5001';
process.env.MONGODB_URI = 'mongodb://localhost:27017/alpha-test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_PRIVATE_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' });
process.env.JWT_ACCESS_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-123456';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
