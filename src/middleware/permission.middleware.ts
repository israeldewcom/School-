// src/middleware/permission.middleware.ts
import { Request, Response, NextFunction } from 'express';

export const PERMISSION_ROLES: Record<string, Record<string, string[]>> = {
  platform: { access: ['SUPER_ADMIN'] },

  subscriptions: {
    read:    ['SUPER_ADMIN', 'SCHOOL_OWNER', 'ADMIN'],
    write:   ['SUPER_ADMIN', 'SCHOOL_OWNER'],
    renew:   ['SUPER_ADMIN', 'SCHOOL_OWNER'],
    approve: ['SUPER_ADMIN'],
    cancel:  ['SUPER_ADMIN', 'SCHOOL_OWNER'],
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
    // NOTE: approve is deliberately absent from BURSAR here. It's
    // handled by the delegatable middleware below, which reads the
    // user's per-account delegation flag.
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

/**
 * A permission that can be delegated per-account.
 *
 * Base roles (SUPER_ADMIN, SCHOOL_OWNER) are always allowed. For
 * delegatable roles (BURSAR by default), the middleware reads the
 * user's delegation flag from the request-scoped user document —
 * which the auth middleware just loaded fresh from the database on
 * this very request. That means if the proprietor revokes the
 * delegation, the bursar's very next request is denied.
 *
 * This is used by the payment approve and reject routes.
 */
export function requireDelegatablePermission(
  resource: string,
  action: string,
  delegatableRoles: string[] = ['BURSAR'],
  delegationFlag: string = 'canApprovePayments'
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user: any = (req as any).user;
    const role = (req as any).userRole || user?.role;

    if (!role) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    // Super admin and owner bypass the delegation check entirely.
    if (role === 'SUPER_ADMIN' || role === 'SCHOOL_OWNER') {
      next();
      return;
    }

    // Check role matrix first — if the role isn't even allowed, deny.
    const baseAllowed = PERMISSION_ROLES[resource]?.[action] || [];
    const isDelegatable = delegatableRoles.includes(role);
    const isBaseAllowed = baseAllowed.includes(role);

    if (!isDelegatable && !isBaseAllowed) {
      res.status(403).json({
        success: false,
        message: `Your role (${role}) does not have permission to perform this action.`,
      });
      return;
    }

    // For delegatable roles, the account-level flag decides.
    if (isDelegatable) {
      const delegated = !!user?.[delegationFlag];
      if (delegated) {
        next();
        return;
      }
      res.status(403).json({
        success: false,
        message:
          'Payment approval is not enabled for your account. Ask the proprietor to grant you approval permission.',
      });
      return;
    }

    // Anything else that passed the base check.
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

export function requireOwner() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as any).userRole || (req as any).user?.role;
    if (role !== 'SUPER_ADMIN' && role !== 'SCHOOL_OWNER') {
      res.status(403).json({
        success: false,
        message: 'Only the proprietor can perform this action.',
      });
      return;
    }
    next();
  };
}

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
