import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import { Permission } from '../models/Permission';
import { getJSON, setJSON } from '../config/mongoStore';

export const requirePermission = (resource: string, action: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError('Not authenticated'));
    }

    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const cacheKey = `perms:${req.user.role}`;
    let permissions = await getJSON<string[]>(cacheKey);
    if (!permissions) {
      const permDoc = await Permission.findOne({ role: req.user.role });
      permissions = permDoc ? permDoc.permissions : [];
      await setJSON(cacheKey, permissions, 3600);
    }

    const required = `${resource}:${action}`;
    if (!permissions.includes(required) && !permissions.includes('*:*')) {
      return next(new ForbiddenError(`Permission denied: ${required}`));
    }

    next();
  };
};
