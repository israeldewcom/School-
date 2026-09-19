// src/core/users/user.routes.ts
import express from 'express';
import { UserController } from './user.controller';
import {
  requirePermission,
  requireOwner,
} from '../../middleware/permission.middleware';

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

// Only the proprietor can grant or revoke approval permission.
// Admins cannot — even if they can edit other user fields.
router.put(
  '/:id/approval-delegation',
  requireOwner(),
  UserController.setApprovalDelegation
);

export default router;
