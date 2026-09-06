import express from 'express';
import { ParentController } from './parent.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('parents', 'read'), ParentController.getParents);
router.get('/:id', requirePermission('parents', 'read'), ParentController.getParent);
router.post('/', requirePermission('parents', 'write'), ParentController.create);
router.put('/:id', requirePermission('parents', 'write'), ParentController.update);
router.delete('/:id', requirePermission('parents', 'delete'), ParentController.delete);

export default router;
