import express from 'express';
import { SchoolController } from './school.controller';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validation.middleware';
import {
  createSchoolSchema,
  updateSchoolSchema,
  listSchoolsQuerySchema,
  schoolIdParamSchema,
} from './school.validator';

const router = express.Router();

// ================================================================
// ORDER MATTERS. Static paths MUST come before /:id params, or Express
// matches "current" as an :id and Mongoose CastErrors on the lookup.
// ================================================================

router.get(
  '/',
  requirePermission('school', 'read'),
  validate(listSchoolsQuerySchema),
  SchoolController.getSchools
);

router.get(
  '/current',
  requirePermission('school', 'read'),
  SchoolController.getCurrentSchool
);

router.put(
  '/current',
  requirePermission('school', 'write'),
  validate(updateSchoolSchema),
  SchoolController.updateCurrent
);

router.post(
  '/',
  requirePermission('school', 'write'),
  validate(createSchoolSchema),
  SchoolController.create
);

router.get(
  '/:id',
  requirePermission('school', 'read'),
  validate(schoolIdParamSchema),
  SchoolController.getSchool
);

router.put(
  '/:id',
  requirePermission('school', 'write'),
  validate(schoolIdParamSchema),
  validate(updateSchoolSchema),
  SchoolController.update
);

router.delete(
  '/:id',
  requirePermission('school', 'delete'),
  validate(schoolIdParamSchema),
  SchoolController.delete
);

export default router;
