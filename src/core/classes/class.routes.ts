import express from 'express';
import { ClassController } from './class.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('classes', 'read'), ClassController.getClasses);
router.get('/:id', requirePermission('classes', 'read'), ClassController.getClass);
router.post('/', requirePermission('classes', 'write'), ClassController.create);
router.put('/:id', requirePermission('classes', 'write'), ClassController.update);
router.delete('/:id', requirePermission('classes', 'delete'), ClassController.delete);

export default router;
