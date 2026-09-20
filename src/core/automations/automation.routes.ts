// src/core/automations/automation.routes.ts
import express from 'express';
import { AutomationController } from './automation.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get(
  '/',
  requirePermission('automations', 'read'),
  AutomationController.list
);

router.post(
  '/',
  requirePermission('automations', 'write'),
  AutomationController.create
);

router.get(
  '/:id',
  requirePermission('automations', 'read'),
  AutomationController.getById
);

router.put(
  '/:id',
  requirePermission('automations', 'write'),
  AutomationController.update
);

router.put(
  '/:id/toggle',
  requirePermission('automations', 'write'),
  AutomationController.toggle
);

router.post(
  '/:id/test',
  requirePermission('automations', 'write'),
  AutomationController.test
);

router.delete(
  '/:id',
  requirePermission('automations', 'write'),
  AutomationController.delete
);

export default router;
