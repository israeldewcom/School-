import { Request, Response, NextFunction } from 'express';
import { ResultService } from './result.service';

export class ResultController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const result = await ResultService.create(data);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async getResults(req: Request, res: Response, next: NextFunction) {
    try {
      const results = await ResultService.getAll(req.schoolId!, req.query);
      res.json({ success: true, data: results });
    } catch (error) { next(error); }
  }

  static async getResult(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResultService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ResultService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await ResultService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Result deleted' });
    } catch (error) { next(error); }
  }
}
