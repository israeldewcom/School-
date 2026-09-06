import { Request, Response, NextFunction } from 'express';
import { FeeService } from './fee.service';

export class FeeController {
  // Categories
  static async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const cat = await FeeService.createCategory(data);
      res.status(201).json({ success: true, data: cat });
    } catch (error) { next(error); }
  }
  static async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const cats = await FeeService.getCategories(req.schoolId!, req.query);
      res.json({ success: true, data: cats });
    } catch (error) { next(error); }
  }
  static async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const cat = await FeeService.updateCategory(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: cat });
    } catch (error) { next(error); }
  }
  static async deleteCategory(req: Request, res: Response, next: NextFunction) {
    try {
      await FeeService.deleteCategory(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Category deleted' });
    } catch (error) { next(error); }
  }

  // Structures
  static async createStructure(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const struct = await FeeService.createStructure(data);
      res.status(201).json({ success: true, data: struct });
    } catch (error) { next(error); }
  }
  static async getStructures(req: Request, res: Response, next: NextFunction) {
    try {
      const structs = await FeeService.getStructures(req.schoolId!, req.query);
      res.json({ success: true, data: structs });
    } catch (error) { next(error); }
  }
  static async updateStructure(req: Request, res: Response, next: NextFunction) {
    try {
      const struct = await FeeService.updateStructure(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: struct });
    } catch (error) { next(error); }
  }
  static async deleteStructure(req: Request, res: Response, next: NextFunction) {
    try {
      await FeeService.deleteStructure(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Fee structure deleted' });
    } catch (error) { next(error); }
  }
}
