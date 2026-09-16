// src/core/users/user.routes.ts
import express from 'express';
import { UserController } from './user.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('users', 'read'), UserController.list);
router.post('/', requirePermission('users', 'write'), UserController.create);
router.put('/:id', requirePermission('users', 'write'), UserController.update);
router.delete('/:id', requirePermission('users', 'write'), UserController.delete);
router.post(
  '/:id/reset-password',
  requirePermission('users', 'write'),
  UserController.resetPassword
);

export default router;
