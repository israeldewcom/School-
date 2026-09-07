import { SchoolDocument } from '../../models/Document';
import { NotFoundError } from '../../utils/errors';
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
}
