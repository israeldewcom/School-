import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRenewal } from '../../models/SubscriptionRenewal';

export class SubscriptionController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const sub = await SubscriptionService.create(data);
      res.status(201).json({ success: true, data: sub });
    } catch (error) { next(error); }
  }

  static async getSubscriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const subs = await SubscriptionService.getAll(req.schoolId!, req.query);
      res.json({ success: true, data: subs });
    } catch (error) { next(error); }
  }

  static async getSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = await SubscriptionService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: sub });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = await SubscriptionService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: sub });
    } catch (error) { next(error); }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = await SubscriptionService.cancel(req.params.id, req.schoolId!);
      res.json({ success: true, data: sub });
    } catch (error) { next(error); }
  }

  static async getPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await SubscriptionService.getPlans();
      res.json({ success: true, data: plans });
    } catch (error) { next(error); }
  }

  // NEW trial status
  static async getTrialStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = await Subscription.findOne({ schoolId: req.schoolId });
      if (!sub) return res.json({ hasTrial: false });
      const daysLeft = sub.trialEndDate ? Math.ceil((new Date(sub.trialEndDate).getTime() - Date.now()) / 86400000) : 0;
      res.json({
        isTrial: sub.isTrial || false,
        daysLeft: Math.max(0, daysLeft),
        trialEndDate: sub.trialEndDate,
      });
    } catch (error) { next(error); }
  }

  // NEW renewal request (school owner)
  static async requestRenewal(req: Request, res: Response, next: NextFunction) {
    try {
      const { plan, amount, proofUrl, reference } = req.body;
      const renewal = await SubscriptionService.requestRenewal(req.schoolId!, { plan, amount, proofUrl, reference });
      res.status(201).json({ success: true, data: renewal });
    } catch (error) { next(error); }
  }

  // Platform admin endpoints (Super Admin only)
  static async getPendingRenewals(req: Request, res: Response, next: NextFunction) {
    try {
      const renewals = await SubscriptionRenewal.find({ status: 'pending' }).populate('schoolId');
      res.json({ success: true, data: renewals });
    } catch (error) { next(error); }
  }

  static async approveRenewal(req: Request, res: Response, next: NextFunction) {
    try {
      const renewal = await SubscriptionService.approveRenewal(req.params.id, req.userId!);
      res.json({ success: true, data: renewal });
    } catch (error) { next(error); }
  }

  static async rejectRenewal(req: Request, res: Response, next: NextFunction) {
    try {
      const { reason } = req.body;
      const renewal = await SubscriptionService.rejectRenewal(req.params.id, req.userId!, reason);
      res.json({ success: true, data: renewal });
    } catch (error) { next(error); }
  }
}
