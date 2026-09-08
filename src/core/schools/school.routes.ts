import express from 'express';
import { SchoolController } from './school.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

// All routes here are protected by the parent index.ts middleware
router.get('/', requirePermission('school', 'read'), SchoolController.getSchools);
router.get('/current', requirePermission('school', 'read'), SchoolController.getCurrentSchool);
router.get('/:id', requirePermission('school', 'read'), SchoolController.getSchool);
router.post('/', requirePermission('school', 'write'), SchoolController.create);
router.put('/:id', requirePermission('school', 'write'), SchoolController.update);
router.put('/current', requirePermission('school', 'write'), SchoolController.updateCurrent);
router.delete('/:id', requirePermission('school', 'delete'), SchoolController.delete);

export default router;
