import { Request, Response, NextFunction } from 'express';
import { PaymentService } from './payment.service';

export class PaymentController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const payments = await PaymentService.list(req.schoolId!, req.query);
      res.json({ success: true, data: payments });
    } catch (err) { next(err); }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.getById(req.schoolId!, req.params.id);
      res.json({ success: true, data: payment });
    } catch (err) { next(err); }
  }

  static async recordManual(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.recordManual(req.schoolId!, req.userId!, req.body);
      res.status(201).json({ success: true, data: payment });
    } catch (err) { next(err); }
  }

  static async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.approve(req.schoolId!, req.params.id, req.userId!);
      res.json({ success: true, data: payment });
    } catch (err) { next(err); }
  }

  static async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.reject(
        req.schoolId!,
        req.params.id,
        req.userId!,
        req.body?.reason
      );
      res.json({ success: true, data: payment });
    } catch (err) { next(err); }
  }
}
