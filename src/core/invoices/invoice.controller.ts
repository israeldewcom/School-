import { Request, Response, NextFunction } from 'express';
import { InvoiceService } from './invoice.service';
import { idempotencyMiddleware } from '../../middleware/idempotency.middleware';

export class InvoiceController {
  static async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId, idempotencyKey: req.headers['idempotency-key'] as string };
      const invoice = await InvoiceService.generateInvoice(data);
      res.status(201).json({ success: true, data: invoice });
    } catch (error) { next(error); }
  }

  static async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const invoices = await InvoiceService.getAll(req.schoolId!, req.query);
      res.json({ success: true, data: invoices });
    } catch (error) { next(error); }
  }

  static async getInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await InvoiceService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: invoice });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await InvoiceService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: invoice });
    } catch (error) { next(error); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await InvoiceService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Invoice deleted' });
    } catch (error) { next(error); }
  }
}
