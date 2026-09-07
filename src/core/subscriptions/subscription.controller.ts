import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from './subscription.service';

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
}
