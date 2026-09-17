// src/core/auth/auth.routes.ts
import express from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = express.Router();

router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);
router.post('/register-first', AuthController.registerFirst);
router.post('/forgot-password', AuthController.forgotPassword);

// Routes below require authentication.
router.post('/logout-all', authMiddleware, AuthController.logoutAll);
router.post('/change-password', authMiddleware, AuthController.changePassword);
router.get('/session-status', authMiddleware, AuthController.sessionStatus);

export default router;
