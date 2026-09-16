// src/middleware/permission.middleware.ts
import { Request, Response, NextFunction } from 'express';

export const PERMISSION_ROLES: Record<string, Record<string, string[]>> = {
  // ---- Platform ----
  platform: {
    access: ['SUPER_ADMIN'],
  },

  // ---- Subscriptions & billing ----
  // Fixes: SCHOOL_OWNER was denied on the Subscription page.
  subscriptions: {
    read:    ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
    write:   ['SUPER_ADMIN', 'SCHOOL_OWNER'],
    renew:   ['SUPER_ADMIN', 'SCHOOL_OWNER'],
    approve: ['SUPER_ADMIN'],
    cancel:  ['SUPER_ADMIN', 'SCHOOL_OWNER'],
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
  defaulters: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR'],
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
  reports: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'HEAD_TEACHER', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  exports: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN', 'BURSAR'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  automations: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
    write: ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
  },
  queues: {
    read:  ['SUPER_ADMIN', 'SCHOOL_OWNER'],
    write: ['SUPER_ADMIN'],
  },
};

export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as any).userRole || (req as any).user?.role;
    if (!role) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    if (role === 'SUPER_ADMIN') { next(); return; }

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

/**
 * Allow multiple actions on a resource (e.g. read OR write).
 * Useful when a route serves both owner and staff differently.
 */
export function requireAnyPermission(resource: string, actions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as any).userRole || (req as any).user?.role;
    if (!role) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }
    if (role === 'SUPER_ADMIN') { next(); return; }

    const matrix = PERMISSION_ROLES[resource] || {};
    const ok = actions.some((a) => (matrix[a] || []).includes(role));
    if (!ok) {
      res.status(403).json({
        success: false,
        message: `Your role (${role}) does not have permission for this action.`,
      });
      return;
    }
    next();
  };
}
