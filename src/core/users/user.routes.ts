import express from 'express';
import { UserController } from './user.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('users', 'read'), UserController.getUsers);
router.get('/:id', requirePermission('users', 'read'), UserController.getUser);
router.post('/', requirePermission('users', 'write'), UserController.create);
router.put('/:id', requirePermission('users', 'write'), UserController.update);
router.delete('/:id', requirePermission('users', 'delete'), UserController.delete);

export default router;
