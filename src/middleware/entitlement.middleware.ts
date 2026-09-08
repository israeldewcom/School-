import { Request, Response, NextFunction } from 'express';
import { Subscription } from '../models/Subscription';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { Student } from '../models/Student';
import { Staff } from '../models/Staff';
import { SchoolDocument } from '../models/Document';
import { ForbiddenError } from '../utils/errors';
import logger from '../config/logger';

type EntitlementResource = 'students' | 'staff' | 'storage' | 'sms';

export const checkEntitlement = (resource: EntitlementResource) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const schoolId = req.schoolId;
      if (!schoolId) return next(new ForbiddenError('School context missing'));

      const subscription = await Subscription.findOne({ schoolId, status: 'ACTIVE' });
      if (!subscription) return next(new ForbiddenError('No active subscription'));

      const plan = await SubscriptionPlan.findById(subscription.planId);
      if (!plan) return next(new ForbiddenError('Plan not found'));

      const entitlements = plan.entitlements;

      switch (resource) {
        case 'students': {
          const count = await Student.countDocuments({ schoolId, status: 'ACTIVE' });
          if (count >= entitlements.maxStudents) {
            return next(
              new ForbiddenError(`Student limit reached (${entitlements.maxStudents}). Please upgrade your plan.`)
            );
          }
          break;
        }
        case 'staff': {
          const count = await Staff.countDocuments({ schoolId, isActive: true });
          if (count >= entitlements.maxStaff) {
            return next(
              new ForbiddenError(`Staff limit reached (${entitlements.maxStaff}). Please upgrade your plan.`)
            );
          }
          break;
        }
        case 'storage': {
          const result = await SchoolDocument.aggregate([
            { $match: { schoolId } },
            { $group: { _id: null, total: { $sum: '$size' } } },
          ]);
          const totalBytes = result.length ? result[0].total : 0;
          const totalGB = totalBytes / (1024 * 1024 * 1024);
          if (totalGB >= entitlements.storageGB) {
            return next(
              new ForbiddenError(`Storage limit reached (${entitlements.storageGB} GB). Please upgrade your plan.`)
            );
          }
          break;
        }
        case 'sms': {
          // Implement SMS usage check if needed
          break;
        }
        default:
          break;
      }
      next();
    } catch (error) {
      logger.error('Entitlement check error:', error);
      next(new ForbiddenError('Unable to verify plan entitlements'));
    }
  };
};
