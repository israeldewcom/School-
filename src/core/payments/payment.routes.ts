// src/core/payments/payment.routes.ts
import express from 'express';
import { PaymentController } from './payment.controller';
import {
  requirePermission,
  requireDelegatablePermission,
} from '../../middleware/permission.middleware';

const router = express.Router();

// Static / specific paths BEFORE /:id.
router.get('/', requirePermission('payments', 'read'), PaymentController.list);
router.post('/manual', requirePermission('payments', 'write'), PaymentController.recordManual);

router.get('/:id', requirePermission('payments', 'read'), PaymentController.getById);

// Approve and reject: either the proprietor, or a bursar whose
// account has been delegated approval permission by the proprietor.
router.post(
  '/:id/approve',
  requireDelegatablePermission('payments', 'approve', ['BURSAR'], 'canApprovePayments'),
  PaymentController.approve
);

router.post(
  '/:id/reject',
  requireDelegatablePermission('payments', 'approve', ['BURSAR'], 'canApprovePayments'),
  PaymentController.reject
);

export default router;
