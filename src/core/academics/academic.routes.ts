// src/core/academics/academic.routes.ts
import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { SubjectService } from './subject.service';
import { Session } from '../../models/Session';
import { Term } from '../../models/Term';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import mongoose from 'mongoose';

const router = express.Router();

// ==================================================================
// SESSIONS
// ==================================================================
router.get('/sessions', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const sessions = await Session.find({ schoolId: req.schoolId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
});

router.post('/sessions', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const { name, startDate, endDate, isActive } = req.body || {};
    if (!name || !String(name).trim()) {
      throw new BadRequestError('Session name is required');
    }
    const session = new Session({
      schoolId: req.schoolId,
      name: String(name).trim(),
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      isActive: isActive !== false,
    });
    await session.save();

    // If this session is marked active, deactivate the others so
    // there's only ever one active session.
    if (session.isActive) {
      await Session.updateMany(
        { schoolId: req.schoolId, _id: { $ne: session._id } },
        { $set: { isActive: false } }
      );
    }
    res.status(201).json({ success: true, data: session });
  } catch (err) { next(err); }
});

router.get('/sessions/:id', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new BadRequestError('Invalid session id');
    }
    const session = await Session.findOne({
      _id: req.params.id,
      schoolId: req.schoolId,
    });
    if (!session) throw new NotFoundError('Session not found');
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
});

// ==================================================================
// TERMS
// ==================================================================
router.get('/terms', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const filter: any = { schoolId: req.schoolId };
    if (req.query.sessionId && mongoose.isValidObjectId(req.query.sessionId)) {
      filter.sessionId = req.query.sessionId;
    }
    const terms = await Term.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: terms });
  } catch (err) { next(err); }
});

router.post('/terms', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const { name, sessionId, startDate, endDate, isActive } = req.body || {};
    if (!name || !String(name).trim()) {
      throw new BadRequestError('Term name is required');
    }
    if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
      throw new BadRequestError('A valid sessionId is required');
    }
    const session = await Session.findOne({ _id: sessionId, schoolId: req.schoolId });
    if (!session) throw new BadRequestError('Session not found');

    const term = new Term({
      schoolId: req.schoolId,
      sessionId,
      name: String(name).trim(),
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      isActive: isActive !== false,
    });
    await term.save();

    // Only one active term per school.
    if (term.isActive) {
      await Term.updateMany(
        { schoolId: req.schoolId, _id: { $ne: term._id } },
        { $set: { isActive: false } }
      );
    }
    res.status(201).json({ success: true, data: term });
  } catch (err) { next(err); }
});

router.get('/terms/:id', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new BadRequestError('Invalid term id');
    }
    const term = await Term.findOne({ _id: req.params.id, schoolId: req.schoolId });
    if (!term) throw new NotFoundError('Term not found');
    res.json({ success: true, data: term });
  } catch (err) { next(err); }
});

// ==================================================================
// SUBJECTS
//
// The frontend calls these three routes:
//   GET    /academics/subjects            → list (optionally ?classId=X)
//   GET    /academics/subjects/:id        → single
//   POST   /academics/subjects            → create
//   PUT    /academics/subjects/:id        → update
//   DELETE /academics/subjects/:id        → delete
//
// Every call site passes `req.schoolId` because these routes are behind
// auth middleware. That matches the first overload of the service
// methods, so the build compiles.
// ==================================================================

router.get('/subjects', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const subjects = await SubjectService.list(req.schoolId!, req.query);
    res.json({ success: true, data: subjects });
  } catch (err) { next(err); }
});

router.get('/subjects/:id', requirePermission('academics', 'read'), async (req, res, next) => {
  try {
    const subject = await SubjectService.getById(req.schoolId!, req.params.id);
    res.json({ success: true, data: subject });
  } catch (err) { next(err); }
});

router.post('/subjects', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const subject = await SubjectService.create(req.schoolId!, req.body);
    res.status(201).json({ success: true, data: subject });
  } catch (err) { next(err); }
});

router.put('/subjects/:id', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    const subject = await SubjectService.update(
      req.schoolId!,
      req.params.id,
      req.body
    );
    res.json({ success: true, data: subject });
  } catch (err) { next(err); }
});

router.delete('/subjects/:id', requirePermission('academics', 'write'), async (req, res, next) => {
  try {
    await SubjectService.delete(req.schoolId!, req.params.id);
    res.json({ success: true, message: 'Subject deleted' });
  } catch (err) { next(err); }
});

export default router;
