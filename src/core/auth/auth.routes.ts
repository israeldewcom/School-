import express from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middleware/validation.middleware';
import { loginSchema, refreshSchema, logoutSchema } from './auth.validator';
import { authMiddleware } from '../../middleware/auth.middleware';
import { authLimiter } from '../../middleware/rateLimit.middleware';

const router = express.Router();

router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', authLimiter, validate(refreshSchema), AuthController.refresh);
router.post('/logout', authMiddleware, validate(logoutSchema), AuthController.logout);
router.post('/logout-all', authMiddleware, AuthController.logoutAll);

export default router;
