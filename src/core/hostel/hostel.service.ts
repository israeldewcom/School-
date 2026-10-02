// src/core/hostel/hostel.service.ts
import mongoose from 'mongoose';
import { Hostel } from '../../models/Hostel';
import { HostelRoom } from '../../models/HostelRoom';
import { HostelAllocation } from '../../models/HostelAllocation';
import { HostelRollCall } from '../../models/HostelRollCall';
import { Student } from '../../models/Student';
import { School } from '../../models/School';
import { UserScope } from '../../middleware/scope.middleware';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../middleware/error.middleware';
import { oid, optOid, text } from '../../utils/validate';

const GENDERS = ['BOYS', 'GIRLS', 'MIXED'];
const ROLL_STATUSES = ['PRESENT', 'ABSENT', 'ON_LEAVE', 'SICK'];

function dupe(err: any, message: string): never {
  if (err && err.code === 11000) throw new ConflictError(message);
  throw err;
}

function dayStart(value?: any): Date {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) throw new BadRequestError('Invalid date');
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function shapeHostel(h: any, extra: any = {}) {
  return {
    id: String(h._id),
    name: h.name,
    gender: h.gender,
    managerId: h.managerId ? String(h.managerId) : null,
    feePerTerm: h.feePerTerm || 0,
    description: h.description || '',
    isActive: h.isActive !== false,
    ...extra,
  };
}

// A hostel manager only sees hostels assigned to them. Admins see all.
async function loadHostel(schoolId: string, scope: UserScope, id: string): Promise<any> {
  oid(id, 'hostelId');
  const h: any = await Hostel.findOne({ _id: id, schoolId }).lean();
  if (!h) throw new NotFoundError('Hostel not found');
  if (scope.role === 'HOSTEL_MANAGER' && String(h.managerId || '') !== String(scope.userId)) {
    throw new ForbiddenError('This is not your hostel.');
  }
  return h;
}

export class HostelService {
  static async listHostels(schoolId: string, scope: UserScope) {
    const sid = new mongoose.Types.ObjectId(schoolId);
    const filter: any = { schoolId };
    if (scope.role === 'HOSTEL_MANAGER') filter.managerId = scope.userId;

    const [hostels, rooms, beds]: any[] = await Promise.all([
      Hostel.find(filter).sort({ name: 1 }).lean(),
      HostelRoom.aggregate([
        { $match: { schoolId: sid, isActive: true } },
        { $group: { _id: '$hostelId', rooms: { $sum: 1 }, capacity: { $sum: '$capacity' } } },
      ]),
      HostelAllocation.aggregate([
        { $match: { schoolId: sid, status: 'ACTIVE' } },
        { $group: { _id: '$hostelId', occupied: { $sum: 1 } } },
      ]),
    ]);
    const roomBy = new Map<string, any>(rooms.map((r: any) => [String(r._id), r]));
    const occBy = new Map<string, number>(beds.map((b: any) => [String(b._id), b.occupied]));
    return hostels.map((h: any) =>
      shapeHostel(h, {
        rooms: roomBy.get(String(h._id))?.rooms || 0,
        capacity: roomBy.get(String(h._id))?.capacity || 0,
        occupied: occBy.get(String(h._id)) || 0,
      })
    );
  }

  static async createHostel(schoolId: string, data: any) {
    const gender = String(data?.gender || 'MIXED').toUpperCase();
    if (!GENDERS.includes(gender)) throw new BadRequestError('gender must be BOYS, GIRLS or MIXED');
    const fee = data?.feePerTerm === undefined ? 0 : Number(data.feePerTerm);
    if (!Number.isFinite(fee) || fee < 0) throw new BadRequestError('feePerTerm must be 0 or more');
    try {
      const h: any = await Hostel.create({
        schoolId,
        name: text(data?.name, 'Name', { max: 100 }),
        gender,
        managerId: optOid(data?.managerId, 'managerId'),
        feePerTerm: fee,
        description: text(data?.description, 'Description', { required: false, max: 500 }) || undefined,
      });
      return shapeHostel(h.toObject());
    } catch (err) {
      return dupe(err, 'A hostel with that name already exists.');
    }
  }

