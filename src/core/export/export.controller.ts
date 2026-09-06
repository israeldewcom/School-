import { Request, Response, NextFunction } from 'express';
import { ExportService } from './export.service';

export class ExportController {
  static async exportStudents(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await ExportService.exportStudents(req.schoolId!);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=students.csv');
      res.send(csv);
    } catch (error) { next(error); }
  }

  static async exportInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await ExportService.exportInvoices(req.schoolId!);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=invoices.csv');
      res.send(csv);
    } catch (error) { next(error); }
  }

  static async exportPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await ExportService.exportPayments(req.schoolId!);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=payments.csv');
      res.send(csv);
    } catch (error) { next(error); }
  }
}
