import cors from 'cors';
import { config } from '../config/env.js';

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow non-browser clients (curl, supertest) that send no Origin header.
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-XSRF-TOKEN', 'X-Requested-With'],
  maxAge: 86400,
});
