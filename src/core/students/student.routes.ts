import express from 'express';
import { StudentController } from './student.controller';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createStudentSchema, updateStudentSchema } from './student.validator';

const router = express.Router();

router.get('/', requirePermission('students', 'read'), StudentController.getStudents);
router.get('/:id', requirePermission('students', 'read'), StudentController.getStudent);
router.post('/', requirePermission('students', 'write'), validate(createStudentSchema), StudentController.create);
router.put('/:id', requirePermission('students', 'write'), validate(updateStudentSchema), StudentController.update);
router.delete('/:id', requirePermission('students', 'delete'), StudentController.delete);

export default router;
