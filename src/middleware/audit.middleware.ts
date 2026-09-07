import { Request, Response, NextFunction } from 'express';
import { AuditLog } from '../models/AuditLog';
import logger from '../config/logger';

export const auditMiddleware = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    res.send = function (body) {
      // Log audit after response
      const auditLog = new AuditLog({
        actor: req.user?.email || 'unknown',
        schoolId: req.schoolId,
        action: `${resource}.${action}`,
        resource,
        resourceId: req.params.id || 'unknown',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
      });
      auditLog.save().catch((err: any) => logger.error('Audit log failed:', err));
      return originalSend.call(this, body);
    };
    next();
  };
};
