// src/core/portal/portal.routes.ts
import express from 'express';
import { PortalController } from './portal.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

// Only PARENT and STUDENT roles reach the portal.
router.use(requirePermission('portal', 'read'));

router.get('/me', PortalController.me);
router.get('/children', PortalController.children);
router.get('/children/:studentId', PortalController.child);
router.get('/children/:studentId/overview', PortalController.overview);
router.get('/children/:studentId/results', PortalController.results);
router.get('/children/:studentId/report-cards', PortalController.reportCards);
router.get('/children/:studentId/report-cards/:id', PortalController.reportCard);
router.get('/children/:studentId/attendance', PortalController.attendance);

// Finance endpoints are parent-only (enforced in the service).
router.get('/children/:studentId/finance-summary', PortalController.financeSummary);
router.get('/children/:studentId/invoices', PortalController.invoices);
router.get('/children/:studentId/payments', PortalController.payments);

export default router;
