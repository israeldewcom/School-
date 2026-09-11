import { z } from 'zod';

export const createStaffSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('A valid email is required'),
    phone: z.string().min(1, 'Phone is required'),
    role: z.enum(['TEACHER', 'ACCOUNTANT', 'ADMIN', 'OTHER'], {
      errorMap: () => ({ message: 'Role must be one of TEACHER, ACCOUNTANT, ADMIN, OTHER' }),
    }),
    department: z.string().optional(),
  }),
});

export const updateStaffSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    role: z.enum(['TEACHER', 'ACCOUNTANT', 'ADMIN', 'OTHER']).optional(),
    department: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});
