// src/types/express.d.ts
import mongoose from 'mongoose';
import { IUser } from '../models/User';

// ------------------------------------------------------------------
// Express Request augmentation
//
// Middleware in this codebase attaches the authenticated user and
// derived fields (schoolId, userId, userRole) to the request object.
// TypeScript doesn't know about these by default, so every controller
// that reads them produces a "Property does not exist" error.
//
// This module augmentation tells TypeScript the properties exist and
// what their types are. It applies globally — no import needed in
// any controller or middleware.
// ------------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      // The full authenticated user document as returned by
      // User.findById().lean() in auth.middleware.ts.
      user?: IUser & { _id: mongoose.Types.ObjectId };

      // String form of the user's _id — set by auth.middleware.ts.
      userId?: string;

      // The user's role — a shortcut for req.user.role.
      userRole?: string;

      // The user's school — set by auth.middleware.ts from req.user.schoolId.
      // Absent for SUPER_ADMIN.
      schoolId?: string;

      // Optional: some middleware attaches the school document for
      // convenience when the route needs school config.
      school?: any;
    }
  }
}

export {};
