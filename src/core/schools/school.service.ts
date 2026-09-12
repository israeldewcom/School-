import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { Class } from '../../models/Class';
import { Student } from '../../models/Student';
import { Session } from '../../models/Session';
import { Term } from '../../models/Term';
import { Payment } from '../../models/Payment';
import { Invoice } from '../../models/Invoice';
import { Attendance } from '../../models/Attendance';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../utils/errors';
import logger from '../../config/logger';

const TERM_SEQUENCE = ['First Term', 'Second Term', 'Third Term'];

export class SchoolService {
  static async create(data: any) {
    const school = new School(data);
    await school.save();

    try {
      const starterPlan = await SubscriptionPlan.findOne({ name: 'Starter' });
      if (starterPlan) {
        const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };
        const now = new Date();
        const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
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
      }
    } catch (error) {
      logger.error('Failed to create trial subscription:', error);
    }

    try {
      const existing = await ReportCardTemplate.findOne({ schoolId: school._id, isDefault: true });
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
            showLogo: true, showSchoolInfo: true, showStudentPhoto: true,
            showAttendance: true, showClassAverage: true, showSubjectAverage: true,
            showGrade: true, showRemark: true,
            showTeacherComment: true, showPrincipalComment: true,
            showSignature: true, showStamp: true,
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

  static async getById(id: string, caller?: any) {
    let school;
    if (caller && caller.role !== 'SUPER_ADMIN') {
      school = await School.findById(caller.schoolId);
      if (school && school._id.toString() !== id) return school;
    } else {
      school = await School.findById(id);
    }
    if (!school) throw new NotFoundError('School not found');
    return school;
  }

  static async getAll(query: any, caller?: any) {
    const { schoolId: _ignored, ...safeQuery } = query || {};
    if (caller && caller.role !== 'SUPER_ADMIN') {
      return School.find({ _id: caller.schoolId });
    }
    return School.find(safeQuery);
  }

  static async update(id: string, data: any, caller?: any) {
    if (caller && caller.role !== 'SUPER_ADMIN') {
      if (caller.schoolId?.toString() !== id) {
        throw new ForbiddenError('You can only update your own school');
      }
      delete data.subscriptionId;
      delete data.smsBalance;
      delete data.smsRate;
      delete data.smsMonthlyUsage;
      delete data.status;
    }
    const school = await School.findByIdAndUpdate(id, data, { new: true });
    if (!school) throw new NotFoundError('School not found');
    return school;
  }

  static async delete(id: string, caller: any) {
    if (caller?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only platform admins can delete schools');
    }
    const school = await School.findByIdAndDelete(id);
    if (!school) throw new NotFoundError('School not found');
    return school;
  }

  static async closeTerm(schoolId: string, actorId: string) {
    const school = await School.findById(schoolId);
    if (!school) throw new NotFoundError('School not found');

    if (!school.currentSessionId || !school.currentTermId) {
      throw new BadRequestError('School has no active session/term configured');
    }

    const currentTerm = await Term.findById(school.currentTermId);
    if (!currentTerm) throw new NotFoundError('Current term not found');

    const idx = TERM_SEQUENCE.indexOf(currentTerm.name);
    if (idx === -1) {
      throw new BadRequestError(`Unknown term name "${currentTerm.name}"`);
    }
    if (idx === TERM_SEQUENCE.length - 1) {
      throw new BadRequestError(
        'Third Term cannot be closed automatically. Create a new session to continue.'
      );
    }

    const nextTermName = TERM_SEQUENCE[idx + 1];
    const nextTerm = await Term.findOne({
      schoolId,
      sessionId: school.currentSessionId,
      name: nextTermName,
    });

    currentTerm.isActive = false;
    await currentTerm.save();

    let activatedTerm: any = null;
    if (nextTerm) {
      nextTerm.isActive = true;
      if (!nextTerm.endDate || nextTerm.endDate < new Date()) {
        nextTerm.endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      }
      await nextTerm.save();
      activatedTerm = nextTerm;
      school.currentTermId = nextTerm._id.toString();
      school.currentTerm = nextTerm.name;
      await school.save();
    }

    await AuditLog.create({
      actor: actorId,
      action: 'school.term_closed',
      resource: 'School',
      resourceId: school._id,
      after: { closedTerm: currentTerm.name, nextTerm: activatedTerm?.name || null },
    });

    return {
      closedTerm: currentTerm.name,
      advancedTo: activatedTerm?.name || null,
      requiresNewSession: !activatedTerm,
    };
  }

  static async seedSampleData(schoolId: string) {
    const school = await School.findById(schoolId);
    if (!school) throw new NotFoundError('School not found');

    const existingCount = await Student.countDocuments({ schoolId });
    if (existingCount > 0) {
      return { skipped: true, reason: 'School already has students', added: 0 };
    }

    const classes = await Class.find({ schoolId, isActive: true });
    if (classes.length === 0) {
      throw new BadRequestError('Create at least one class before loading sample data');
    }

    const sessionId = school.currentSessionId;
    const termId = school.currentTermId;
    if (!sessionId || !termId) {
      throw new BadRequestError('School has no active session/term');
    }

    const FIRST_NAMES = ['Adeola', 'Chidi', 'Funke', 'Emeka', 'Aisha', 'Tunde', 'Ngozi', 'Kemi', 'Yusuf', 'Bola'];
    const LAST_NAMES = ['Okafor', 'Ibrahim', 'Adeyemi', 'Eze', 'Bello', 'Ojo', 'Nwosu', 'Adebayo', 'Salami', 'Olatunji'];
    const GENDERS: Array<'MALE' | 'FEMALE'> = ['MALE', 'FEMALE'];

    const studentsToCreate: any[] = [];
    let seq = 1;

    for (const cls of classes) {
      for (let i = 0; i < 5; i++) {
        const first = FIRST_NAMES[(seq + i) % FIRST_NAMES.length];
        const last = LAST_NAMES[(seq * 3 + i) % LAST_NAMES.length];
        studentsToCreate.push({
          schoolId,
          firstName: first,
          lastName: last,
          admissionNumber: `SAMPLE-${String(seq).padStart(4, '0')}`,
          gender: GENDERS[seq % 2],
          dateOfBirth: new Date(2015, (seq % 12), (seq % 27) + 1),
          address: 'Sample address',
          classId: cls._id,
          status: 'ACTIVE',
        });
        seq++;
      }
    }

    const inserted = await Student.insertMany(studentsToCreate);

    let invoicesCreated = 0;
    let paymentsCreated = 0;

    for (const s of inserted) {
      const amount = 5_000_00;
      const invoice = await Invoice.create({
        schoolId,
        studentId: s._id,
        sessionId,
        termId,
        invoiceNumber: `INV-SAMPLE-${s._id.toString().slice(-6)}`,
        items: [{ description: 'Sample tuition', amount }],
        subtotal: amount,
        discount: 0,
        total: amount,
        amountPaid: amount,
        balance: 0,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'PAID',
      });
      invoicesCreated++;

      await Payment.create({
        schoolId,
        studentId: s._id,
        invoiceId: invoice._id,
        amount,
        method: 'CASH',
        reference: `SAMPLE-${invoice._id.toString().slice(-6)}`,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      });
      paymentsCreated++;
    }

    const attendanceDocs: any[] = [];
    for (const s of inserted) {
      for (let d = 0; d < 7; d++) {
        const date = new Date();
        date.setDate(date.getDate() - d);
        date.setHours(8, 0, 0, 0);
        attendanceDocs.push({
          schoolId,
          studentId: s._id,
          classId: s.classId,
          sessionId,
          termId,
          date,
          status: d === 3 && Math.random() < 0.2 ? 'ABSENT' : 'PRESENT',
        });
      }
    }
    if (attendanceDocs.length > 0) {
      await Attendance.insertMany(attendanceDocs);
    }

    await AuditLog.create({
      actor: 'system',
      action: 'school.sample_data_seeded',
      resource: 'School',
      resourceId: school._id,
      after: {
        students: inserted.length,
        invoices: invoicesCreated,
        payments: paymentsCreated,
        attendanceRecords: attendanceDocs.length,
      },
    });

    return {
      skipped: false,
      students: inserted.length,
      invoices: invoicesCreated,
      payments: paymentsCreated,
      attendanceRecords: attendanceDocs.length,
    };
  }
}
