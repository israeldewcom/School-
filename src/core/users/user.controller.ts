// src/core/users/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { UserService } from './user.service';

export class UserController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await UserService.list(req.schoolId, req.query);
      res.json({ success: true, data: users });
    } catch (err) { next(err); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.create(req.schoolId, req.userId, req.body);
      res.status(201).json({ success: true, data: user });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.update(
        req.schoolId,
        req.userId,
        req.params.id,
        req.body
      );
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await UserService.delete(req.schoolId, req.userId, req.params.id);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await UserService.resetPassword(
        req.schoolId,
        req.userId,
        req.params.id,
        req.body.password
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  /**
   * Grant or revoke payment approval for a bursar.
   * Body: { canApprovePayments: boolean }
   */
  static async setApprovalDelegation(req: Request, res: Response, next: NextFunction) {
    try {
      const { canApprovePayments } = req.body || {};
      const result = await UserService.setApprovalDelegation(
        req.schoolId,
        req.userId,
        req.params.id,
        !!canApprovePayments
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}
