import express from 'express';
import { InvoiceController } from './invoice.controller';
import { requirePermission } from '../../middleware/permission.middleware';
import { idempotencyMiddleware } from '../../middleware/idempotency.middleware';

const router = express.Router();

router.get('/', requirePermission('invoices', 'read'), InvoiceController.getInvoices);
router.get('/:id', requirePermission('invoices', 'read'), InvoiceController.getInvoice);
router.post('/generate', requirePermission('invoices', 'write'), idempotencyMiddleware('invoice'), InvoiceController.generate);
router.put('/:id', requirePermission('invoices', 'write'), InvoiceController.update);
router.delete('/:id', requirePermission('invoices', 'delete'), InvoiceController.delete);

export default router;
