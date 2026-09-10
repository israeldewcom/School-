import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { NotFoundError } from '../../utils/errors';

export class ReportCardTemplateService {
  static async create(schoolId: string, data: any) {
    if (data.isDefault) {
      await ReportCardTemplate.updateMany({ schoolId, isDefault: true }, { isDefault: false });
    }
    const template = new ReportCardTemplate({ ...data, schoolId });
    await template.save();
    return template;
  }

  static async getAll(schoolId: string) {
    return ReportCardTemplate.find({ schoolId }).sort({ createdAt: -1 });
  }

  static async getById(id: string, schoolId: string) {
    const template = await ReportCardTemplate.findOne({ _id: id, schoolId });
    if (!template) throw new NotFoundError('Template not found');
    return template;
  }

  static async update(id: string, schoolId: string, data: any) {
    if (data.isDefault) {
      await ReportCardTemplate.updateMany({ schoolId, isDefault: true, _id: { $ne: id } }, { isDefault: false });
    }
    const template = await ReportCardTemplate.findOneAndUpdate(
      { _id: id, schoolId },
      { ...data, $inc: { version: 1 } },
      { new: true }
    );
    if (!template) throw new NotFoundError('Template not found');
    return template;
  }

  static async setDefault(id: string, schoolId: string) {
    await ReportCardTemplate.updateMany({ schoolId, isDefault: true }, { isDefault: false });
    const template = await ReportCardTemplate.findOneAndUpdate(
      { _id: id, schoolId },
      { isDefault: true },
      { new: true }
    );
    if (!template) throw new NotFoundError('Template not found');
    return template;
  }

  static async delete(id: string, schoolId: string) {
    const template = await ReportCardTemplate.findOneAndDelete({ _id: id, schoolId });
    if (!template) throw new NotFoundError('Template not found');
    return template;
  }
}
