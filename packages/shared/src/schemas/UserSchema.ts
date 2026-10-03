import { z } from 'zod';
import { RoleEnum } from '../enums/RoleEnum.js';

export const UserSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'letters, numbers and underscore only'),
  password: z.string().min(12, 'password must be at least 12 characters'),
  profile: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      bio: z.string().max(500).optional(),
    })
    .optional(),
  role: RoleEnum,
  isActive: z.boolean().default(true),
  emailVerified: z.boolean().optional(),
  mfaEnabled: z.boolean().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const CreateUserSchema = UserSchema.omit({
  id: true,
  role: true, // role/isActive are assigned server-side — never client-provided
  isActive: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateUserSchema = CreateUserSchema.partial().omit({
  password: true, // role is already absent from CreateUserSchema
});

/**
 * Input for the public register endpoint. Role is optional and restricted to
 * the two self-service personas — customers (buyers) and providers (sellers).
 * Legacy callers that omit it fall back to `member`.
 */
export const RegisterInputSchema = CreateUserSchema.extend({
  role: z.enum(['customer', 'provider']).optional(),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
