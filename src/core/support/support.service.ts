import { AuditLog } from '../../models/AuditLog';

export class SupportService {
  static async getAuditLogs(schoolId: string, query: any) {
    return AuditLog.find({ schoolId, ...query }).sort({ timestamp: -1 });
  }
}
