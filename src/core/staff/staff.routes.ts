import express from 'express';
import { StaffController } from './staff.controller';
import { requirePermission } from '../../middleware/permission.middleware';
import { checkEntitlement } from '../../middleware/entitlement.middleware';

const router = express.Router();

router.get('/', requirePermission('staff', 'read'), StaffController.getStaff);
router.get('/:id', requirePermission('staff', 'read'), StaffController.getStaffMember);
router.post('/', requirePermission('staff', 'write'), checkEntitlement('staff'), StaffController.create);
router.put('/:id', requirePermission('staff', 'write'), StaffController.update);
router.delete('/:id', requirePermission('staff', 'delete'), StaffController.delete);

export default router;
