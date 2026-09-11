import { z } from 'zod';

export const createClassSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Class name is required'),
    level: z.number({ invalid_type_error: 'Level is required and must be a number' }),
    academicYear: z.string().min(1, 'Academic year is required'),
    fee: z.number().min(0).optional(),
    homeroomTeacher: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid teacher id').optional(),
  }),
});

export const updateClassSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    level: z.number().optional(),
    academicYear: z.string().min(1).optional(),
    fee: z.number().min(0).optional(),
    homeroomTeacher: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid teacher id').optional(),
    isActive: z.boolean().optional(),
  }),
});
