import { Request, Response, NextFunction } from 'express';
import { ParentService } from './parent.service';

export class ParentController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const parent = await ParentService.create(data);
      res.status(201).json({ success: true, data: parent });
    } catch (error) {
      next(error);
    }
  }

  static async getParents(req: Request, res: Response, next: NextFunction) {
    try {
      const parents = await ParentService.getAll(req.schoolId!, req.query);
      res.json({ success: true, data: parents });
    } catch (error) {
      next(error);
    }
  }

  static async getParent(req: Request, res: Response, next: NextFunction) {
    try {
      const parent = await ParentService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: parent });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parent = await ParentService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: parent });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await ParentService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Parent deleted' });
    } catch (error) {
      next(error);
    }
  }
}
