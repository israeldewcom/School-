import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { ExamService } from './exam.service';

const router = express.Router();

router.get('/', requirePermission('exams', 'read'), async (req, res, next) => {
  try {
    const exams = await ExamService.getAll(req.schoolId!, req.query);
    res.json({ success: true, data: exams });
  } catch (error) { next(error); }
});
router.get('/:id', requirePermission('exams', 'read'), async (req, res, next) => {
  try {
    const exam = await ExamService.getById(req.params.id, req.schoolId!);
    res.json({ success: true, data: exam });
  } catch (error) { next(error); }
});
router.post('/', requirePermission('exams', 'write'), async (req, res, next) => {
  try {
    const data = { ...req.body, schoolId: req.schoolId };
    const exam = await ExamService.create(data);
    res.status(201).json({ success: true, data: exam });
  } catch (error) { next(error); }
});
router.put('/:id', requirePermission('exams', 'write'), async (req, res, next) => {
  try {
    const exam = await ExamService.update(req.params.id, req.schoolId!, req.body);
    res.json({ success: true, data: exam });
  } catch (error) { next(error); }
});
router.delete('/:id', requirePermission('exams', 'delete'), async (req, res, next) => {
  try {
    await ExamService.delete(req.params.id, req.schoolId!);
    res.json({ success: true, message: 'Exam deleted' });
  } catch (error) { next(error); }
});

export default router;
