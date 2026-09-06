import { Request, Response, NextFunction } from 'express';
import { SupportService } from './support.service';

export class SupportController {
  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const logs = await SupportService.getAuditLogs(req.schoolId!, req.query);
      res.json({ success: true, data: logs });
    } catch (error) { next(error); }
  }
}
