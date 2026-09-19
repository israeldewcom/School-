// src/core/subscriptions/subscription.controller.ts
import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from './subscription.service';

export class SubscriptionController {
  static async getCurrent(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = await SubscriptionService.getCurrent(req.schoolId);
      res.json({ success: true, data: sub });
    } catch (err) { next(err); }
  }

  static async listPlans(_req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await SubscriptionService.listPlans();
      res.json({ success: true, data: plans });
    } catch (err) { next(err); }
  }

  static async renew(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SubscriptionService.submitRenewal(
        req.schoolId,
        req.userId,
        req.body
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async subscribe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SubscriptionService.submitRenewal(
        req.schoolId,
        req.userId,
        req.body
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async topupSms(req: Request, res: Response, next: NextFunction) {
    try {
      const amount = Number(req.body?.amount);
      const result = await SubscriptionService.topupSms(req.schoolId, amount);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async trialStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await SubscriptionService.trialStatus(req.schoolId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}
