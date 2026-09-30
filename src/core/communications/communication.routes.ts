import express from 'express';
import { CommunicationController } from './communication.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/messages', requirePermission('communications', 'read'), CommunicationController.getMessages);
router.post('/messages', requirePermission('communications', 'write'), CommunicationController.sendMessage);
router.post('/sms-to-parent', requirePermission('communications', 'write'), CommunicationController.sendParentSMS);

export default router;
