import express from 'express';
import { PaymentController } from './payment.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('payments', 'read'), PaymentController.getPayments);
router.get('/:id', requirePermission('payments', 'read'), PaymentController.getPayment);
router.post('/manual', requirePermission('payments', 'write'), PaymentController.recordManual);
router.post('/:id/approve', requirePermission('payments', 'approve'), PaymentController.approveManual);

export default router;
