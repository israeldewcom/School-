import { Request, Response, NextFunction } from 'express';
import { DefaultersService } from './defaulters.service';

export class DefaultersController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const defaulters = await DefaultersService.getDefaulters(req.schoolId!);
      res.json({ success: true, data: defaulters });
    } catch (error) {
      next(error);
    }
  }
}
