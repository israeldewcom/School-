// src/types/express.d.ts
import mongoose from 'mongoose';
import { IUser } from '../models/User';

// ------------------------------------------------------------------
// Express Request augmentation
//
// Middleware in this codebase attaches the authenticated user and
// derived fields (schoolId, userId, userRole) to the request object.
// TypeScript doesn't know about these by default.
//
// The fields are declared NON-OPTIONAL because every controller that
// reads them is registered behind authMiddleware, which guarantees
// they're present before the handler runs. Making them required
// eliminates the "possibly undefined" errors that would otherwise
// force a non-null assertion at every call site.
//
// If you need the "optional during public routes" semantics, use the
// `optionalAuth` middleware and check `req.user` at the call site.
// ------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      // The full authenticated user document as returned by
      // User.findById().lean() in auth.middleware.ts.
      user: IUser & { _id: mongoose.Types.ObjectId };

      // String form of the user's _id — set by auth.middleware.ts.
      userId: string;

      // The user's role — a shortcut for req.user.role.
      userRole: string;

      // The user's school — set by auth.middleware.ts from
      // req.user.schoolId. Never present for SUPER_ADMIN, who has
      // access to platform routes only.
      schoolId: string;

      // Optional: some middleware attaches the school document for
      // convenience when the route needs school config.
      school?: any;
    }
  }
}

export {};
