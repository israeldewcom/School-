// src/core/classes/class.routes.ts
import express from 'express';
import { ClassController } from './class.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('classes', 'read'), ClassController.list);
router.post('/', requirePermission('classes', 'write'), ClassController.create);
router.get('/:id', requirePermission('classes', 'read'), ClassController.getById);
router.put('/:id', requirePermission('classes', 'write'), ClassController.update);
router.delete('/:id', requirePermission('classes', 'write'), ClassController.delete);

export default router;
