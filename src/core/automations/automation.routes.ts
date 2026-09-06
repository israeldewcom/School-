import express from 'express';
import { AutomationController } from './automation.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('automations', 'read'), AutomationController.getAutomations);
router.get('/:id', requirePermission('automations', 'read'), AutomationController.getAutomation);
router.post('/', requirePermission('automations', 'write'), AutomationController.create);
router.put('/:id', requirePermission('automations', 'write'), AutomationController.update);
router.delete('/:id', requirePermission('automations', 'delete'), AutomationController.delete);
router.post('/trigger', requirePermission('automations', 'write'), AutomationController.triggerManual);

export default router;
