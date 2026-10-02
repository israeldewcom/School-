import express from 'express';
import { StudentController } from './student.controller';
import { requirePermission } from '../../middleware/permission.middleware';
import { validate } from '../../middleware/validation.middleware';
import { createStudentSchema, updateStudentSchema } from './student.validator';
import { uploadField, validateFileContent } from '../../middleware/upload.middleware';

const router = express.Router();

router.get('/', requirePermission('students', 'read'), StudentController.getStudents);
// Upload a passport photo before the student exists (data capture form) -> { url }
router.post('/photo', requirePermission('students', 'write'), StudentController.uploadPhoto);
router.get('/:id', requirePermission('students', 'read'), StudentController.getStudent);
// Set/replace a student's photo: JSON { photo: "data:image/jpeg;base64,..." } or multipart field "photo"
router.post('/:id/photo', requirePermission('students', 'write'), uploadField('photo'), validateFileContent, StudentController.setPhoto);
router.post('/', requirePermission('students', 'write'), validate(createStudentSchema), StudentController.create);
router.put('/:id', requirePermission('students', 'write'), validate(updateStudentSchema), StudentController.update);
router.delete('/:id', requirePermission('students', 'delete'), StudentController.delete);

export default router;
