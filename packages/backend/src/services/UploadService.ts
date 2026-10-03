import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';
import { AppError, ValidationError } from '../utils/errors.js';

function getS3Client(): S3Client {
  if (!config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
    throw new AppError('S3 is not configured (S3_BUCKET / keys missing)', 503);
  }
  const options: S3ClientConfig = {
    region: config.S3_REGION,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  };
  return new S3Client(options);
}

/** Image MIME types and file extensions allowed for uploads. */
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

/** Rejects non-image uploads before a presigned URL is ever issued. */
function assertSafeUpload(filename: string, contentType: string): void {
  if (filename.length === 0 || filename.length > 255) {
    throw new ValidationError('Filename must be between 1 and 255 characters');
  }
  const type = contentType.toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    throw new ValidationError('Only image uploads are allowed (JPEG/PNG/WebP/GIF/AVIF)');
  }
  const ext = extname(filename).toLowerCase();
  if (!ext || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new ValidationError('File extension must match a supported image type');
  }
}

export const UploadService = {
  /**
   * Returns a short-lived presigned PUT URL so the browser can upload
   * directly to S3 without the key ever reaching the client.
   */
  async getPresignedUploadUrl(
    filename: string,
    contentType = 'image/jpeg',
  ): Promise<{ url: string; key: string; fields: Record<string, string> }> {
    // Validate input before touching any infrastructure.
    assertSafeUpload(filename, contentType);
    const client = getS3Client();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
    const key = `uploads/${Date.now()}-${randomUUID()}${extname(safeName)}`;

    const command = new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 300 });
    return { url, key, fields: { 'Content-Type': contentType } };
  },
};
