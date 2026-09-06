import express from 'express';
import { ResultController } from './result.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('results', 'read'), ResultController.getResults);
router.get('/:id', requirePermission('results', 'read'), ResultController.getResult);
router.post('/', requirePermission('results', 'write'), ResultController.create);
router.put('/:id', requirePermission('results', 'write'), ResultController.update);
router.delete('/:id', requirePermission('results', 'delete'), ResultController.delete);

export default router;
