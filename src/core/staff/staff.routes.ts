import express from 'express';
import { StaffController } from './staff.controller';
import { requirePermission } from '../../middleware/permission.middleware';
import { checkEntitlement } from '../../middleware/entitlement.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createStaffSchema, updateStaffSchema } from './staff.validator';

const router = express.Router();

router.get('/', requirePermission('staff', 'read'), StaffController.getStaff);
router.get('/:id', requirePermission('staff', 'read'), StaffController.getStaffMember);

router.post(
  '/',
  requirePermission('staff', 'write'),
  checkEntitlement('staff'),
  validate(createStaffSchema),
  StaffController.create
);

// Static-path sub-routes MUST come before /:id (or at least before the PUT
// that shares the /:id prefix). Express matches strictly by order here.
router.post(
  '/:id/login',
  requirePermission('staff', 'write'),
  StaffController.createLogin
);

router.put(
  '/:id',
  requirePermission('staff', 'write'),
  validate(updateStaffSchema),
  StaffController.update
);

router.delete('/:id', requirePermission('staff', 'delete'), StaffController.delete);

export default router;
