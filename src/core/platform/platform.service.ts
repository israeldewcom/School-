import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { AuditLog } from '../../models/AuditLog';
import { NotFoundError } from '../../utils/errors';

export class PlatformService {
  static async listSchools(query: any) {
    return School.find(query);
  }

  static async listSubscriptions(query: any) {
    return Subscription.find(query).populate('planId');
  }

  static async updateSubscription(subscriptionId: string, planId: string, autoRenew: boolean) {
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription not found');
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) throw new NotFoundError('Plan not found');

    subscription.planId = plan._id;
    subscription.autoRenew = autoRenew;
    await subscription.save();

    await AuditLog.create({
      actor: 'platform-admin',
      action: 'subscription.updated',
      resource: 'Subscription',
      resourceId: subscription._id,
      after: { planId, autoRenew },
    });

    return subscription;
  }

  static async getGlobalAnalytics() {
    return {
      totalSchools: await School.countDocuments(),
      activeSubscriptions: await Subscription.countDocuments({ status: 'ACTIVE' }),
    };
  }
}
