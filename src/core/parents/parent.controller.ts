// src/core/parents/parent.controller.ts
import { Request, Response, NextFunction } from 'express';
import { ParentService } from './parent.service';

export class ParentController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await ParentService.list(req.schoolId, req.query);
      res.json({ success: true, data: items });
    } catch (err) { next(err); }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await ParentService.getById(req.schoolId, req.params.id);
      res.json({ success: true, data: item });
    } catch (err) { next(err); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await ParentService.create(req.schoolId, req.body);
      res.status(201).json({ success: true, data: item });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await ParentService.update(req.schoolId, req.params.id, req.body);
      res.json({ success: true, data: item });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ParentService.delete(req.schoolId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}
