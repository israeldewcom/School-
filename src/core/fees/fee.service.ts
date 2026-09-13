import mongoose from 'mongoose';
import { FeeStructure } from '../../models/FeeStructure';
import { FeeCategory } from '../../models/FeeCategory';
import { Class } from '../../models/Class';
import { Session } from '../../models/Session';
import { Term } from '../../models/Term';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class FeeService {
  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------
  static async createCategory(schoolId: string, data: { name: string; description?: string }) {
    if (!data.name || !String(data.name).trim()) {
      throw new BadRequestError('Category name is required');
    }
    const existing = await FeeCategory.findOne({ schoolId, name: data.name.trim() });
    if (existing) throw new BadRequestError('A category with that name already exists');

    const category = new FeeCategory({
      schoolId,
      name: data.name.trim(),
      description: data.description?.trim() || '',
    });
    return category.save();
  }

  static async listCategories(schoolId: string) {
    return FeeCategory.find({ schoolId }).sort({ createdAt: 1 });
  }

  // ------------------------------------------------------------------
  // Structures
  // ------------------------------------------------------------------
  static async listStructures(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.classId && mongoose.isValidObjectId(query.classId)) filter.classId = query.classId;
    if (query.sessionId && mongoose.isValidObjectId(query.sessionId)) filter.sessionId = query.sessionId;
    if (query.termId && mongoose.isValidObjectId(query.termId)) filter.termId = query.termId;

    return FeeStructure.find(filter)
      .populate('classId', 'name fee')
      .populate('sessionId', 'name')
      .populate('termId', 'name')
      .populate('feeItems.categoryId', 'name')
      .sort({ createdAt: -1 });
  }

  // The endpoint that was missing — this is what /fees/structures/:id
  // calls. Was returning 404 because the route was never registered.
  static async getStructureById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid fee structure id');
    }
    const structure = await FeeStructure.findOne({ _id: id, schoolId })
      .populate('classId', 'name fee')
      .populate('sessionId', 'name')
      .populate('termId', 'name')
      .populate('feeItems.categoryId', 'name');
    if (!structure) throw new NotFoundError('Fee structure not found');
    return structure;
  }

  static async createStructure(schoolId: string, data: any) {
    return FeeService.upsertStructure(schoolId, null, data);
  }

  static async updateStructure(schoolId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid fee structure id');
    }
    return FeeService.upsertStructure(schoolId, id, data);
  }

  // Shared write path for create and update. Validates everything the
  // schema and business rules require BEFORE hitting the database so
  // we never surface a raw Mongoose error as a 500.
  private static async upsertStructure(schoolId: string, id: string | null, data: any) {
    if (!data.classId || !mongoose.isValidObjectId(data.classId)) {
      throw new BadRequestError('A valid classId is required');
    }
    if (!data.sessionId || !mongoose.isValidObjectId(data.sessionId)) {
      throw new BadRequestError('A valid sessionId is required');
    }
    if (!data.termId || !mongoose.isValidObjectId(data.termId)) {
      throw new BadRequestError('A valid termId is required');
    }

    // Verify referenced documents actually exist. Without this check
    // a bogus ObjectId sails through validation and only fails on
    // populate, which historically produced confusing errors.
    const [cls, session, term] = await Promise.all([
      Class.findOne({ _id: data.classId, schoolId }),
      Session.findOne({ _id: data.sessionId, schoolId }),
      Term.findOne({ _id: data.termId, schoolId }),
    ]);
    if (!cls) throw new BadRequestError('Class not found');
    if (!session) throw new BadRequestError('Session not found');
    if (!term) throw new BadRequestError('Term not found');

    if (!Array.isArray(data.feeItems) || data.feeItems.length === 0) {
      throw new BadRequestError('At least one fee item is required');
    }

    // Normalize each item. categoryId is now optional — only include
    // it when it's a valid ObjectId.
    const cleanItems: any[] = [];
    let total = 0;
    for (const raw of data.feeItems) {
      const description = String(raw?.description || raw?.name || '').trim();
      const amount = Number(raw?.amount);
      if (!description) {
        throw new BadRequestError('Every fee item needs a name');
      }
      if (!Number.isFinite(amount) || amount < 0) {
        throw new BadRequestError(`Invalid amount for "${description}"`);
      }
      const item: any = { description, amount };
      if (raw.categoryId && mongoose.isValidObjectId(raw.categoryId)) {
        item.categoryId = raw.categoryId;
      }
      cleanItems.push(item);
      total += amount;
    }

    if (id) {
      const updated = await FeeStructure.findOneAndUpdate(
        { _id: id, schoolId },
        { ...data, feeItems: cleanItems, totalAmount: total },
        { new: true, runValidators: true }
      )
        .populate('classId', 'name fee')
        .populate('sessionId', 'name')
        .populate('termId', 'name')
        .populate('feeItems.categoryId', 'name');
      if (!updated) throw new NotFoundError('Fee structure not found');
      return updated;
    }

    const structure = new FeeStructure({
      ...data,
      schoolId,
      feeItems: cleanItems,
      totalAmount: total,
    });
    await structure.save();
    return FeeStructure.findById(structure._id)
      .populate('classId', 'name fee')
      .populate('sessionId', 'name')
      .populate('termId', 'name')
      .populate('feeItems.categoryId', 'name');
  }

  static async deleteStructure(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid fee structure id');
    }
    const deleted = await FeeStructure.findOneAndDelete({ _id: id, schoolId });
    if (!deleted) throw new NotFoundError('Fee structure not found');
    return deleted;
  }
}
