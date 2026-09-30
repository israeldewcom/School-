  import { Request, Response, NextFunction } from 'express';
import { ResultService } from './result.service';
import { getUserScope } from '../../middleware/scope.middleware';

export class ResultController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const result = await ResultService.create(req.schoolId!, scope, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async bulkCreate(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const result = await ResultService.bulkCreate(req.schoolId!, scope, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async getResults(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const results = await ResultService.getAll(req.schoolId!, scope, req.query);
      res.json({ success: true, data: results });
    } catch (error) { next(error); }
  }

  static async getResult(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const result = await ResultService.getById(req.params.id, req.schoolId!, scope);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const result = await ResultService.update(req.params.id, req.schoolId!, scope, req.body);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await ResultService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Result deleted' });
    } catch (error) { next(error); }
  }

  static async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const out = await ResultService.setPublished(req.schoolId!, scope, req.userId!, req.body, true);
      res.json({ success: true, data: out });
    } catch (error) { next(error); }
  }

  static async unpublish(req: Request, res: Response, next: NextFunction) {
    try {
      const scope = await getUserScope(req);
      const out = await ResultService.setPublished(req.schoolId!, scope, req.userId!, req.body, false);
      res.json({ success: true, data: out });
    } catch (error) { next(error); }
  }
}
