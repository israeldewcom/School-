import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { SessionService } from './session.service';
import { TermService } from './term.service';
import { SubjectService } from './subject.service';

const router = express.Router();

// Sessions
router.get('/sessions', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const sessions = await SessionService.getAll(req.schoolId!, req.query);
    res.json({ success: true, data: sessions });
  } catch (error) { next(error); }
});
router.post('/sessions', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const data = { ...req.body, schoolId: req.schoolId };
    const session = await SessionService.create(data);
    res.status(201).json({ success: true, data: session });
  } catch (error) { next(error); }
});
router.put('/sessions/:id', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const session = await SessionService.update(req.params.id, req.schoolId!, req.body);
    res.json({ success: true, data: session });
  } catch (error) { next(error); }
});
router.delete('/sessions/:id', requirePermission('academics', 'delete'), async (req, res, next) => {
  try {
    await SessionService.delete(req.params.id, req.schoolId!);
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) { next(error); }
});

// Terms
router.get('/terms', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const terms = await TermService.getAll(req.schoolId!, req.query);
    res.json({ success: true, data: terms });
  } catch (error) { next(error); }
});
router.post('/terms', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const data = { ...req.body, schoolId: req.schoolId };
    const term = await TermService.create(data);
    res.status(201).json({ success: true, data: term });
  } catch (error) { next(error); }
});
router.put('/terms/:id', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const term = await TermService.update(req.params.id, req.schoolId!, req.body);
    res.json({ success: true, data: term });
  } catch (error) { next(error); }
});
router.delete('/terms/:id', requirePermission('academics', 'delete'), async (req, res, next) => {
  try {
    await TermService.delete(req.params.id, req.schoolId!);
    res.json({ success: true, message: 'Term deleted' });
  } catch (error) { next(error); }
});

// Subjects
router.get('/subjects', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const subjects = await SubjectService.getAll(req.schoolId!, req.query);
    res.json({ success: true, data: subjects });
  } catch (error) { next(error); }
});
router.post('/subjects', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const data = { ...req.body, schoolId: req.schoolId };
    const subject = await SubjectService.create(data);
    res.status(201).json({ success: true, data: subject });
  } catch (error) { next(error); }
});
router.put('/subjects/:id', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const subject = await SubjectService.update(req.params.id, req.schoolId!, req.body);
    res.json({ success: true, data: subject });
  } catch (error) { next(error); }
});
router.delete('/subjects/:id', requirePermission('academics', 'delete'), async (req, res, next) => {
  try {
    await SubjectService.delete(req.params.id, req.schoolId!);
    res.json({ success: true, message: 'Subject deleted' });
  } catch (error) { next(error); }
});

export default router;
