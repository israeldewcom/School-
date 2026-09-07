import { Request, Response, NextFunction } from 'express';
import { PlatformService } from './platform.service';

export class PlatformController {
  static async listSchools(req: Request, res: Response, next: NextFunction) {
    try {
      const schools = await PlatformService.listSchools(req.query);
      res.json({ success: true, data: schools });
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
}
