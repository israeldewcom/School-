import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { NotificationService } from './notification.service';

const router = express.Router();

router.get('/', requirePermission('notifications', 'read'), async (req, res, next) => {
  try {
    const notifs = await NotificationService.getForUser(req.userId!, req.schoolId!);
    res.json({ success: true, data: notifs });
  } catch (error) { next(error); }
});
router.put('/:id/read', requirePermission('notifications', 'write'), async (req, res, next) => {
  try {
    const notif = await NotificationService.markRead(req.params.id, req.userId!, req.schoolId!);
    res.json({ success: true, data: notif });
  } catch (error) { next(error); }
});

export default router;
