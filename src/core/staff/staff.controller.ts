import { Request, Response, NextFunction } from 'express';
import { StaffService } from './staff.service';

export class StaffController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = { ...req.body, schoolId: req.schoolId };
      const staff = await StaffService.create(data);
      res.status(201).json({ success: true, data: staff });
    } catch (error) {
      next(error);
    }
  }

  static async getStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const staff = await StaffService.getAll(req.schoolId!, req.query);
      res.json({ success: true, data: staff });
    } catch (error) {
      next(error);
    }
  }

  static async getStaffMember(req: Request, res: Response, next: NextFunction) {
    try {
      const staff = await StaffService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: staff });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const staff = await StaffService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: staff });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await StaffService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Staff deleted' });
    } catch (error) {
      next(error);
    }
  }

  static async createLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await StaffService.createLogin(
        req.params.id,
        req.schoolId!,
        req.body
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}
