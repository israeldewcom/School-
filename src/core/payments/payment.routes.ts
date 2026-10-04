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
router.get('/summary', requirePermission('payments', 'read'), PaymentController.summary);
router.post('/manual', requirePermission('payments', 'write'), PaymentController.recordManual);

router.get('/:id', requirePermission('payments', 'read'), PaymentController.getById);

// Approve and reject: the proprietor, or a bursar / admin whose account the
// proprietor has delegated approval to (flag: canApprovePayments).
router.post(
  '/:id/approve',
  requireDelegatablePermission('payments', 'approve', ['BURSAR', 'ADMIN'], 'canApprovePayments'),
  PaymentController.approve
);

router.post(
  '/:id/reject',
  requireDelegatablePermission('payments', 'approve', ['BURSAR', 'ADMIN'], 'canApprovePayments'),
  PaymentController.reject
);

export default router;
