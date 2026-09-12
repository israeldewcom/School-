import { Request, Response, NextFunction } from 'express';
import { UserService } from './user.service';

export class UserController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.create(req.body, req.user);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  static async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await UserService.getAll(req.query, req.user);
      res.json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  }

  static async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.getById(req.params.id, req.user);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.update(req.params.id, req.body, req.user);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await UserService.delete(req.params.id, req.user);
      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      next(error);
    }
  }
}
