import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { config } from './env.js';

let listenersAttached = false;

/**
 * Connects to MongoDB with retries. Atlas DNS (queryTxt) can fail transiently
 * on some networks — retrying with backoff rides through that instead of
 * crashing the API on the first attempt.
 */
export async function connectMongo(
  uri = config.MONGODB_URI,
  retries = 5,
): Promise<typeof mongoose> {
  if (!listenersAttached) {
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected');
    });
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', { error: err.message });
    });
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    listenersAttached = true;
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 15_000,
      });
      return mongoose;
    } catch (err) {
      if (attempt > retries) throw err;
      logger.warn(`MongoDB connect attempt ${attempt} failed — retrying`, {
        error: (err as Error).message,
      });
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}

export async function closeMongo(): Promise<void> {
  await mongoose.connection.close();
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
