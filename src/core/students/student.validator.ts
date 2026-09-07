import { z } from 'zod';

export const createStudentSchema = z.object({
  body: z.object({
    admissionNumber: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    dateOfBirth: z.string().transform((s) => new Date(s)),
    gender: z.enum(['MALE', 'FEMALE']),
    classId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    address: z.string().min(1),
  }),
});

export const updateStudentSchema = z.object({
  body: z.object({
    admissionNumber: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.string().transform((s) => new Date(s)).optional(),
    gender: z.enum(['MALE', 'FEMALE']).optional(),
    classId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    address: z.string().optional(),
    status: z.enum(['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'SUSPENDED', 'ARCHIVED']).optional(),
  }),
});
