import { Student } from '../../models/Student';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Attendance } from '../../models/Attendance';

export class AnalyticsService {
  static async getSchoolStats(schoolId: string) {
    const totalStudents = await Student.countDocuments({ schoolId, status: 'ACTIVE' });
    const totalInvoices = await Invoice.countDocuments({ schoolId });
    const totalPayments = await Payment.countDocuments({ schoolId, status: 'CONFIRMED' });
    const totalRevenue = await Payment.aggregate([
      { $match: { schoolId, status: 'CONFIRMED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const attendanceRate = await Attendance.aggregate([
      { $match: { schoolId } },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
          total: { $sum: 1 },
        },
      },
      { $project: { rate: { $multiply: [{ $divide: ['$present', '$total'] }, 100] } } },
    ]);
    return {
      totalStudents,
      totalInvoices,
      totalPayments,
      totalRevenue: totalRevenue[0]?.total || 0,
      attendanceRate: attendanceRate[0]?.rate || 0,
    };
  }
}