  static async updateHostel(schoolId: string, id: string, data: any) {
    oid(id, 'id');
    const h: any = await Hostel.findOne({ _id: id, schoolId });
    if (!h) throw new NotFoundError('Hostel not found');
    if (data?.name !== undefined) h.name = text(data.name, 'Name', { max: 100 });
    if (data?.gender !== undefined) {
      const g = String(data.gender).toUpperCase();
      if (!GENDERS.includes(g)) throw new BadRequestError('gender must be BOYS, GIRLS or MIXED');
      h.gender = g;
    }
    if (data?.managerId !== undefined) h.managerId = data.managerId ? optOid(data.managerId, 'managerId') : undefined;
    if (data?.feePerTerm !== undefined) {
      const fee = Number(data.feePerTerm);
      if (!Number.isFinite(fee) || fee < 0) throw new BadRequestError('feePerTerm must be 0 or more');
      h.feePerTerm = fee;
    }
    if (data?.description !== undefined) h.description = String(data.description).slice(0, 500);
    if (data?.isActive !== undefined) h.isActive = !!data.isActive;
    try {
      await h.save();
    } catch (err) {
      return dupe(err, 'A hostel with that name already exists.');
    }
    return shapeHostel(h.toObject());
  }

  // ---------------- Rooms ----------------
  static async listRooms(schoolId: string, scope: UserScope, hostelId: string) {
    await loadHostel(schoolId, scope, hostelId);
    const [rooms, beds]: any[] = await Promise.all([
      HostelRoom.find({ schoolId, hostelId }).sort({ roomNumber: 1 }).lean(),
      HostelAllocation.aggregate([
        { $match: { schoolId: new mongoose.Types.ObjectId(schoolId), hostelId: new mongoose.Types.ObjectId(hostelId), status: 'ACTIVE' } },
        { $group: { _id: '$roomId', occupied: { $sum: 1 } } },
      ]),
    ]);
    const occBy = new Map<string, number>(beds.map((b: any) => [String(b._id), b.occupied]));
    return rooms.map((r: any) => ({
      id: String(r._id),
      hostelId: String(r.hostelId),
      roomNumber: r.roomNumber,
      floor: r.floor ?? null,
      capacity: r.capacity,
      occupied: occBy.get(String(r._id)) || 0,
      isActive: r.isActive !== false,
    }));
  }

  static async createRoom(schoolId: string, hostelId: string, data: any) {
    oid(hostelId, 'hostelId');
    const hostel = await Hostel.findOne({ _id: hostelId, schoolId }).select('_id').lean();
    if (!hostel) throw new NotFoundError('Hostel not found');
    const capacity = Number(data?.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
      throw new BadRequestError('capacity must be a whole number from 1 to 100');
    }
    try {
      const r: any = await HostelRoom.create({
        schoolId,
        hostelId,
        roomNumber: text(data?.roomNumber, 'Room number', { max: 30 }),
        floor: data?.floor === undefined || data.floor === '' ? undefined : Number(data.floor),
        capacity,
      });
      return { id: String(r._id), hostelId, roomNumber: r.roomNumber, floor: r.floor ?? null, capacity: r.capacity, occupied: 0, isActive: true };
    } catch (err) {
      return dupe(err, 'That room number already exists in this hostel.');
    }
  }

