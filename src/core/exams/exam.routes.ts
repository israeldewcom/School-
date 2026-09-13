import express from 'express';
import { ExamController } from './exam.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('exams', 'read'), ExamController.list);
router.post('/', requirePermission('exams', 'write'), ExamController.create);
router.put('/:id', requirePermission('exams', 'write'), ExamController.update);
router.delete('/:id', requirePermission('exams', 'write'), ExamController.delete);

export default router;
