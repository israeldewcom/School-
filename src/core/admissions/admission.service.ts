// src/core/admissions/admission.service.ts
import crypto from 'crypto';
import mongoose from 'mongoose';
import {
  AdmissionApplication, ADMISSION_STATUSES, AdmissionStatus,
} from '../../models/AdmissionApplication';
import { Student } from '../../models/Student';
import { Parent } from '../../models/Parent';
import { Class } from '../../models/Class';
import { School } from '../../models/School';
import { Subscription } from '../../models/Subscription';
import { SubscriptionPlan } from '../../models/SubscriptionPlan';
import { StudentService } from '../students/student.service';
import { PortalAccountService } from '../accounts/portalAccount.service';
import { Notifier } from '../../services/notifier.service';
import { normalizeImageField } from '../../services/storage.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../middleware/error.middleware';
import { escapeRegex, oid, optOid, pageParams } from '../../utils/validate';
import { normalizePhone } from '../../utils/phone';
import { localPhone, publicUrlFor } from '../site/site.service';
import { SchoolSite } from '../../models/SchoolSite';
import logger from '../../config/logger';

export interface Actor { id: string; name: string }

// Same rule as checkEntitlement('students'), for code paths that do not go through that route middleware.
async function assertStudentCapacity(schoolId: string) {
  const sub = await Subscription.findOne({ schoolId, status: 'ACTIVE' });
  if (!sub) return; // the subscription middleware already guards the request path
  const plan: any = await SubscriptionPlan.findById(sub.planId);
  const max = plan?.entitlements?.maxStudents;
  if (!max) return;
  const count = await Student.countDocuments({ schoolId, status: 'ACTIVE' });
  if (count >= max) throw new ForbiddenError(`Student limit reached (${max}). Upgrade your plan to enrol more students.`);
}

async function nextAdmissionNumber(schoolId: string): Promise<string> {
  const school: any = await School.findById(schoolId).select('name slug').lean();
  const words = String(school?.name || 'SCH').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !['of', 'the', 'and', 'school', 'college'].includes(w.toLowerCase()));
  const prefix = (words.map((w) => w[0]).join('').toUpperCase().slice(0, 3) || 'SCH').padEnd(2, 'X');
  const year = new Date().getFullYear();
  const stem = `${prefix}/${year}/`;
  const count = await Student.countDocuments({ schoolId, admissionNumber: new RegExp(`^${escapeRegex(stem)}`) });
  for (let n = count + 1; n < count + 50; n++) {
    const cand = `${stem}${String(n).padStart(4, '0')}`;
    if (!(await Student.exists({ schoolId, admissionNumber: cand }))) return cand;
  }
  return `${stem}${crypto.randomInt(10000, 99999)}`;
}

