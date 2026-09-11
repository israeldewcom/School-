import express from 'express';
import { CommunicationController } from './communication.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.post('/messages', requirePermission('communications', 'write'), CommunicationController.sendMessage);
router.get('/messages', requirePermission('communications', 'read'), CommunicationController.getMessages);
router.get('/notifications', requirePermission('communications', 'read'), CommunicationController.getNotifications);
router.put('/notifications/:id/read', requirePermission('communications', 'write'), CommunicationController.markRead);

// Direct parent SMS
router.post('/sms-to-parent', requirePermission('communications', 'write'), CommunicationController.sendParentSMS);

export default router;
