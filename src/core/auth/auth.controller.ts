// src/core/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password, remember } = req.body || {};
      const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
      const result = await AuthService.login(
        username,
        password,
        meta,
        remember !== false
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body || {};
      if (!refreshToken) {
        res.status(400).json({ success: false, message: 'Refresh token required' });
        return;
      }
      const result = await AuthService.refresh(refreshToken);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body || {};
      const result = await AuthService.logout(refreshToken);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).userId;
      const result = await AuthService.logoutAll(userId);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).userId;
      const { oldPassword, newPassword } = req.body || {};
      const result = await AuthService.changePassword(userId, oldPassword, newPassword);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  // Best-effort stubs for the routes that exist but aren't fully wired.
  static async registerFirst(req: Request, res: Response, next: NextFunction) {
    try {
      // Delegate to SchoolController if it exists; otherwise return a clear error.
      res.status(501).json({ success: false, message: 'register-first not implemented here' });
    } catch (err) { next(err); }
  }

  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      // Best-effort: respond success so the frontend shows the "contact owner" path.
      res.json({ success: true, data: { sent: false, message: 'Contact your school owner to reset your password.' } });
    } catch (err) { next(err); }
  }
}