async function newApplicationNumber(schoolId: string): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const cand = `APP-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (!(await AdmissionApplication.exists({ schoolId, applicationNumber: cand }))) return cand;
  }
  throw new BadRequestError('Could not generate an application number. Try again.');
}

function shape(a: any) {
  return {
    id: String(a._id),
    applicationNumber: a.applicationNumber,
    status: a.status,
    source: a.source,
    applicant: a.applicant,
    applicantName: `${a.applicant?.firstName || ''} ${a.applicant?.lastName || ''}`.trim(),
    classAppliedId: a.classAppliedId ? String(a.classAppliedId) : null,
    classAppliedName: a.classAppliedName || null,
    parent: a.parent,
    parentName: `${a.parent?.firstName || ''} ${a.parent?.lastName || ''}`.trim(),
    answers: a.answers || {},
    interview: a.interview || null,
    decision: a.decision || null,
    notes: a.notes || [],
    history: a.history || [],
    studentId: a.studentId ? String(a.studentId) : null,
    submittedAt: a.submittedAt,
    enrolledAt: a.enrolledAt || null,
  };
}

function pushHistory(app: any, status: AdmissionStatus, actor: Actor, note?: string) {
  app.history.push({ status, by: actor.id, byName: actor.name, at: new Date(), note });
}

export class AdmissionService {
  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------
  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.status) {
      const s = String(query.status).toUpperCase();
      if (!(ADMISSION_STATUSES as string[]).includes(s)) throw new BadRequestError('Unknown status filter.');
      filter.status = s;
    }
    const classId = optOid(query.classId, 'classId');
    if (classId) filter.classAppliedId = classId;
    if (query.search) {
      const rx = new RegExp(escapeRegex(String(query.search).trim()), 'i');
      filter.$or = [
        { 'applicant.firstName': rx }, { 'applicant.lastName': rx }, { 'parent.firstName': rx },
        { 'parent.lastName': rx }, { 'parent.phone': rx }, { applicationNumber: rx },
      ];
    }
    const { page, limit, skip } = pageParams(query, 25, 100);
    const [items, total] = await Promise.all([
      AdmissionApplication.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit).lean(),
      AdmissionApplication.countDocuments(filter),
    ]);
    return { items: items.map(shape), total, page, limit };
  }

  static async stats(schoolId: string) {
    const rows = await AdmissionApplication.aggregate([
      { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const byStatus: Record<string, number> = {};
    for (const s of ADMISSION_STATUSES) byStatus[s] = 0;
    for (const r of rows) byStatus[r._id] = r.count;
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const thisWeek = await AdmissionApplication.countDocuments({ schoolId, submittedAt: { $gte: weekAgo } });
    const site: any = await SchoolSite.findOne({ schoolId }).select('slug published admissions.open').lean();
    return {
      byStatus,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      pendingReview: byStatus.SUBMITTED + byStatus.UNDER_REVIEW,
      thisWeek,
      admissionLink: site ? publicUrlFor(site.slug) : null,
      admissionsOpen: !!site?.admissions?.open && !!site?.published,
    };
  }

  static async getById(schoolId: string, id: string) {
    oid(id, 'id');
    const a = await AdmissionApplication.findOne({ _id: id, schoolId }).lean();
    if (!a) throw new NotFoundError('Application not found');
    return shape(a);
  }

  // ------------------------------------------------------------------
  // Office entry (walk-in applicant typed in by staff)
  // ------------------------------------------------------------------
  static async createOffice(schoolId: string, actor: Actor, data: any) {
    const ap = data?.applicant || {};
    const pa = data?.parent || {};
    if (!String(ap.firstName || '').trim() || !String(ap.lastName || '').trim()) throw new BadRequestError("Child's first and last name are required.");
    if (!String(pa.firstName || '').trim() || !String(pa.lastName || '').trim()) throw new BadRequestError("Parent's first and last name are required.");
    if (!pa.phone || normalizePhone(pa.phone).length < 11) throw new BadRequestError("Parent's phone number is required.");

    let cls: any = null;
    const classId = optOid(data.classAppliedId, 'classAppliedId');
    if (classId) {
      cls = await Class.findOne({ _id: classId, schoolId }).select('name').lean();
      if (!cls) throw new BadRequestError('Class not found.');
    }

    const app = await AdmissionApplication.create({
      schoolId,
      applicationNumber: await newApplicationNumber(schoolId),
      status: 'SUBMITTED',
      source: 'OFFICE',
      applicant: {
        firstName: String(ap.firstName).trim(), lastName: String(ap.lastName).trim(),
        gender: ap.gender === 'FEMALE' ? 'FEMALE' : ap.gender === 'MALE' ? 'MALE' : undefined,
        dateOfBirth: ap.dateOfBirth ? new Date(ap.dateOfBirth) : undefined,
        previousSchool: ap.previousSchool, address: ap.address,
        photo: await normalizeImageField(ap.photo, 'applicants'),
      },
      classAppliedId: cls?._id, classAppliedName: cls?.name,
      parent: {
        firstName: String(pa.firstName).trim(), lastName: String(pa.lastName).trim(),
        phone: localPhone(pa.phone), email: pa.email ? String(pa.email).toLowerCase() : undefined,
        relationship: pa.relationship || 'Guardian', address: pa.address,
      },
      answers: data.answers && typeof data.answers === 'object' ? data.answers : undefined,
      history: [{ status: 'SUBMITTED', by: actor.id, byName: actor.name, at: new Date(), note: 'Entered at the school office' }],
    });
    return shape(app.toObject());
  }

  static async update(schoolId: string, id: string, data: any) {
    oid(id, 'id');
    const app: any = await AdmissionApplication.findOne({ _id: id, schoolId });
    if (!app) throw new NotFoundError('Application not found');
    if (app.status === 'ENROLLED') throw new BadRequestError('An enrolled application can no longer be edited. Edit the student instead.');

    const ap = data?.applicant || {};
    const pa = data?.parent || {};
    for (const k of ['firstName', 'lastName', 'previousSchool', 'address'] as const) {
      if (ap[k] !== undefined) app.applicant[k] = String(ap[k]).trim();
    }
    if (ap.gender !== undefined) app.applicant.gender = ap.gender === 'FEMALE' ? 'FEMALE' : ap.gender === 'MALE' ? 'MALE' : undefined;
    if (ap.dateOfBirth !== undefined) app.applicant.dateOfBirth = ap.dateOfBirth ? new Date(ap.dateOfBirth) : undefined;
    if (ap.photo !== undefined) app.applicant.photo = await normalizeImageField(ap.photo, 'applicants');
    for (const k of ['firstName', 'lastName', 'relationship', 'address'] as const) {
      if (pa[k] !== undefined) app.parent[k] = String(pa[k]).trim();
    }
    if (pa.phone !== undefined) app.parent.phone = localPhone(pa.phone);
    if (pa.email !== undefined) app.parent.email = pa.email ? String(pa.email).toLowerCase() : undefined;
    if (data.classAppliedId !== undefined) {
      if (!data.classAppliedId) { app.classAppliedId = undefined; app.classAppliedName = undefined; }
      else {
        const cls: any = await Class.findOne({ _id: oid(data.classAppliedId, 'classAppliedId'), schoolId }).select('name').lean();
        if (!cls) throw new BadRequestError('Class not found.');
        app.classAppliedId = cls._id; app.classAppliedName = cls.name;
      }
    }
    await app.save();
    return shape(app.toObject());
  }

  static async addNote(schoolId: string, actor: Actor, id: string, textValue: string) {
    oid(id, 'id');
    const t = String(textValue || '').trim();
    if (!t) throw new BadRequestError('Note text is required.');
    const app: any = await AdmissionApplication.findOne({ _id: id, schoolId });
    if (!app) throw new NotFoundError('Application not found');
    app.notes.push({ text: t.slice(0, 2000), by: actor.id, byName: actor.name, at: new Date() });
    await app.save();
    return shape(app.toObject());
  }

  // ------------------------------------------------------------------
  // Decisions
  // ------------------------------------------------------------------
  static async setStatus(schoolId: string, actor: Actor, id: string, data: any) {
    oid(id, 'id');
    const status = String(data?.status || '').toUpperCase() as AdmissionStatus;
    if (!ADMISSION_STATUSES.includes(status)) throw new BadRequestError(`status must be one of: ${ADMISSION_STATUSES.join(', ')}`);
    if (status === 'ENROLLED') throw new BadRequestError('Use the enrol/approve action to enrol an applicant.');
    if (status === 'ADMITTED') return AdmissionService.approve(schoolId, actor, id, { enroll: false, note: data.note });

    const app: any = await AdmissionApplication.findOne({ _id: id, schoolId });
    if (!app) throw new NotFoundError('Application not found');
    if (app.status === 'ENROLLED') throw new BadRequestError('This applicant is already enrolled.');

    app.status = status;
    if (status === 'INTERVIEW_SCHEDULED') {
      const when = data.interview?.date ? new Date(data.interview.date) : null;
      if (!when || isNaN(when.getTime())) throw new BadRequestError('Give the interview date and time.');
      app.interview = { date: when, location: data.interview?.location, notes: data.interview?.notes };
    }
    if (status === 'REJECTED' || status === 'WAITLISTED') {
      app.decision = { reason: data.reason ? String(data.reason).slice(0, 500) : undefined, by: actor.id, at: new Date() };
    }
    pushHistory(app, status, actor, data.note);
    await app.save();

    const school: any = await School.findById(schoolId).select('name notificationSettings').lean();
    const who = `${app.applicant.firstName} ${app.applicant.lastName}`;
    let sms: string | null = null;
    if (status === 'INTERVIEW_SCHEDULED') {
      sms = `${school?.name}: interview for ${who} on ${new Date(app.interview.date).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}${app.interview.location ? ` at ${app.interview.location}` : ''}. Ref ${app.applicationNumber}.`;
    } else if (status === 'WAITLISTED') {
      sms = `${school?.name}: ${who} is on our waiting list. We will contact you if a place opens. Ref ${app.applicationNumber}.`;
    } else if (status === 'REJECTED') {
      sms = `${school?.name}: we are unable to offer ${who} a place this time. Ref ${app.applicationNumber}.`;
    }
    if (sms && school?.notificationSettings?.smsOnAdmission !== false) void Notifier.sms(schoolId, app.parent.phone, sms);
    return shape(app.toObject());
  }

  static async reject(schoolId: string, actor: Actor, id: string, reason?: string) {
    return AdmissionService.setStatus(schoolId, actor, id, { status: 'REJECTED', reason });
  }

  /**
   * Approve the applicant. By default this also enrols them straight away:
   * student record, class, first invoice, parent portal login and (optionally)
   * student login, all in one step.
   */
  static async approve(
    schoolId: string,
    actor: Actor,
    id: string,
    opts: { classId?: string; enroll?: boolean; note?: string; admissionNumber?: string; createStudentLogin?: boolean } = {}
  ) {
    oid(id, 'id');
    const app: any = await AdmissionApplication.findOne({ _id: id, schoolId });
    if (!app) throw new NotFoundError('Application not found');

    if (app.status === 'ENROLLED') return AdmissionService.enroll(schoolId, actor, id, opts);
    if (['REJECTED', 'WITHDRAWN'].includes(app.status)) {
      throw new BadRequestError(`This application is ${app.status.toLowerCase()}. Reopen it (set status to UNDER_REVIEW) before approving.`);
    }

    if (app.status !== 'ADMITTED') {
      app.status = 'ADMITTED';
      app.decision = { reason: opts.note, by: actor.id, at: new Date() };
      pushHistory(app, 'ADMITTED', actor, opts.note || 'Approved');
      await app.save();
    }

    if (opts.enroll === false) {
      const school: any = await School.findById(schoolId).select('name notificationSettings').lean();
      if (school?.notificationSettings?.smsOnAdmission !== false) {
        void Notifier.sms(schoolId, app.parent.phone,
          `${school?.name}: congratulations! ${app.applicant.firstName} ${app.applicant.lastName} has been offered admission. The school will send the next steps. Ref ${app.applicationNumber}.`);
      }
      return { application: shape(app.toObject()), enrolled: false };
    }
    return AdmissionService.enroll(schoolId, actor, id, opts);
  }

  // ------------------------------------------------------------------
  // Enrolment: applicant becomes a student + guardian portal is created
  // ------------------------------------------------------------------
  static async enroll(
    schoolId: string,
    actor: Actor,
    id: string,
    opts: { classId?: string; admissionNumber?: string; createStudentLogin?: boolean } = {}
  ) {
    oid(id, 'id');
    const app: any = await AdmissionApplication.findOne({ _id: id, schoolId });
    if (!app) throw new NotFoundError('Application not found');
    if (['REJECTED', 'WITHDRAWN'].includes(app.status)) throw new BadRequestError('This application is not active.');

    // Idempotent: a second call never creates a second student.
    if (app.status === 'ENROLLED' && app.studentId) {
      return { application: shape(app.toObject()), enrolled: true, alreadyEnrolled: true, student: await StudentService.getById(schoolId, String(app.studentId)), credentials: null };
    }

    const classId = opts.classId || (app.classAppliedId ? String(app.classAppliedId) : '');
    if (!classId || !mongoose.isValidObjectId(classId)) {
      throw new BadRequestError('Choose the class to place this student in (classId).');
    }
    const cls: any = await Class.findOne({ _id: classId, schoolId }).select('name').lean();
    if (!cls) throw new BadRequestError('Class not found in this school.');

    // 1. Guardian record (reuse the same phone number so siblings share one parent)
    let parent: any = app.parentId ? await Parent.findOne({ _id: app.parentId, schoolId }) : null;
    if (!parent) {
      const intl = normalizePhone(app.parent.phone);
      parent = await Parent.findOne({ schoolId, phone: { $in: [app.parent.phone, intl, `+${intl}`, localPhone(app.parent.phone)] } });
    }
    if (!parent) {
      parent = await Parent.create({
        schoolId,
        firstName: app.parent.firstName, lastName: app.parent.lastName,
        phone: app.parent.phone, email: app.parent.email || undefined,
        relationship: app.parent.relationship || 'Guardian', address: app.parent.address || undefined,
      });
    }

    // 2. Student record (also creates the first invoice from the class fee structure)
    let studentId = app.studentId ? String(app.studentId) : '';
    if (!studentId) {
      await assertStudentCapacity(schoolId);
      let created: any = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3 && !created; attempt++) {
        try {
          created = await StudentService.create(schoolId, {
            firstName: app.applicant.firstName,
            lastName: app.applicant.lastName,
            admissionNumber: attempt === 0 && opts.admissionNumber ? opts.admissionNumber : await nextAdmissionNumber(schoolId),
            classId,
            gender: app.applicant.gender,
            dateOfBirth: app.applicant.dateOfBirth,
            address: app.applicant.address || app.parent.address,
            photo: app.applicant.photo,
            parentIds: [String(parent._id)],
          }, { skipPortalAccounts: true });
        } catch (e: any) {
          lastErr = e;
          if (!/admission number already exists/i.test(String(e?.message))) throw e;
          if (opts.admissionNumber && attempt === 0) throw e;
        }
      }
      if (!created) throw lastErr || new BadRequestError('Could not create the student.');
      studentId = String(created.id);
      // Save progress immediately so a retry after a later failure resumes here.
      app.studentId = studentId;
      app.parentId = parent._id;
      await app.save();
    }

    const student: any = await Student.findOne({ _id: studentId, schoolId }).lean();
    if (!student) throw new NotFoundError('Student record missing.');

    const school: any = await School.findById(schoolId).select('name notificationSettings').lean();
    const site: any = await SchoolSite.findOne({ schoolId }).select('slug').lean();
    const loginUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/+$/, '')}/login` : '';

    // 3. Guardian portal login
    const credentials: { parent: any; student: any } = { parent: null, student: null };
    // Username = phone number, first password = phone number (they can change it any time).
    const parentLogin = await PortalAccountService.ensureParentUser(schoolId, parent);
    const parentUser: any = parentLogin.user;
    if (!parentUser) throw new BadRequestError('Could not create the parent login. Check the parent phone number.');
    credentials.parent = { username: parentLogin.username, password: parentLogin.password, isNew: parentLogin.isNew };

    // 4. Student portal login
    if (opts.createStudentLogin !== false) {
      // Username = admission number, first password = admission number.
      const studentLogin = await PortalAccountService.ensureStudentUser(schoolId, student);
      credentials.student = { username: studentLogin.username, password: studentLogin.password, isNew: studentLogin.isNew };
    }

    // 5. Close out the application
    if (app.status !== 'ENROLLED') {
      app.status = 'ENROLLED';
      app.enrolledAt = new Date();
      app.decision = { ...(app.decision?.toObject?.() || app.decision || {}), by: actor.id, at: new Date() };
      pushHistory(app, 'ENROLLED', actor, `Enrolled in ${cls.name} as ${student.admissionNumber}`);
      await app.save();
    }

    // 6. Tell the family how to log in (passwords are only ever sent/returned once)
    const childName = student.fullName || `${student.firstName} ${student.lastName}`;
    if (credentials.parent?.isNew) {
      const sms = `${school?.name}: welcome! ${childName} is admitted to ${cls.name} (Adm No ${student.admissionNumber}). Parent portal - username: ${credentials.parent.username} password: ${credentials.parent.password}${loginUrl ? ` Login: ${loginUrl}` : ''}`;
      if (school?.notificationSettings?.smsOnAdmission !== false) void Notifier.sms(schoolId, parent.phone, sms);
      if (parent.email) {
        void Notifier.email(parent.email, `Welcome to ${school?.name}`,
          `<p>${childName} has been admitted to <b>${cls.name}</b> (Admission No <b>${student.admissionNumber}</b>).</p>
           <p>Parent portal login:<br>Username: <b>${credentials.parent.username}</b><br>Password: <b>${credentials.parent.password}</b></p>
           ${credentials.student?.isNew ? `<p>Student login:<br>Username: <b>${credentials.student.username}</b><br>Password: <b>${credentials.student.password}</b></p>` : ''}
           ${loginUrl ? `<p><a href="${loginUrl}">Sign in</a></p>` : ''}<p>Please change your password after your first login.</p>`);
      }
    } else if (school?.notificationSettings?.smsOnAdmission !== false) {
      void Notifier.sms(schoolId, parent.phone, `${school?.name}: ${childName} is admitted to ${cls.name} (Adm No ${student.admissionNumber}). He/she is now on your existing parent portal.`);
    }
    void Notifier.users(schoolId, [parentUser._id], 'Admission confirmed', `${childName} has been admitted to ${cls.name}.`, { kind: 'ADMISSION_ENROLLED', studentId: studentId });
    void Notifier.admins(schoolId, 'Student enrolled', `${childName} was enrolled in ${cls.name}.`, { kind: 'STUDENT_ENROLLED', studentId });

    logger.info(`Application ${app.applicationNumber} enrolled as student ${studentId} (school ${schoolId})`);

    return {
      application: shape(app.toObject()),
      enrolled: true,
      alreadyEnrolled: false,
      student: await StudentService.getById(schoolId, studentId),
      guardian: { id: String(parent._id), name: `${parent.firstName} ${parent.lastName}`.trim(), phone: parent.phone },
      // Shown to the admin once. Stored only as a hash.
      credentials,
      siteLink: site ? publicUrlFor(site.slug) : null,
    };
  }
}
