import { Request, Response, NextFunction } from 'express';
import { SchoolService } from './school.service';
import { User } from '../../models/User';
import { Class } from '../../models/Class';
import { AuthService } from '../auth/auth.service';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { Subscription } from '../../models/Subscription';
import logger from '../../config/logger';

export class SchoolController {
  static async ping(_req: Request, res: Response) {
    res.json({ success: true, message: 'Server is reachable' });
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.create(req.body);
      res.status(201).json({ success: true, data: school });
    } catch (error) {
      next(error);
    }
  }

  static async getSchools(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user.role !== 'SUPER_ADMIN') {
        const school = await SchoolService.getById(req.schoolId!);
        res.json({ success: true, data: school });
        return;
      }
      const schools = await SchoolService.getAll(req.query);
      res.json({ success: true, data: schools });
    } catch (error) {
      next(error);
    }
  }

  static async getCurrentSchool(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.schoolId) {
        res.status(404).json({ success: false, message: 'School not found' });
        return;
      }
      const school = await SchoolService.getById(req.schoolId);
      res.json({ success: true, data: school });
    } catch (error) {
      next(error);
    }
  }

  static async getSchool(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.getById(req.params.id);
      res.json({ success: true, data: school });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.update(req.params.id, req.body);
      res.json({ success: true, data: school });
    } catch (error) {
      next(error);
    }
  }

  static async updateCurrent(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.schoolId) {
        res.status(404).json({ success: false, message: 'School not found' });
        return;
      }
      const school = await SchoolService.update(req.schoolId, req.body);
      res.json({ success: true, data: school });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await SchoolService.delete(req.params.id);
      res.json({ success: true, message: 'School deleted' });
    } catch (error) {
      next(error);
    }
  }

  // ------------------------------------------------------------------
  // ONBOARDING (public, no authentication) – no `next` parameter
  // ------------------------------------------------------------------
  static async onboard(req: Request, res: Response) {
    try {
      const {
        schoolName,
        schoolType,
        address,
        phone,
        session,
        term,
        classes,
        ownerName,
        username,
        password,
        loadSample,
      } = req.body;

      logger.info('Onboarding request received:', { schoolName, username, ownerName });

      // Validate required fields
      if (!schoolName || !username || !password || !ownerName) {
        logger.warn('Missing required fields:', { schoolName, username, password, ownerName });
        res.status(400).json({
          success: false,
          message: 'Missing required fields: schoolName, username, password, ownerName',
        });
        return;
      }

      // Check for existing user with same username
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        logger.warn('Username already taken:', username);
        res.status(409).json({
          success: false,
          message: 'Username already taken. Please choose another.',
        });
        return;
      }

      // 1. Create school
      const school = await SchoolService.create({
        name: schoolName,
        schoolType: schoolType || 'Primary & Secondary',
        address: address || '',
        phone: phone || '',
        email: `${username}@school.local`,
        country: 'Nigeria',
        state: '',
        city: '',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        currentSession: session || '2026/2027',
        currentTerm: term || 'First Term',
        status: 'ACTIVE',
      });

      logger.info('School created:', school._id);

      // 2. Create owner user
      const owner = new User({
        email: `${username}@school.local`,
        username: username,
        password: password,
        firstName: ownerName.split(' ')[0] || ownerName,
        lastName: ownerName.split(' ').slice(1).join(' ') || 'Owner',
        role: 'SCHOOL_OWNER',
        schoolId: school._id,
        isActive: true,
      });
      await owner.save();
      logger.info('Owner created:', owner._id);

      // 3. Create classes (if provided)
      if (classes && Array.isArray(classes) && classes.length) {
        const classDocs = classes.map((c: any) => ({
          schoolId: school._id,
          name: c.name,
          fee: Number(c.fee) || 0,
          level: 0,
          academicYear: session || '2026/2027',
          isActive: true,
        }));
        await Class.insertMany(classDocs);
        logger.info(`Created ${classDocs.length} classes`);
      }

      // 4. Create a trial Subscription for the new school.
      // Every subscription-gated feature (renewal, SMS top-up, the
      // subscription page, subscription.middleware access checks) requires
      // a Subscription document to exist — without this step schools that
      // came through onboarding had none, and every check failed with
      // "No subscription found. Please contact support."
      const defaultPlan =
        (await SubscriptionPlan.findOne({ name: 'Starter', isActive: true })) ||
        (await SubscriptionPlan.findOne({ isActive: true }));

      if (defaultPlan) {
        const trialDays = 7;
        const now = new Date();
        const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
        const durationMap: Record<string, number> = { MONTHLY: 30, TERMLY: 90, ANNUAL: 365 };

        const subscription = new Subscription({
          schoolId: school._id,
          planId: defaultPlan._id,
          status: 'ACTIVE',
          startDate: now,
          endDate: trialEnd,
          autoRenew: true,
          priceAtPurchase: defaultPlan.price,
          billingCycleAtPurchase: defaultPlan.billingCycle,
          durationDaysAtPurchase: durationMap[defaultPlan.billingCycle] || 90,
          isTrial: true,
          trialEndDate: trialEnd,
        });
        await subscription.save();
        school.subscriptionId = subscription._id.toString();
        await school.save();
        logger.info(`Trial subscription created for school ${school._id}`);
      } else {
        logger.warn(
          `No SubscriptionPlan found — school ${school._id} onboarded without a subscription. Run the seed script.`
        );
      }

      // 5. (Optional) Load sample data – stub for now
      if (loadSample) {
        logger.info('Sample data requested for school', school._id);
      }

      // 6. Auto-login the owner (generate tokens)
      const loginResult = await AuthService.login(
        owner.username,
        password,
        req.ip || req.connection.remoteAddress,
        req.headers['user-agent']
      );

      // 7. Return tokens and user info
      res.status(201).json({
        success: true,
        data: {
          accessToken: loginResult.accessToken,
          refreshToken: loginResult.refreshToken,
          user: loginResult.user,
          school: school,
        },
      });
    } catch (error) {
      logger.error('Onboarding error:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined,
      });
    }
  }
}
