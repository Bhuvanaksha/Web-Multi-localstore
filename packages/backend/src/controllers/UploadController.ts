import type { NextFunction, Request, Response } from 'express';
import { UploadService } from '../services/UploadService.js';
import { ValidationError } from '../utils/errors.js';

export const UploadController = {
  async presign(req: Request, res: Response, next: NextFunction) {
    try {
      const filename = typeof req.query.filename === 'string' ? req.query.filename : '';
      const contentType =
        typeof req.query.contentType === 'string' ? req.query.contentType : 'image/jpeg';
      if (!filename) throw new ValidationError('filename query param is required');

      const result = await UploadService.getPresignedUploadUrl(filename, contentType);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
