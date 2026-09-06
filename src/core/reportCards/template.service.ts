import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { NotFoundError } from '../../utils/errors';

export class TemplateService {
  static async create(data: any) {
    const template = new ReportCardTemplate(data);
    await template.save();
    return template;
  }

  static async getById(id: string, schoolId: string) {
    const template = await ReportCardTemplate.findOne({ _id: id, schoolId });
    if (!template) throw new NotFoundError('Template not found');
    return template;
  }

  static async getAll(schoolId: string, query: any) {
    return ReportCardTemplate.find({ schoolId, ...query });
  }

  static async update(id: string, schoolId: string, data: any) {
    const template = await ReportCardTemplate.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!template) throw new NotFoundError('Template not found');
    return template;
  }

  static async delete(id: string, schoolId: string) {
    const template = await ReportCardTemplate.findOneAndDelete({ _id: id, schoolId });
    if (!template) throw new NotFoundError('Template not found');
    return template;
  }
}
