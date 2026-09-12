import { Request, Response, NextFunction } from 'express';
import { PlatformService } from './platform.service';

export class PlatformController {
  static async listSchools(req: Request, res: Response, next: NextFunction) {
    try {
      const schools = await PlatformService.listSchools(req.query);
      res.json({ success: true, data: schools });
    } catch (error) { next(error); }
  }

  static async getSchoolDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const detail = await PlatformService.getSchoolDetail(req.params.id);
      res.json({ success: true, data: detail });
    } catch (error) { next(error); }
  }

  static async listSubscriptions(req: Request, res: Response, next: NextFunction) {
    try {
      const subscriptions = await PlatformService.listSubscriptions(req.query);
      res.json({ success: true, data: subscriptions });
    } catch (error) { next(error); }
  }

  static async updateSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const { subscriptionId, planId, autoRenew } = req.body;
      const result = await PlatformService.updateSubscription(subscriptionId, planId, autoRenew);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async getGlobalAnalytics(_req: Request, res: Response, next: NextFunction) {
    try {
      const analytics = await PlatformService.getGlobalAnalytics();
      res.json({ success: true, data: analytics });
    } catch (error) { next(error); }
  }

  static async getRevenueAnalytics(_req: Request, res: Response, next: NextFunction) {
    try {
      const revenue = await PlatformService.getRevenueAnalytics();
      res.json({ success: true, data: revenue });
    } catch (error) { next(error); }
  }

  static async extendSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const days = Number(req.body?.days) || 30;
      const result = await PlatformService.extendSubscription(req.params.id, days, req.userId!);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async toggleSchoolStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PlatformService.toggleSchoolStatus(req.params.id, req.userId!);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}
