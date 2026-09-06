import { Student } from '../../models/Student';
import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors';

export class StudentService {
  static async create(data: any) {
    // Check entitlement: maxStudents
    const school = await School.findById(data.schoolId);
    if (!school) throw new NotFoundError('School not found');

    const subscription = await Subscription.findOne({ schoolId: data.schoolId, status: 'ACTIVE' });
    if (subscription) {
      const plan = await SubscriptionPlan.findById(subscription.planId);
      if (plan) {
        const studentCount = await Student.countDocuments({ schoolId: data.schoolId, status: 'ACTIVE' });
        if (studentCount >= plan.entitlements.maxStudents) {
          throw new ForbiddenError('Student limit reached for your plan. Please upgrade.');
        }
      }
    }

    const existing = await Student.findOne({ schoolId: data.schoolId, admissionNumber: data.admissionNumber });
    if (existing) throw new BadRequestError('Admission number already exists');

    const student = new Student(data);
    await student.save();
    return student;
  }

  static async getById(id: string, schoolId: string) {
    const student = await Student.findOne({ _id: id, schoolId }).populate('classId parentIds');
    if (!student) throw new NotFoundError('Student not found');
    return student;
  }

  static async getAll(schoolId: string, query: any) {
    return Student.find({ schoolId, ...query }).populate('classId');
  }

  static async update(id: string, schoolId: string, data: any) {
    const student = await Student.findOneAndUpdate({ _id: id, schoolId }, data, { new: true });
    if (!student) throw new NotFoundError('Student not found');
    return student;
  }

  static async delete(id: string, schoolId: string) {
    const student = await Student.findOneAndDelete({ _id: id, schoolId });
    if (!student) throw new NotFoundError('Student not found');
    return student;
  }
}
