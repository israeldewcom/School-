import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError } from '../../utils/errors';
import logger from '../../config/logger';

export class SchoolService {
  static async create(data: any) {
    const school = new School(data);
    await school.save();

    // Auto-create trial subscription
    try {
      const starterPlan = await SubscriptionPlan.findOne({ name: 'Starter' });
      if (starterPlan) {
        const durationMap: Record<string, number> = {
          MONTHLY: 30,
          TERMLY: 90,
          ANNUAL: 365,
        };
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
      } else {
        logger.warn('Starter plan not found – trial subscription not created');
      }
    } catch (error) {
      logger.error('Failed to create trial subscription:', error);
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
    return School.find(query);
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
