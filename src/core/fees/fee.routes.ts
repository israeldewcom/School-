import express from 'express';
import { FeeController } from './fee.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

// --- Categories ---
// Register the more specific path BEFORE any :id style paths so that
// GET /fees/structures doesn't accidentally match /fees/:id.
router.get('/categories', requirePermission('fees', 'read'), FeeController.listCategories);
router.post('/categories', requirePermission('fees', 'write'), FeeController.createCategory);

// --- Structures ---
// Order matters: static routes first, then /:id.
router.get('/structures', requirePermission('fees', 'read'), FeeController.listStructures);
router.post('/structures', requirePermission('fees', 'write'), FeeController.createStructure);

// THIS is the route that was missing — it's why "View" showed "Not found".
router.get('/structures/:id', requirePermission('fees', 'read'), FeeController.getStructure);
router.put('/structures/:id', requirePermission('fees', 'write'), FeeController.updateStructure);
router.delete('/structures/:id', requirePermission('fees', 'write'), FeeController.deleteStructure);

export default router;
