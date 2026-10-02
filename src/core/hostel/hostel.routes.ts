// src/core/hostel/hostel.routes.ts
import express from 'express';
import { requirePermission } from '../../middleware/permission.middleware';
import { handle } from '../../utils/handler';
import { HostelService } from './hostel.service';

const router = express.Router();

// Hostels (admins create and edit; managers see their own)
router.get('/hostels', requirePermission('hostel', 'read'), handle((req, scope) => HostelService.listHostels(req.schoolId!, scope)));
router.post('/hostels', requirePermission('hostel', 'manage'), handle((req) => HostelService.createHostel(req.schoolId!, req.body), 201));
router.put('/hostels/:id', requirePermission('hostel', 'manage'), handle((req) => HostelService.updateHostel(req.schoolId!, req.params.id, req.body)));

// Rooms
router.get('/hostels/:id/rooms', requirePermission('hostel', 'read'), handle((req, scope) => HostelService.listRooms(req.schoolId!, scope, req.params.id)));
router.post('/hostels/:id/rooms', requirePermission('hostel', 'manage'), handle((req) => HostelService.createRoom(req.schoolId!, req.params.id, req.body), 201));

// Beds
router.get('/allocations', requirePermission('hostel', 'read'), handle((req, scope) => HostelService.listAllocations(req.schoolId!, scope, req.query)));
router.post('/allocations', requirePermission('hostel', 'write'), handle((req, scope) => HostelService.allocate(req.schoolId!, scope, req.body), 201));
router.post('/allocations/:id/checkout', requirePermission('hostel', 'write'), handle((req, scope) => HostelService.checkout(req.schoolId!, scope, req.params.id)));

// Roll call
router.get('/hostels/:id/rollcall', requirePermission('hostel', 'read'), handle((req, scope) => HostelService.getRollCall(req.schoolId!, scope, req.params.id, req.query)));
router.put('/hostels/:id/rollcall', requirePermission('hostel', 'write'), handle((req, scope) => HostelService.saveRollCall(req.schoolId!, scope, req.params.id, req.body)));

export default router;
