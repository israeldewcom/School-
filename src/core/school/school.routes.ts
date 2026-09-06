import express from 'express';
import { SchoolController } from './school.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('school', 'read'), SchoolController.getSchools);
router.get('/:id', requirePermission('school', 'read'), SchoolController.getSchool);
router.post('/', requirePermission('school', 'write'), SchoolController.create);
router.put('/:id', requirePermission('school', 'write'), SchoolController.update);
router.delete('/:id', requirePermission('school', 'delete'), SchoolController.delete);

export default router;
