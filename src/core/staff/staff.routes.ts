import express from 'express';
import { StaffController } from './staff.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('staff', 'read'), StaffController.getStaff);
router.get('/:id', requirePermission('staff', 'read'), StaffController.getStaffMember);
router.post('/', requirePermission('staff', 'write'), StaffController.create);
router.put('/:id', requirePermission('staff', 'write'), StaffController.update);
router.delete('/:id', requirePermission('staff', 'delete'), StaffController.delete);

export default router;
