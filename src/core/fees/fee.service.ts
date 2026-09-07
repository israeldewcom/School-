import { FeeCategory } from '../../models/FeeCategory';
import { FeeStructure } from '../../models/FeeStructure';
import { NotFoundError } from '../../utils/errors';

export class FeeService {
  // FeeCategory CRUD
  static async createCategory(data: any) {
    const cat = new FeeCategory(data);
    await cat.save();
    return cat;
  }
  static async getCategories(schoolId: string, query: any) {
    return FeeCategory.find({ schoolId, ...query });
  }
  static async updateCategory(id: string, schoolId: string, data: any) {
    const cat = await FeeCategory.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!cat) throw new NotFoundError('Category not found');
    return cat;
  }
  static async deleteCategory(id: string, schoolId: string) {
    const cat = await FeeCategory.findOneAndDelete({ _id: id, schoolId });
    if (!cat) throw new NotFoundError('Category not found');
    return cat;
  }

  // FeeStructure CRUD
  static async createStructure(data: any) {
    const structure = new FeeStructure(data);
    await structure.save();
    return structure;
  }
  static async getStructures(schoolId: string, query: any) {
    return FeeStructure.find({ schoolId, ...query }).populate('sessionId termId classId feeItems.categoryId');
  }
  static async updateStructure(id: string, schoolId: string, data: any) {
    const structure = await FeeStructure.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!structure) throw new NotFoundError('Fee structure not found');
    return structure;
  }
  static async deleteStructure(id: string, schoolId: string) {
    const structure = await FeeStructure.findOneAndDelete({ _id: id, schoolId });
    if (!structure) throw new NotFoundError('Fee structure not found');
    return structure;
  }
}
