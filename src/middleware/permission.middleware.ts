// src/middleware/permission.middleware.ts
import { Request, Response, NextFunction } from 'express';

export const PERMISSION_ROLES: Record<string, Record<string, string[]>> = {
  platform: {
    access: ['SUPER_ADMIN'],
  },
  users: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  academics: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER'],
  },
  classes: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  students: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER', 'BURSAR', 'PARENT'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  parents: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  staff: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  payments: {
    read:    ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR', 'PARENT'],
    write:   ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'BURSAR'],
    approve: ['SUPER_ADMIN', 'SCHOOL_OWNER'],
  },
  fees: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR', 'PARENT'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'BURSAR'],
  },
  invoices: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'BURSAR', 'PARENT'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'BURSAR'],
  },
  attendance: {
    read:   ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER'],
    delete: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  results: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER', 'PARENT'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER'],
  },
  exams: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER'],
  },
  reportCards: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER', 'PARENT'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER'],
  },
  communications: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR'],
  },
  analytics: {
    read: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR'],
  },
  documents: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  support: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER'],
  },
};

/**
 * Route guard. Denies by default when the resource/action isn't listed.
 * Every branch terminates with either `next()` or `return;` — never a
 * `return res.json(...)` — so TypeScript's "not all paths return" check
 * is satisfied.
 */
export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as any).userRole || (req as any).user?.role;
    if (!role) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    // Super admin bypasses everything.
    if (role === 'SUPER_ADMIN') {
      next();
      return;
    }

    const allowed = PERMISSION_ROLES[resource]?.[action] || [];
    if (!allowed.includes(role)) {
      res.status(403).json({
        success: false,
        message: `Your role (${role}) does not have permission to perform this action.`,
      });
      return;
    }

    next();
  };
}

export function requireSuperAdmin() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as any).userRole || (req as any).user?.role;
    if (role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Super admin access required' });
      return;
    }
    next();
  };
}
