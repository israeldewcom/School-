import { Request, Response, NextFunction } from 'express';
import { PaymentService } from './payment.service';
import { Payment } from '../../models/Payment';
import { NotFoundError } from '../../utils/errors';

export class PaymentController {
  static async getPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const payments = await Payment.find({ schoolId: req.schoolId, ...req.query })
        .populate('studentId')
        .populate('invoiceId');
      res.json({ success: true, data: payments });
    } catch (error) { next(error); }
  }

  static async getPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await Payment.findOne({ _id: req.params.id, schoolId: req.schoolId })
        .populate('studentId')
        .populate('invoiceId');
      if (!payment) throw new NotFoundError('Payment not found');
      res.json({ success: true, data: payment });
    } catch (error) { next(error); }
  }

  static async recordManual(req: Request, res: Response, next: NextFunction) {
    try {
      const data = {
        ...req.body,
        schoolId: req.schoolId,
        receivedBy: req.userId,
        proofFile: req.file, // multer-populated file, if one was attached
      };
      const payment = await PaymentService.recordManualPayment(data);
      res.status(201).json({ success: true, data: payment });
    } catch (error) { next(error); }
  }

  static async approveManual(req: Request, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.approveManualPayment(req.params.id, req.userId!);
      res.json({ success: true, data: payment });
    } catch (error) { next(error); }
  }
}
