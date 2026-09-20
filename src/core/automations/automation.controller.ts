// src/core/automations/automation.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AutomationService } from './automation.service';

export class AutomationController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await AutomationService.getAll(req.schoolId, req.query);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await AutomationService.getById(req.schoolId, req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await AutomationService.create(req.schoolId, req.body);
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await AutomationService.update(
        req.schoolId,
        req.params.id,
        req.body
      );
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async toggle(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AutomationService.toggle(req.schoolId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AutomationService.delete(req.schoolId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async test(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AutomationService.triggerAutomation(
        req.schoolId,
        req.params.id,
        req.body || {}
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
