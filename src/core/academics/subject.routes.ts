// src/core/academics/subject.routes.ts
import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { SubjectService } from './subject.service';

const router = express.Router();

router.get('/', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const items = await SubjectService.list(req.schoolId!, req.query);
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.post('/', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const item = await SubjectService.create(req.schoolId!, req.body);
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const item = await SubjectService.getById(req.schoolId!, req.params.id);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.put('/:id', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const item = await SubjectService.update(req.schoolId!, req.params.id, req.body);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.delete('/:id', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    await SubjectService.delete(req.schoolId!, req.params.id);
    res.json({ success: true, message: 'Subject deleted' });
  } catch (err) { next(err); }
});

export default router;
