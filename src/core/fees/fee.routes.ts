import express from 'express';
import { FeeController } from './fee.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

// Categories
router.get('/categories', requirePermission('fees', 'read'), FeeController.getCategories);
router.post('/categories', requirePermission('fees', 'write'), FeeController.createCategory);
router.put('/categories/:id', requirePermission('fees', 'write'), FeeController.updateCategory);
router.delete('/categories/:id', requirePermission('fees', 'delete'), FeeController.deleteCategory);

// Structures
router.get('/structures', requirePermission('fees', 'read'), FeeController.getStructures);
router.post('/structures', requirePermission('fees', 'write'), FeeController.createStructure);
router.put('/structures/:id', requirePermission('fees', 'write'), FeeController.updateStructure);
router.delete('/structures/:id', requirePermission('fees', 'delete'), FeeController.deleteStructure);

export default router;