  // ---------------- Allocations ----------------
  static async listAllocations(schoolId: string, scope: UserScope, query: any = {}) {
    const filter: any = { schoolId, status: String(query.status || 'ACTIVE').toUpperCase() };
    const hostelId = optOid(query.hostelId, 'hostelId');
    if (hostelId) {
      await loadHostel(schoolId, scope, hostelId);
      filter.hostelId = hostelId;
    } else if (scope.role === 'HOSTEL_MANAGER') {
      const mine: any[] = await Hostel.find({ schoolId, managerId: scope.userId }).select('_id').lean();
      filter.hostelId = { $in: mine.map((h: any) => h._id) };
    }
    const rows: any[] = await HostelAllocation.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const [students, rooms, hostels]: any[] = await Promise.all([
      Student.find({ _id: { $in: rows.map((r: any) => r.studentId) } }).select('fullName firstName lastName admissionNumber').lean(),
      HostelRoom.find({ _id: { $in: rows.map((r: any) => r.roomId) } }).select('roomNumber').lean(),
      Hostel.find({ _id: { $in: rows.map((r: any) => r.hostelId) } }).select('name').lean(),
    ]);
    const sBy = new Map<string, any>(students.map((s: any) => [String(s._id), s]));
    const rBy = new Map<string, any>(rooms.map((r: any) => [String(r._id), r]));
    const hBy = new Map<string, any>(hostels.map((h: any) => [String(h._id), h]));
    return rows.map((a: any) => {
      const s = sBy.get(String(a.studentId));
      return {
        id: String(a._id),
        studentId: String(a.studentId),
        studentName: s ? s.fullName || `${s.firstName || ''} ${s.lastName || ''}`.trim() : 'Unknown',
        admissionNumber: s?.admissionNumber || '',
        hostelId: String(a.hostelId),
        hostelName: hBy.get(String(a.hostelId))?.name || '',
        roomId: String(a.roomId),
        roomNumber: rBy.get(String(a.roomId))?.roomNumber || '',
        bedNumber: a.bedNumber ?? null,
        status: a.status,
        checkInDate: a.checkInDate,
        checkOutDate: a.checkOutDate || null,
        feeAmount: a.feeAmount || 0,
        notes: a.notes || '',
      };
    });
  }

  static async allocate(schoolId: string, scope: UserScope, data: any) {
    const studentId = oid(data?.studentId, 'studentId');
    const roomId = oid(data?.roomId, 'roomId');
    const room: any = await HostelRoom.findOne({ _id: roomId, schoolId, isActive: true }).lean();
    if (!room) throw new NotFoundError('Room not found');
    const hostel = await loadHostel(schoolId, scope, String(room.hostelId));
    if (hostel.isActive === false) throw new BadRequestError('This hostel is not active.');

    const student = await Student.findOne({ _id: studentId, schoolId, status: 'ACTIVE' }).select('_id').lean();
    if (!student) throw new BadRequestError('Active student not found.');

    const occupied = await HostelAllocation.countDocuments({ roomId, status: 'ACTIVE' });
    if (occupied >= room.capacity) throw new ConflictError('This room is full.');

    let bedNumber: number | undefined;
    if (data?.bedNumber !== undefined && data.bedNumber !== '') {
      bedNumber = Number(data.bedNumber);
      if (!Number.isInteger(bedNumber) || bedNumber < 1 || bedNumber > room.capacity) {
        throw new BadRequestError(`bedNumber must be between 1 and ${room.capacity}`);
      }
    }
    const school: any = await School.findById(schoolId).select('currentSessionId currentTermId').lean();
    try {
      const a: any = await HostelAllocation.create({
        schoolId,
        studentId,
        hostelId: room.hostelId,
        roomId,
        bedNumber,
        sessionId: school?.currentSessionId || undefined,
        termId: school?.currentTermId || undefined,
        feeAmount: hostel.feePerTerm || 0,
        notes: data?.notes ? String(data.notes).slice(0, 500) : undefined,
        allocatedBy: scope.userId,
      });
      return { id: String(a._id), studentId, roomId, hostelId: String(room.hostelId), bedNumber: a.bedNumber ?? null, status: a.status };
    } catch (err) {
      return dupe(err, 'That student already has a bed, or that bed is taken.');
    }
  }

