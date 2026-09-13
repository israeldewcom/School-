import express from 'express';
import { PaymentController } from './payment.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('payments', 'read'), PaymentController.list);
router.post('/manual', requirePermission('payments', 'write'), PaymentController.recordManual);
router.get('/:id', requirePermission('payments', 'read'), PaymentController.getById);
router.post('/:id/approve', requirePermission('payments', 'approve'), PaymentController.approve);
router.post('/:id/reject', requirePermission('payments', 'approve'), PaymentController.reject);

export default router;
