import { Request, Response, NextFunction } from 'express';
import { SchoolService } from './school.service';
import { User } from '../../models/User';
import { Class } from '../../models/Class';
import { AuthService } from '../auth/auth.service';
import logger from '../../config/logger';

export class SchoolController {
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

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await SchoolService.delete(req.params.id);
      res.json({ success: true, message: 'School deleted' });
    } catch (error) {
      next(error);
    }
  }

  // ------------------------------------------------------------------
  // NEW: Onboarding endpoint (creates school, owner, classes, trial)
  // ------------------------------------------------------------------
  static async onboard(req: Request, res: Response, next: NextFunction) {
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

      // 1. Create school
      const school = await SchoolService.create({
        name: schoolName,
        schoolType,
        address,
        phone,
        email: `${username}@school.local`, // placeholder
        country: 'Nigeria',
        state: '',
        city: '',
        currency: 'NGN',
        timezone: 'Africa/Lagos',
        currentSession: session,
        currentTerm: term,
        status: 'ACTIVE',
      });

      // 2. Create owner user
      const owner = new User({
        email: `${username}@school.local`,
        password, // will be hashed by pre-save hook
        firstName: ownerName.split(' ')[0] || ownerName,
        lastName: ownerName.split(' ').slice(1).join(' ') || 'Owner',
        role: 'SCHOOL_OWNER',
        schoolId: school._id,
        isActive: true,
      });
      await owner.save();

      // 3. Create classes
      if (classes && classes.length) {
        const classDocs = classes.map((c: any) => ({
          schoolId: school._id,
          name: c.name,
          fee: c.fee,
          level: 0, // default
          academicYear: session,
          isActive: true,
        }));
        await Class.insertMany(classDocs);
      }

      // 4. (Optional) Load sample data – you can call a seed function here
      if (loadSample) {
        // You can implement sample data seeding here
        logger.info('Sample data loading requested for school', school._id);
      }

      // 5. Auto-login the owner (generate tokens)
      const loginResult = await AuthService.login(
        owner.email,
        password,
        req.ip,
        req.headers['user-agent']
      );

      // 6. Return tokens and user info
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
      logger.error('Onboarding failed:', error);
      next(error);
    }
  }
}
