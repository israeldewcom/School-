// src/utils/handler.ts
import { Request, Response, NextFunction } from 'express';
import { getUserScope, UserScope } from '../middleware/scope.middleware';

/**
 * Wraps a service call: resolves the caller's scope, runs the handler,
 * and sends { success: true, data }. Errors go to the global error handler.
 */
export function handle(
  fn: (req: Request, scope: UserScope) => Promise<any>,
  status = 200
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const scope = await getUserScope(req);
      const data = await fn(req, scope);
      res.status(status).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}

export function handlePlain(fn: (req: Request) => Promise<any>, status = 200) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fn(req);
      res.status(status).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
