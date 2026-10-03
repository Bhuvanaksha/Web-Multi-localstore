import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load env from the repo root (.env is canonical there) while still
// honoring a package-local packages/backend/.env if one exists.
dotenv.config(); // cwd (packages/backend) — wins on conflicts
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }); // repo root

/**
 * Loads a PEM-encoded key from a value that is either:
 *   1. a raw PEM string ("-----BEGIN ...")
 *   2. a path to a PEM file
 *   3. a base64-encoded PEM
 */
function loadPem(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.includes('-----BEGIN')) return trimmed;
  try {
    if (fs.existsSync(trimmed)) return fs.readFileSync(trimmed, 'utf8');
  } catch {
    /* fall through to base64 */
  }
  // base64-decoded PEM
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) return decoded;
  } catch {
    /* not base64 */
  }
  return trimmed;
}

const isProduction = process.env.NODE_ENV === 'production';

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5347),
    API_PREFIX: z.string().default('/api/v1'),
    MONGODB_URI: z
      .string({ required_error: 'MONGODB_URI is required' })
      .min(1, 'MONGODB_URI is required')
      .refine(
        (v) => v.startsWith('mongodb'),
        'MONGODB_URI must be a mongodb:// or mongodb+srv:// URL',
      ),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_ACCESS_PRIVATE_KEY: z
      .string({ required_error: 'JWT_ACCESS_PRIVATE_KEY is required' })
      .min(1),
    JWT_ACCESS_PUBLIC_KEY: z.string({ required_error: 'JWT_ACCESS_PUBLIC_KEY is required' }).min(1),
    JWT_REFRESH_SECRET: z
      .string({ required_error: 'JWT_REFRESH_SECRET is required' })
      .min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    FRONTEND_ORIGIN: z.string({ required_error: 'FRONTEND_ORIGIN is required' }).transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('noreply@alpha.local'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // In production, critical integrations must be present.
    if (isProduction) {
      if (!data.S3_BUCKET || !data.S3_ACCESS_KEY_ID || !data.S3_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3'],
          message:
            'S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required in production',
        });
      }
      if (!data.SMTP_HOST || !data.SMTP_USER || !data.SMTP_PASS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SMTP'],
          message: 'SMTP_HOST, SMTP_USER and SMTP_PASS are required in production',
        });
      }
    }
  });

const result = ConfigSchema.safeParse(process.env);

if (!result.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of result.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = result.data;

export const config = {
  ...raw,
  accessTokenPrivateKey: loadPem(raw.JWT_ACCESS_PRIVATE_KEY) as string,
  accessTokenPublicKey: loadPem(raw.JWT_ACCESS_PUBLIC_KEY) as string,
  corsOrigins: raw.FRONTEND_ORIGIN,
  isProduction,
} as const;

export type Config = typeof config;
