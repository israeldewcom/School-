// src/middleware/permission.middleware.ts
import { Request, Response, NextFunction } from 'express';

/**
 * Permission matrix. Each resource maps to actions, and each action
 * maps to the roles permitted.
 *
 * Enforcement happens in two layers:
 *   1. Route-level — requirePermission('payments','approve') blocks
 *      anyone whose role isn't on the list.
 *   2. Data-level — getUserScope() narrows what a permitted user
 *      actually sees (form teacher sees one class, parent sees one
 *      child, etc.). See scope.middleware.ts.
 */
export const PERMISSION_ROLES: Record<string, Record<string, string[]>> = {
  // ---- Platform (super admin only) ----
  platform: {
    access: ['SUPER_ADMIN'],
  },

  // ---- User & credential management ----
  users: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },

  // ---- Academic setup ----
  academics: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER'],
  },

  classes: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'FORM_TEACHER', 'SUBJECT_TEACHER', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },

  // ---- People ----
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

  // ---- Finance ----
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

  // ---- Academics (day to day) ----
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

  // ---- Comms ----
  communications: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR'],
  },

  // ---- System ----
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
 */
export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).userRole || (req as any).user?.role;
    if (!role) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // Super admin bypasses everything.
    if (role === 'SUPER_ADMIN') return next();

    const allowed = PERMISSION_ROLES[resource]?.[action] || [];
    if (!allowed.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Your role (${role}) does not have permission to perform this action.`,
      });
    }
    next();
  };
}

/**
 * Convenience guard for endpoints only the platform admin should hit.
 */
export function requireSuperAdmin() {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).userRole || (req as any).user?.role;
    if (role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Super admin access required' });
    }
    next();
  };
}
