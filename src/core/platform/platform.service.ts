import mongoose from 'mongoose';
import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { Payment } from '../../models/Payment';
import { Student } from '../../models/Student';
import { Staff } from '../../models/Staff';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { invalidateSubscriptionCache } from '../../middleware/subscription.middleware';

// Maps the internal School.status enum to the lowercase values the
// platform-admin dashboard was built against. A school also reads as
// 'trial' whenever its subscription has isTrial === true, regardless of
// the School document's own status — trial is a subscription concept,
// not a school lifecycle state.
function toDashboardStatus(schoolStatus: string, isTrial: boolean, subStatus?: string): string {
  if (isTrial) return 'trial';
  if (schoolStatus === 'SUSPENDED') return 'suspended';
  if (subStatus === 'PAST_DUE' || subStatus === 'EXPIRED') return 'past_due';
  if (schoolStatus === 'ACTIVE') return 'active';
  return (schoolStatus || 'active').toLowerCase();
}

export class PlatformService {
  // ------------------------------------------------------------------
  // Schools list — joined with subscription + plan + student count.
  // This backs the "All schools" table, MRR card, churn card, and plan
  // distribution chart on the platform dashboard.
  // ------------------------------------------------------------------
  static async listSchools(query: any) {
    // Only pass through fields we explicitly support filtering on — never
    // forward the raw client query into a Mongo filter.
    const filter: any = {};
    if (query?.status && typeof query.status === 'string') {
      filter.status = query.status.toUpperCase();
    }
    if (query?.state && typeof query.state === 'string') {
      filter.state = query.state;
    }

    const schools = await School.find(filter).sort({ createdAt: -1 }).lean();
    if (schools.length === 0) return [];

    const schoolIds = schools.map((s) => s._id);

    const [subscriptions, studentCounts] = await Promise.all([
      Subscription.find({ schoolId: { $in: schoolIds } })
        .sort({ createdAt: -1 })
        .populate('planId')
        .lean(),
      Student.aggregate([
        { $match: { schoolId: { $in: schoolIds }, status: 'ACTIVE' } },
        { $group: { _id: '$schoolId', count: { $sum: 1 } } },
      ]),
    ]);

    // Most recent subscription per school (there should only be one active
    // one at a time, but a school can accumulate historical CANCELLED/EXPIRED
    // rows, so take the latest by createdAt).
    const subBySchool = new Map<string, any>();
    for (const sub of subscriptions) {
      const key = sub.schoolId.toString();
      if (!subBySchool.has(key)) subBySchool.set(key, sub);
    }

    const studentCountBySchool = new Map<string, number>();
    for (const row of studentCounts) {
      studentCountBySchool.set(row._id.toString(), row.count);
    }

    return schools.map((school) => {
      const sub = subBySchool.get(school._id.toString());
      const plan = sub?.planId as any; // populated
      return {
        id: school._id.toString(),
        name: school.name,
        state: school.state,
        createdAt: school.createdAt,
        status: toDashboardStatus(school.status, sub?.isTrial || false, sub?.status),
        plan: plan?.name || null,
        planPrice: sub?.priceAtPurchase || 0,
        renewsAt: sub?.endDate || null,
        students: studentCountBySchool.get(school._id.toString()) || 0,
      };
    });
  }

  // ------------------------------------------------------------------
  // Single school detail — usage stats + recent payment history.
  // ------------------------------------------------------------------
  static async getSchoolDetail(schoolId: string) {
    const school = await School.findById(schoolId).lean();
    if (!school) throw new NotFoundError('School not found');

    const [subscription, studentCount, staffCount, recentPayments] = await Promise.all([
      Subscription.findOne({ schoolId }).sort({ createdAt: -1 }).populate('planId').lean(),
      Student.countDocuments({ schoolId, status: 'ACTIVE' }),
      Staff.countDocuments({ schoolId }),
      Payment.find({ schoolId, status: 'CONFIRMED' })
        .sort({ confirmedAt: -1 })
        .limit(5)
        .select('amount method confirmedAt')
        .lean(),
    ]);

    const plan = subscription?.planId as any;

    return {
      school: {
        id: school._id.toString(),
        name: school.name,
        state: school.state,
        createdAt: school.createdAt,
        status: toDashboardStatus(school.status, subscription?.isTrial || false, subscription?.status),
        plan: plan?.name || null,
        planPrice: subscription?.priceAtPurchase || 0,
        renewsAt: subscription?.endDate || null,
      },
      usage: {
        students: studentCount,
        staff: staffCount,
        smsUsed: school.smsMonthlyUsage || 0,
      },
      payments: recentPayments.map((p) => ({
        date: p.confirmedAt,
        method: p.method,
        amount: p.amount,
      })),
    };
  }

