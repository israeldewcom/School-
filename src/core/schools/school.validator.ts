import { z } from 'zod';

export const createSchoolSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    slug: z.string().min(1),
    address: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email(),
    country: z.string().min(1),
    state: z.string().min(1),
    city: z.string().min(1),
    currency: z.string().default('NGN'),
    timezone: z.string().default('Africa/Lagos'),
  }),
});

export const updateSchoolSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    slug: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    currency: z.string().optional(),
    timezone: z.string().optional(),
    status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  }),
});
