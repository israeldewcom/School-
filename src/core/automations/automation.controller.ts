import { Request, Response, NextFunction } from 'express';
import { AutomationService } from './automation.service';

export class AutomationController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const auto = await AutomationService.create(data);
      res.status(201).json({ success: true, data: auto });
    } catch (error) { next(error); }
  }

  static async getAutomations(req: Request, res: Response, next: NextFunction) {
    try {
      const autos = await AutomationService.getAll(req.schoolId!, req.query);
      res.json({ success: true, data: autos });
    } catch (error) { next(error); }
  }

  static async getAutomation(req: Request, res: Response, next: NextFunction) {
    try {
      const auto = await AutomationService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: auto });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const auto = await AutomationService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: auto });
    } catch (error) { next(error); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await AutomationService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Automation deleted' });
    } catch (error) { next(error); }
  }

  static async triggerManual(req: Request, res: Response, next: NextFunction) {
    try {
      const { event, data } = req.body;
      await AutomationService.triggerAutomation(event, { ...data, schoolId: req.schoolId });
      res.json({ success: true, message: 'Automation triggered' });
    } catch (error) { next(error); }
  }
}
