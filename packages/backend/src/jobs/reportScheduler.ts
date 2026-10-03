import cron from 'node-cron';
import { reportConfig } from '../config/reportConfig.js';
import { generateReport } from '../services/reportService.js';
import { logger } from '../utils/logger.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs the report job with up to `maxRetries` attempts. */
export async function runReportJob(): Promise<string | null> {
  for (let attempt = 1; attempt <= reportConfig.maxRetries; attempt += 1) {
    try {
      const file = await generateReport();
      if (file) return file;
      throw new Error('generateReport returned null');
    } catch (err) {
      logger.warn(`report job attempt ${attempt}/${reportConfig.maxRetries} failed`, {
        error: (err as Error).message,
      });
      if (attempt < reportConfig.maxRetries) await sleep(5_000 * attempt);
    }
  }
  logger.error('report job gave up after retries');
  return null;
}

let started = false;

/**
 * Starts the hourly report scheduler. Safe to call multiple times (idempotent)
 * and disabled in test environments (tests run the job manually).
 */
export function startReportScheduler(): void {
  if (started) return;
  const env = (process.env.NODE_ENV ??
    'development') as (typeof reportConfig.enabledEnvironments)[number];
  if (!reportConfig.enabledEnvironments.includes(env)) return;

  // Every hour, generate the report and log the outcome.
  cron.schedule(reportConfig.schedule, () => {
    void runReportJob().then((file) => {
      if (file) logger.info('scheduled report complete', { file });
    });
  });
  logger.info('report scheduler started', { schedule: reportConfig.schedule });
  started = true;
}
