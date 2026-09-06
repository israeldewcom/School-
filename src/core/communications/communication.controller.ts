import { Request, Response, NextFunction } from 'express';
import { CommunicationService } from './communication.service';

export class CommunicationController {
  static async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId, sender: req.userId };
      const msg = await CommunicationService.sendMessage(data);
      res.status(201).json({ success: true, data: msg });
    } catch (error) { next(error); }
  }

  static async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const msgs = await CommunicationService.getMessages(req.schoolId!, req.query);
      res.json({ success: true, data: msgs });
    } catch (error) { next(error); }
  }

  static async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const notifs = await CommunicationService.getNotifications(req.userId!, req.schoolId!);
      res.json({ success: true, data: notifs });
    } catch (error) { next(error); }
  }

  static async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      const notif = await CommunicationService.markNotificationRead(req.params.id, req.schoolId!);
      res.json({ success: true, data: notif });
    } catch (error) { next(error); }
  }
}
