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
import { LogoService } from '../branding/logo.service';
import { SchoolSite } from '../../models/SchoolSite';
import { ReportCardPresetService } from '../reportCards/reportCardPresets.service';

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
        const school = await SchoolService.getById(req.schoolId!, req.user);
        res.json({ success: true, data: school });
        return;
      }
      const schools = await SchoolService.getAll(req.query, req.user);
      res.json({ success: true, data: schools });
    } catch (error) { next(error); }
  }

  static async getCurrentSchool(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.schoolId) {
        res.status(404).json({ success: false, message: 'School not found' });
        return;
      }
      const school = await SchoolService.getById(req.schoolId, req.user);
      res.json({ success: true, data: school });
    } catch (error) { next(error); }
  }

  static async getSchool(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.getById(req.params.id, req.user);
      res.json({ success: true, data: school });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const school = await SchoolService.update(req.params.id, req.body, req.user);
      res.json({ success: true, data: school });
    } catch (error) { next(error); }
  }

  static async updateCurrent(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.schoolId) {
        res.status(404).json({ success: false, message: 'School not found' });
        return;
      }
      const school = await SchoolService.update(req.schoolId, req.body, req.user);
      res.json({ success: true, data: school });
    } catch (error) { next(error); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await SchoolService.delete(req.params.id, req.user);
      res.json({ success: true, message: 'School deleted' });
    } catch (error) { next(error); }
  }

  // ------------------------------------------------------------------
  // CLOSE TERM — advances First -> Second -> Third Term
  // ------------------------------------------------------------------
  static async closeTerm(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await SchoolService.closeTerm(req.schoolId!, req.userId!);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  // ------------------------------------------------------------------
  // SEED SAMPLE DATA — demo students/invoices/payments/attendance
  // ------------------------------------------------------------------
  static async seedSample(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await SchoolService.seedSampleData(req.schoolId!);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  // ------------------------------------------------------------------
  // ONBOARDING (public, no authentication)
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
        logo,
        primaryColor,
        secondaryColor,
      } = req.body;

      logger.info('Onboarding request received:', { schoolName, username, ownerName });

      if (!schoolName || !username || !password || !ownerName) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: schoolName, username, password, ownerName',
        });
        return;
      }

      // The platform's own name is never a valid school name (it would brand the school's website as SchoolFlow).
      if (/^\s*school\s*-?\s*flow\s*$/i.test(String(schoolName))) {
        res.status(400).json({ success: false, message: 'Please enter your own school\'s name, not the platform name.' });
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

      const now = new Date();
      const sessionStart = new Date(now.getFullYear(), 8, 1);
      const sessionEnd = new Date(now.getFullYear() + 1, 6, 31);
      const sessionDoc = new Session({
        schoolId: school._id,
        name: sessionName,
        startDate: sessionStart,
        endDate: sessionEnd,
        isActive: true,
      });
      await sessionDoc.save();
      logger.info('Session created:', sessionDoc._id);

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

      school.currentSessionId = sessionDoc._id.toString();
      school.currentTermId = termDoc._id.toString();
      await school.save();

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
      }

      // Branding from the wizard: logo upload + colours, then a ready-made report card design.
      // None of this may block sign-up, so every step is best-effort.
      try {
        const hex = /^#[0-9a-fA-F]{6}$/;
        const schoolIdStr = String(school._id);
        if (logo && String(logo).startsWith('data:image')) await LogoService.upload(schoolIdStr, String(logo));
        const theme: any = {};
        if (hex.test(String(primaryColor || ''))) theme['theme.primaryColor'] = primaryColor;
        if (hex.test(String(secondaryColor || ''))) theme['theme.secondaryColor'] = secondaryColor;
        if (Object.keys(theme).length) await SchoolSite.updateOne({ schoolId: school._id }, { $set: theme });
        await ReportCardPresetService.apply(schoolIdStr, 'modern-band', { makeDefault: true });
      } catch (brandErr: any) {
        logger.warn(`Onboarding branding step skipped: ${brandErr?.message}`);
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
