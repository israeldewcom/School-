import { SchoolDocument } from '../../models/Document';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { cloudinary } from '../../integrations/storage/cloudinary';

export class DocumentService {
  static async create(data: any, file: any) {
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      folder: `schools/${data.schoolId}/documents`,
    });
    const doc = new SchoolDocument({
      ...data,
      fileUrl: result.secure_url,
      mimeType: file.mimetype,
      size: file.size,
      templateType: data.templateType || null,
      isActiveTemplate: false,
    });
    await doc.save();
    return doc;
  }

  static async getById(id: string, schoolId: string) {
    const doc = await SchoolDocument.findOne({ _id: id, schoolId });
    if (!doc) throw new NotFoundError('Document not found');
    return doc;
  }

  static async getAll(schoolId: string, query: any) {
    return SchoolDocument.find({ schoolId, ...query });
  }

  static async delete(id: string, schoolId: string) {
    const doc = await SchoolDocument.findOneAndDelete({ _id: id, schoolId });
    if (!doc) throw new NotFoundError('Document not found');
    // Optionally delete from Cloudinary
    return doc;
  }

  // NEW template methods
  static async setActiveTemplate(schoolId: string, docId: string, type: 'report_card' | 'receipt') {
    // Deactivate all templates of same type
    await SchoolDocument.updateMany(
      { schoolId, templateType: type, isActiveTemplate: true },
      { isActiveTemplate: false }
    );
    // Activate chosen one
    const doc = await SchoolDocument.findOneAndUpdate(
      { _id: docId, schoolId, templateType: type },
      { isActiveTemplate: true },
      { new: true }
    );
    if (!doc) throw new NotFoundError('Document not found');
    return doc;
  }

  static async getActiveTemplate(schoolId: string, type: 'report_card' | 'receipt') {
    return SchoolDocument.findOne({ schoolId, templateType: type, isActiveTemplate: true });
  }
}