  static async checkout(schoolId: string, scope: UserScope, id: string) {
    oid(id, 'id');
    const a: any = await HostelAllocation.findOne({ _id: id, schoolId });
    if (!a) throw new NotFoundError('Allocation not found');
    await loadHostel(schoolId, scope, String(a.hostelId));
    if (a.status === 'CHECKED_OUT') throw new BadRequestError('Already checked out.');
    a.status = 'CHECKED_OUT';
    a.checkOutDate = new Date();
    a.checkedOutBy = scope.userId as any;
    await a.save();
    return { id: String(a._id), status: a.status, checkOutDate: a.checkOutDate };
  }

  // ---------------- Roll call ----------------
  static async getRollCall(schoolId: string, scope: UserScope, hostelId: string, query: any = {}) {
    await loadHostel(schoolId, scope, hostelId);
    const date = dayStart(query.date);
    const type = String(query.type || 'NIGHT').toUpperCase() === 'MORNING' ? 'MORNING' : 'NIGHT';

    const [residents, saved]: any[] = await Promise.all([
      HostelAllocation.find({ schoolId, hostelId, status: 'ACTIVE' }).lean(),
      HostelRollCall.findOne({ schoolId, hostelId, date, type }).lean(),
    ]);
    const [students, rooms]: any[] = await Promise.all([
      Student.find({ _id: { $in: residents.map((r: any) => r.studentId) } }).select('fullName firstName lastName admissionNumber').lean(),
      HostelRoom.find({ _id: { $in: residents.map((r: any) => r.roomId) } }).select('roomNumber').lean(),
    ]);
    const sBy = new Map<string, any>(students.map((s: any) => [String(s._id), s]));
    const rBy = new Map<string, any>(rooms.map((r: any) => [String(r._id), r]));
    const savedBy = new Map<string, any>(((saved && saved.records) || []).map((r: any) => [String(r.studentId), r]));

    const rows = residents.map((r: any) => {
      const s = sBy.get(String(r.studentId));
      const rec = savedBy.get(String(r.studentId));
      return {
        studentId: String(r.studentId),
        name: s ? s.fullName || `${s.firstName || ''} ${s.lastName || ''}`.trim() : 'Unknown',
        admissionNumber: s?.admissionNumber || '',
        roomNumber: rBy.get(String(r.roomId))?.roomNumber || '',
        status: rec ? rec.status : 'PRESENT',
        note: rec?.note || '',
      };
    });
    rows.sort((a: any, b: any) => a.roomNumber.localeCompare(b.roomNumber) || a.name.localeCompare(b.name));
    return { hostelId, date, type, saved: !!saved, rows };
  }

  static async saveRollCall(schoolId: string, scope: UserScope, hostelId: string, data: any) {
    await loadHostel(schoolId, scope, hostelId);
    const date = dayStart(data?.date);
    const type = String(data?.type || 'NIGHT').toUpperCase() === 'MORNING' ? 'MORNING' : 'NIGHT';
    if (!Array.isArray(data?.records) || data.records.length === 0) throw new BadRequestError('records are required');

    const residents: any[] = await HostelAllocation.find({ schoolId, hostelId, status: 'ACTIVE' }).select('studentId').lean();
    const allowed = new Set<string>(residents.map((r: any) => String(r.studentId)));
    const records = data.records
      .filter((r: any) => allowed.has(String(r.studentId)))
      .map((r: any) => {
        const status = String(r.status || 'PRESENT').toUpperCase();
        if (!ROLL_STATUSES.includes(status)) throw new BadRequestError(`status must be one of ${ROLL_STATUSES.join(', ')}`);
        return { studentId: r.studentId, status, note: r.note ? String(r.note).slice(0, 200) : undefined };
      });
    if (records.length === 0) throw new BadRequestError('None of those students live in this hostel.');

    await HostelRollCall.findOneAndUpdate(
      { schoolId, hostelId, date, type },
      { $set: { records, takenBy: scope.userId } },
      { upsert: true, new: true }
    );
    return { saved: records.length, absent: records.filter((r: any) => r.status === 'ABSENT').length };
  }
}
