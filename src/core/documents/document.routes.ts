import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { DocumentService } from './document.service';
import { upload, validateFileContent } from '../../middleware/upload.middleware';

const router = express.Router();

router.get('/', requirePermission('documents', 'read'), async (req, res, next) => {
  try {
    const docs = await DocumentService.getAll(req.schoolId!, req.query);
    res.json({ success: true, data: docs });
  } catch (error) { next(error); }
});

router.get('/:id', requirePermission('documents', 'read'), async (req, res, next) => {
  try {
    const doc = await DocumentService.getById(req.params.id, req.schoolId!);
    res.json({ success: true, data: doc });
  } catch (error) { next(error); }
});

router.post('/', requirePermission('documents', 'write'), upload, validateFileContent, async (req, res, next) => {
  try {
    const data = { ...req.body, schoolId: req.schoolId, uploadedBy: req.userId };
    const doc = await DocumentService.create(data, req.file);
    res.status(201).json({ success: true, data: doc });
  } catch (error) { next(error); }
});

router.post('/:id/set-active', requirePermission('documents', 'write'), async (req, res, next) => {
  try {
    const doc: any = await DocumentService.getById(req.params.id, req.schoolId!);
    const type = req.body?.type || doc.templateType;
    if (type !== 'report_card' && type !== 'receipt') {
      res.status(400).json({
        success: false,
        message: 'Document has no template type (report_card or receipt)',
      });
      return;
    }
    const updated = await DocumentService.setActiveTemplate(req.schoolId!, req.params.id, type);
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
});

router.delete('/:id', requirePermission('documents', 'delete'), async (req, res, next) => {
  try {
    await DocumentService.delete(req.params.id, req.schoolId!);
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) { next(error); }
});

export default router;
