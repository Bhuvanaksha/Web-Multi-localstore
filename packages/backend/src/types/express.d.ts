import type { Role } from '@alpha/shared';

declare global {
  namespace Express {
    interface Request {
      /** Populated by the requestId middleware */
      id: string;
      /** Populated by the protect middleware */
      user?: {
        id: string;
        role: Role;
        username?: string;
      };
      /** Raw body captured for Stripe webhook signature verification */
      rawBody?: Buffer;
    }
  }
}
