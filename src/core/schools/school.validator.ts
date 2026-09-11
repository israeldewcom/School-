import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createStudentSchema = z.object({
  body: z.object({
    admissionNumber: z.string().min(1),
    firstName: z.string().min(1),
    middleName: z.string().optional(),
    lastName: z.string().min(1),
    dateOfBirth: z.string().transform((s) => new Date(s)),
    gender: z.enum(['MALE', 'FEMALE']),
    classId: objectId,
    address: z.string().min(1),
    // Optional but persisted: these are now accepted so parent linking works.
    parentIds: z.array(objectId).optional(),
    // Optional session (some flows need it, others rely on the class's year).
    sessionId: objectId.optional(),
    medicalInfo: z.string().optional(),
    photo: z.string().optional(),
  }),
});

export const updateStudentSchema = z.object({
  body: z.object({
    admissionNumber: z.string().optional(),
    firstName: z.string().optional(),
    middleName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.string().transform((s) => new Date(s)).optional(),
    gender: z.enum(['MALE', 'FEMALE']).optional(),
    classId: objectId.optional(),
    address: z.string().optional(),
    // Whitelist here so a client can link/unlink parents but not tamper
    // with other fields they shouldn't touch.
    parentIds: z.array(objectId).optional(),
    medicalInfo: z.string().optional(),
    photo: z.string().optional(),
    status: z.enum(['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'SUSPENDED', 'ARCHIVED']).optional(),
  }),
});
