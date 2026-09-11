import { z } from 'zod';

export const markAttendanceSchema = z.object({
  body: z.object({
    studentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid student id'),
    classId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid class id'),
    sessionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid session id'),
    termId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid term id'),
    date: z.string().transform((s) => new Date(s)),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
    remark: z.string().optional(),
  }),
});

export const updateAttendanceSchema = z.object({
  body: z.object({
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']).optional(),
    remark: z.string().optional(),
  }),
});
