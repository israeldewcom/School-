import { Request, Response, NextFunction } from 'express';
import { SchoolService } from './school.service';
import { User } from '../../models/User';
import { Class } from '../../models/Class';
import { Session } from '../../models/Session';
import { Term } from '../../models/Term';
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
    } catch (error) { next(error); }
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
    } catch (error) { next(error); }
  }

  static async getCurrentSchool(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.schoolId) {
        res.status(404).json({ success: false, message: 'School not found' });
        return;
      }
      const school = await SchoolService.getById(req.schoolId);
      res.json({ success: true, data: school });
    } catch (error) { next(error); }
  }

  static async getSchool(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.getById(req.params.id);
      res.json({ success: true, data: school });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.update(req.params.id, req.body);
      res.json({ success: true, data: school });
    } catch (error) { next(error); }
  }

  static async updateCurrent(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.schoolId) {
        res.status(404).json({ success: false, message: 'School not found' });
        return;
      }
      const school = await SchoolService.update(req.schoolId, req.body);
      res.json({ success: true, data: school });
    } catch (error) { next(error); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await SchoolService.delete(req.params.id);
      res.json({ success: true, message: 'School deleted' });
    } catch (error) { next(error); }
  }

  // ------------------------------------------------------------------
  // ONBOARDING (public, no authentication)
  //
  // CRITICAL FIX: after creating the School, we now also create the real
  // Session and Term documents. Previously the school was created with
  // just the strings "2026/2027" and "First Term", so every downstream
  // feature that needs an ObjectId (attendance, scores, invoices, report
  // cards, fee structures) failed with "Academic session/term not
  // configured" and there was no UI to fix it.
  //
  // The created Session/Term ObjectIds are written onto the School
  // document as `currentSessionId` / `currentTermId` so the frontend can
  // read them directly from GET /schools/current.
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

      if (!schoolName || !username || !password || !ownerName) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: schoolName, username, password, ownerName',
        });
        return;
      }

      const existingUser = await User.findOne({ username });
      if (existingUser) {
        res.status(409).json({
          success: false,
          message: 'Username already taken. Please choose another.',
        });
        return;
      }

      const sessionName = (session || '2026/2027').trim();
      const termName = (term || 'First Term').trim();

      // 1. Create school (still uses the strings for the legacy fields).
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
        currentSession: sessionName,
        currentTerm: termName,
        status: 'ACTIVE',
      });
      logger.info('School created:', school._id);

      // 2. Create the real Session document.
      const now = new Date();
      const sessionStart = new Date(now.getFullYear(), 8, 1);          // Sept 1 of current year
      const sessionEnd = new Date(now.getFullYear() + 1, 6, 31);       // July 31 next year
      const sessionDoc = new Session({
        schoolId: school._id,
        name: sessionName,
        startDate: sessionStart,
        endDate: sessionEnd,
        isActive: true,
      });
      await sessionDoc.save();
      logger.info('Session created:', sessionDoc._id);

      // 3. Create the real Term document under that session.
      const termStart = new Date(now);
      const termEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const termDoc = new Term({
        schoolId: school._id,
        sessionId: sessionDoc._id,
        name: termName,
        startDate: termStart,
        endDate: termEnd,
        isActive: true,
      });
      await termDoc.save();
      logger.info('Term created:', termDoc._id);

      // 4. Persist the ObjectIds on the school so the frontend can read them
      //    from GET /schools/current without extra lookups.
      school.currentSessionId = sessionDoc._id.toString();
      school.currentTermId = termDoc._id.toString();
      await school.save();

      // 5. Create owner user.
      const owner = new User({
        email: `${username}@school.local`,
        username,
        password,
        firstName: ownerName.split(' ')[0] || ownerName,
        lastName: ownerName.split(' ').slice(1).join(' ') || 'Owner',
        role: 'SCHOOL_OWNER',
        schoolId: school._id,
        isActive: true,
      });
      await owner.save();
      logger.info('Owner created:', owner._id);

      // 6. Create classes if provided.
      if (classes && Array.isArray(classes) && classes.length) {
        const classDocs = classes.map((c: any) => ({
          schoolId: school._id,
          name: c.name,
          fee: Number(c.fee) || 0,
          level: 0,
          academicYear: sessionName,
          isActive: true,
        }));
        await Class.insertMany(classDocs);
        logger.info(`Created ${classDocs.length} classes`);
      }

      // 7. Create a trial Subscription so subscription-gated features work.
      const defaultPlan =
        (await SubscriptionPlan.findOne({ name: 'Starter', isActive: true })) ||
        (await SubscriptionPlan.findOne({ isActive: true }));

      if (defaultPlan) {
        const trialDays = 7;
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

      if (loadSample) {
        logger.info('Sample data requested for school', school._id);
      }

      const loginResult = await AuthService.login(
        owner.username,
        password,
        req.ip || req.connection.remoteAddress,
        req.headers['user-agent']
      );

      res.status(201).json({
        success: true,
        data: {
          accessToken: loginResult.accessToken,
          refreshToken: loginResult.refreshToken,
          user: loginResult.user,
          school,
          session: { id: sessionDoc._id, name: sessionDoc.name },
          term: { id: termDoc._id, name: termDoc.name },
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
