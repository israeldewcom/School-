import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError } from '../../utils/errors';
import logger from '../../config/logger';

export class SchoolService {
  static async create(data: any) {
    const school = new School(data);
    await school.save();

    // 1. Trial subscription
    try {
      const starterPlan = await SubscriptionPlan.findOne({ name: 'Starter' });
      if (starterPlan) {
        const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
        const now = new Date();
        const trialDays = 7;
        const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
        const subscription = new Subscription({
          schoolId: school._id,
          planId: starterPlan._id,
          startDate: now,
          endDate: trialEnd,
          isTrial: true,
          trialEndDate: trialEnd,
          status: 'ACTIVE',
          priceAtPurchase: starterPlan.price,
          billingCycleAtPurchase: starterPlan.billingCycle,
          durationDaysAtPurchase: durationMap[starterPlan.billingCycle] || 90,
          autoRenew: false,
        });
        await subscription.save();
        logger.info(`Trial subscription created for school ${school._id}`);
      }
    } catch (error) {
      logger.error('Failed to create trial subscription:', error);
    }

    // 2. Default report card template — 👈 NEW
    // Without this, generateReportCard() throws "template not found" for
    // every fresh school, and the frontend shows a generic 500.
    try {
      const existing = await ReportCardTemplate.findOne({
        schoolId: school._id,
        isDefault: true,
      });
      if (!existing) {
        await ReportCardTemplate.create({
          schoolId: school._id,
          name: 'Default Report Card',
          description: 'Auto-generated default template',
          version: 1,
          layout: 'A4_PORTRAIT',
          isActive: true,
          isDefault: true,
          config: {
            showLogo: true,
            showSchoolInfo: true,
            showStudentPhoto: true,
            showAttendance: true,
            showClassAverage: true,
            showSubjectAverage: true,
            showGrade: true,
            showRemark: true,
            showTeacherComment: true,
            showPrincipalComment: true,
            showSignature: true,
            showStamp: true,
            fields: [],
            gradingConfig: {
              gradingSystem: 'Standard',
              grades: [
                { min: 75, max: 100, grade: 'A', remark: 'Excellent' },
                { min: 65, max: 74, grade: 'B', remark: 'Very Good' },
                { min: 55, max: 64, grade: 'C', remark: 'Good' },
                { min: 45, max: 54, grade: 'D', remark: 'Fair' },
                { min: 40, max: 44, grade: 'E', remark: 'Pass' },
                { min: 0,  max: 39, grade: 'F', remark: 'Fail' },
              ],
            },
          },
        });
        logger.info(`Default report card template created for school ${school._id}`);
      }
    } catch (error) {
      logger.error('Failed to create default report card template:', error);
    }

    await AuditLog.create({
      actor: 'system',
      action: 'school.created',
      resource: 'School',
      resourceId: school._id,
      after: data,
    });

    return school;
  }

  static async getById(id: string) {
    const school = await School.findById(id);
    if (!school) throw new NotFoundError('School not found');
    return school;
  }

  static async getAll(query: any) {
    const { schoolId: _ignored, ...safeQuery } = query || {};
    return School.find(safeQuery);
  }

  static async update(id: string, data: any) {
    const school = await School.findByIdAndUpdate(id, data, { new: true });
    if (!school) throw new NotFoundError('School not found');
    return school;
  }

  static async delete(id: string) {
    const school = await School.findByIdAndDelete(id);
    if (!school) throw new NotFoundError('School not found');
    return school;
  }
}
