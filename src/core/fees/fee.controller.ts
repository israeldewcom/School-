import { Request, Response, NextFunction } from 'express';
import { FeeService } from './fee.service';

export class FeeController {
  // --- Categories ---
  static async listCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await FeeService.listCategories(req.schoolId!);
      res.json({ success: true, data: items });
    } catch (err) { next(err); }
  }

  static async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const category = await FeeService.createCategory(req.schoolId!, req.body);
      res.status(201).json({ success: true, data: category });
    } catch (err) { next(err); }
  }

  // --- Structures ---
  static async listStructures(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await FeeService.listStructures(req.schoolId!, req.query);
      res.json({ success: true, data: items });
    } catch (err) { next(err); }
  }

  static async getStructure(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await FeeService.getStructureById(req.schoolId!, req.params.id);
      res.json({ success: true, data: item });
    } catch (err) { next(err); }
  }

  static async createStructure(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await FeeService.createStructure(req.schoolId!, req.body);
      res.status(201).json({ success: true, data: item });
    } catch (err) { next(err); }
  }

  static async updateStructure(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await FeeService.updateStructure(req.schoolId!, req.params.id, req.body);
      res.json({ success: true, data: item });
    } catch (err) { next(err); }
  }

  static async deleteStructure(req: Request, res: Response, next: NextFunction) {
    try {
      await FeeService.deleteStructure(req.schoolId!, req.params.id);
      res.json({ success: true, message: 'Fee structure deleted' });
    } catch (err) { next(err); }
  }
}
