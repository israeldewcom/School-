import express from 'express';
import { DefaultersController } from './defaulters.controller';
import { requirePermission } from '../../middleware/permission.middleware';

const router = express.Router();

router.get('/', requirePermission('payments', 'read'), DefaultersController.list);

export default router;
