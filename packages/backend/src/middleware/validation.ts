import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';
import { ValidationError } from '../utils/errors.js';

export interface ValidationSchemas {
  body?: ZodType<any, ZodTypeDef, any>;
  params?: ZodType<any, ZodTypeDef, any>;
  query?: ZodType<any, ZodTypeDef, any>;
}

/**
 * Middleware factory. Pass a single Zod schema to validate the body, or an
 * object `{ body, params, query }` to validate each location. Validated
 * data is written back onto `req.body/params/query` (parsed/coerced).
 */
export function validate(
  schemas: ValidationSchemas | ZodType<any, ZodTypeDef, any>,
): RequestHandler {
  const spec: ValidationSchemas =
    typeof (schemas as ZodType).parse === 'function'
      ? { body: schemas as ZodType<any, ZodTypeDef, any> }
      : (schemas as ValidationSchemas);

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (spec.body) req.body = spec.body.parse(req.body);
      if (spec.params) req.params = spec.params.parse(req.params);
      if (spec.query) req.query = spec.query.parse(req.query);
      next();
    } catch (err) {
      next(new ValidationError('Validation failed', (err as { issues?: unknown }).issues));
    }
  };
}
