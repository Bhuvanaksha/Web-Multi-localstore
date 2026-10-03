import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config/env.js';

const { combine, timestamp, colorize, simple, json, errors } = winston.format;

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|authorization|x-xsrf|refreshToken|accessToken|mfa|api[_-]?key|cookie/i;

/**
 * Recursively replaces the values of sensitive-looking keys with a marker so
 * passwords, tokens and secrets never reach the logs.
 */
function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === 'string') {
    // Scrub tokens embedded in URLs (e.g. reset/verify links in mail bodies).
    return value.replace(/([?&](?:token|code|key)=)[^\s&]+/gi, '$1[REDACTED]');
  }
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEY_PATTERN.test(k) ? '[REDACTED]' : redactDeep(v, depth + 1),
      ]),
    );
  }
  return value;
}

const redact = winston.format((info) => {
  // Redact message text for URLs containing tokens too.
  if (typeof info.message === 'string') {
    info.message = info.message.replace(/([?&](?:token|code|key)=)[^\s&]+/gi, '$1[REDACTED]');
  }
  for (const [key, value] of Object.entries(info)) {
    if (key === 'message' || key === 'level' || key === 'timestamp' || key === 'stack') continue;
    (info as Record<string, unknown>)[key] = redactDeep(value);
  }
  return info;
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    level: config.isProduction ? 'info' : 'debug',
    format: config.isProduction
      ? combine(redact(), timestamp(), json())
      : combine(redact(), errors({ stack: true }), timestamp(), colorize(), simple()),
  }),
];

if (config.isProduction) {
  transports.push(
    new DailyRotateFile({
      level: 'info',
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
      format: combine(redact(), timestamp(), json()),
    }),
  );
}

export const logger = winston.createLogger({
  level: config.isProduction ? 'info' : 'debug',
  transports,
  exitOnError: false,
});

/**
 * Attach request-scoped context (requestId, userId) to every log line.
 * Example: logger.child({ requestId: req.id, userId: req.user?.id })
 */
export function createRequestLogger(meta: Record<string, unknown>) {
  return logger.child(meta);
}

export type Logger = winston.Logger;