  // ------------------------------------------------------------------
  // Revenue analytics — confirmed payments grouped by month, last 12
  // months. Feeds the platform dashboard's revenue line chart.
  // ------------------------------------------------------------------
  static async getRevenueAnalytics() {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const results = await Payment.aggregate([
      {
        $match: {
          status: 'CONFIRMED',
          confirmedAt: { $gte: twelveMonthsAgo },
        },
      },
      {
        $group: {
          _id: { year: { $year: '$confirmedAt' }, month: { $month: '$confirmedAt' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Build a full 12-month scaffold so months with zero revenue still show
    // as 0 rather than being skipped, which would distort the line chart.
    const byKey = new Map<string, number>();
    for (const r of results) {
      byKey.set(`${r._id.year}-${r._id.month}`, r.total);
    }

    const labels: string[] = [];
    const values: number[] = [];
    const cursor = new Date(twelveMonthsAgo);
    for (let i = 0; i < 12; i++) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth() + 1;
      labels.push(cursor.toLocaleString('en-US', { month: 'short', year: '2-digit' }));
      values.push(byKey.get(`${year}-${month}`) || 0);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { labels, values };
  }

  // ------------------------------------------------------------------
  // Subscription plan change (existing behavior, kept as-is).
  // ------------------------------------------------------------------
  static async updateSubscription(subscriptionId: string, planId: string, autoRenew: boolean) {
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription not found');
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) throw new NotFoundError('Plan not found');

    subscription.planId = plan._id;
    subscription.autoRenew = autoRenew;
    await subscription.save();
    await invalidateSubscriptionCache(subscription.schoolId.toString());

    await AuditLog.create({
      actor: 'platform-admin',
      action: 'subscription.updated',
      resource: 'Subscription',
      resourceId: subscription._id,
      after: { planId, autoRenew },
    });

    return subscription;
  }

  // ------------------------------------------------------------------
  // Extend a school's subscription by N days (default 30). Used by the
  // "Extend +30d" button on the school detail modal.
  // ------------------------------------------------------------------
  static async extendSubscription(schoolId: string, days: number, actorId: string) {
    if (!days || days <= 0 || days > 365) {
      throw new BadRequestError('days must be between 1 and 365');
    }

    const subscription = await Subscription.findOne({ schoolId }).sort({ createdAt: -1 });
    if (!subscription) throw new NotFoundError('No subscription found for this school');

    const base = subscription.endDate && subscription.endDate > new Date()
      ? subscription.endDate
      : new Date();
    subscription.endDate = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    if (subscription.status === 'EXPIRED' || subscription.status === 'PAST_DUE') {
      subscription.status = 'ACTIVE';
    }
    await subscription.save();
    await invalidateSubscriptionCache(schoolId);

    await AuditLog.create({
      actor: actorId,
      action: 'subscription.extended',
      resource: 'Subscription',
      resourceId: subscription._id,
      after: { days, newEndDate: subscription.endDate },
    });

    return subscription;
  }

  // ------------------------------------------------------------------
  // Toggle a school between ACTIVE and SUSPENDED. Does not touch
  // PENDING/ARCHIVED schools — those require a different workflow.
  // ------------------------------------------------------------------
  static async toggleSchoolStatus(schoolId: string, actorId: string) {
    const school = await School.findById(schoolId);
    if (!school) throw new NotFoundError('School not found');

    if (school.status !== 'ACTIVE' && school.status !== 'SUSPENDED') {
      throw new BadRequestError(`Cannot toggle a school with status ${school.status}`);
    }

    const previousStatus = school.status;
    school.status = school.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await school.save();
    await invalidateSubscriptionCache(schoolId);

    await AuditLog.create({
      actor: actorId,
      action: 'school.status_toggled',
      resource: 'School',
      resourceId: school._id,
      before: { status: previousStatus },
      after: { status: school.status },
    });

    return school;
  }

  static async listSubscriptions(query: any) {
    return Subscription.find(query).populate('planId');
  }

  static async getGlobalAnalytics() {
    return {
      totalSchools: await School.countDocuments(),
      activeSubscriptions: await Subscription.countDocuments({ status: 'ACTIVE' }),
    };
  }
}
