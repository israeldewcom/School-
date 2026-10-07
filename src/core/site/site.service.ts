// src/core/site/site.service.ts
import crypto from 'crypto';
import mongoose from 'mongoose';
import { School } from '../../models/School';
import { Class } from '../../models/Class';
import { Student } from '../../models/Student';
import { AdmissionApplication } from '../../models/AdmissionApplication';
import {
  SchoolSite, ISchoolSite, ISiteBlock, IAdmissionFormField,
  SITE_BLOCK_TYPES, FORM_FIELD_TYPES,
} from '../../models/SchoolSite';
import { saveImage } from '../../services/storage.service';
import { Notifier } from '../../services/notifier.service';
import { BadRequestError, ConflictError, NotFoundError } from '../../middleware/error.middleware';
import { env } from '../../config/env';
import { normalizePhone, phoneKey } from '../../utils/phone';
import { escapeRegex } from '../../utils/validate';
import { defaultBlocks, defaultFormFields, FONT_CHOICES, MANDATORY_FIELD_KEYS, newBlockId, RESERVED_SLUGS } from './site.defaults';
import logger from '../../config/logger';

const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_KEYS = /(image|img|photo|logo|url|link|href)$/i;

export function safeUrl(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.startsWith('/uploads/')) return s;
  if (/^https:\/\/[^\s<>"']+$/i.test(s)) return s;
  return '';
}

export function slugify(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/['"`’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function publicBase(): string {
  return String(env.PUBLIC_SITE_BASE_URL || '').replace(/\/+$/, '');
}
export function publicUrlFor(slug: string): string {
  return `${publicBase()}/s/${slug}`;
}

// Sanitise block data: primitives only, capped sizes, safe URLs.
function cleanData(value: any, key = '', depth = 0): any {
  if (depth > 4) return undefined;
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    if (URL_KEYS.test(key)) return safeUrl(value);
    return value.slice(0, key === 'body' ? 10000 : 2000);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 24).map((v) => cleanData(v, key, depth + 1)).filter((v) => v !== undefined);
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value).slice(0, 30)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(k)) continue;
      const v = cleanData(value[k], k, depth + 1);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return undefined;
}

function cleanBlocks(input: any): ISiteBlock[] {
  if (!Array.isArray(input)) throw new BadRequestError('blocks must be an array');
  if (input.length > 30) throw new BadRequestError('A page can have at most 30 sections.');
  return input.map((b: any, i: number) => {
    const type = String(b?.type || '').toUpperCase();
    if (!(SITE_BLOCK_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestError(`Unknown section type "${b?.type}". Allowed: ${SITE_BLOCK_TYPES.join(', ')}`);
    }
    return {
      id: /^[a-f0-9]{6,20}$/i.test(String(b?.id || '')) ? String(b.id) : newBlockId(),
      type: type as ISiteBlock['type'],
      enabled: b?.enabled !== false,
      order: i,
      data: cleanData(b?.data || {}) || {},
    };
  });
}

function cleanFields(input: any): IAdmissionFormField[] {
  if (!Array.isArray(input)) throw new BadRequestError('fields must be an array');
  const defaults = defaultFormFields();
  const defaultByKey = new Map(defaults.map((f) => [f.key, f]));
  const seen = new Set<string>();
  const out: IAdmissionFormField[] = [];
  let custom = 0;

  for (const raw of input) {
    const label = String(raw?.label || '').trim().slice(0, 120);
    let key = String(raw?.key || '').trim();
    const builtIn = defaultByKey.get(key);

    if (builtIn) {
      if (seen.has(key)) continue;
      seen.add(key);
      const mandatory = MANDATORY_FIELD_KEYS.has(key);
      out.push({
        ...builtIn,
        label: label || builtIn.label,
        required: mandatory ? true : !!raw.required,
        enabled: mandatory ? true : raw.enabled !== false,
        placeholder: raw.placeholder ? String(raw.placeholder).slice(0, 120) : builtIn.placeholder,
        options: builtIn.options
          ? Array.isArray(raw.options) && raw.options.length
            ? raw.options.slice(0, 20).map((o: any) => String(o).slice(0, 60))
            : builtIn.options
          : undefined,
      });
      continue;
    }

    // Custom question
    if (!label) throw new BadRequestError('Every custom question needs a label.');
    if (++custom > 25) throw new BadRequestError('You can add at most 25 custom questions.');
    if (!/^custom_[a-z0-9_]{1,40}$/.test(key)) key = `custom_${slugify(label).replace(/-/g, '_').slice(0, 30) || crypto.randomBytes(3).toString('hex')}`;
    while (seen.has(key)) key = `${key}_${crypto.randomBytes(2).toString('hex')}`;
    seen.add(key);
    const type = String(raw?.type || 'text');
    if (!(FORM_FIELD_TYPES as readonly string[]).includes(type) || type === 'photo') {
      throw new BadRequestError(`Custom question type must be one of: text, textarea, select, date, phone, email, number`);
    }
    if (type === 'select' && !(Array.isArray(raw.options) && raw.options.length >= 2)) {
      throw new BadRequestError(`"${label}" is a dropdown — give it at least two options.`);
    }
    out.push({
      key, label, type: type as any, section: 'custom',
      required: !!raw.required, enabled: raw.enabled !== false, builtIn: false,
      placeholder: raw.placeholder ? String(raw.placeholder).slice(0, 120) : undefined,
      options: type === 'select' ? raw.options.slice(0, 20).map((o: any) => String(o).slice(0, 60)) : undefined,
    });
  }

  // Any built-in field the client left out is restored (so the form can never lose required data).
  for (const d of defaults) if (!seen.has(d.key)) out.push(d);
  return out;
}

let slugCache: { expires: number; rows: Array<{ slug: string; slugCompact: string; slugHistory: string[] }> } | null = null;
function bustSlugCache() { slugCache = null; }

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Received',
  UNDER_REVIEW: 'Under review',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  ADMITTED: 'Admitted',
  WAITLISTED: 'Waitlisted',
  REJECTED: 'Not successful',
  ENROLLED: 'Enrolled',
  WITHDRAWN: 'Withdrawn',
};

export function localPhone(raw: any): string {
  const n = normalizePhone(raw);
  return n.startsWith('234') ? `0${n.slice(3)}` : n;
}

export class SiteService {
  // ------------------------------------------------------------------
  // Create / fetch (auto-created the first time it is needed)
  // ------------------------------------------------------------------
  static async ensureSite(schoolId: string): Promise<ISchoolSite> {
    const existing = await SchoolSite.findOne({ schoolId });
    if (existing) return existing;

    const school: any = await School.findById(schoolId).select('name slug motto logo').lean();
    if (!school) throw new NotFoundError('School not found');

    let base = slugify(school.slug || school.name) || `school-${crypto.randomBytes(3).toString('hex')}`;
    if (base.length < 3) base = `${base}-school`;
    if (RESERVED_SLUGS.has(base)) base = `${base}-school`;
    base = base.slice(0, 60).replace(/-+$/, '');

    let slug = base;
    for (let i = 0; i < 6; i++) {
      const taken = await SchoolSite.findOne({ $or: [{ slug }, { slugHistory: slug }] }).select('_id').lean();
      if (!taken) break;
      slug = `${base.slice(0, 54)}-${crypto.randomBytes(2).toString('hex')}`;
    }

    try {
      const site = await SchoolSite.create({
        schoolId,
        slug,
        published: true,
        theme: { logoUrl: safeUrl(school.logo) || undefined },
        seo: { title: school.name, description: school.motto || `Welcome to ${school.name}` },
        blocks: defaultBlocks({ name: school.name, motto: school.motto }),
        admissions: { open: true, fields: defaultFormFields(), successMessage: 'Thank you! Your application has been received. The school will contact you soon.' },
      });
      bustSlugCache();
      return site;
    } catch (err: any) {
      if (err?.code === 11000) {
        const again = await SchoolSite.findOne({ schoolId });
        if (again) return again;
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Admin
  // ------------------------------------------------------------------
  static async getAdmin(schoolId: string) {
    const site = await SiteService.ensureSite(schoolId);
    const classes = await Class.find({ schoolId, isActive: true }).select('name level').sort({ level: 1, name: 1 }).lean();
    return {
      ...site.toObject(),
      publicUrl: publicUrlFor(site.slug),
      classes: classes.map((c: any) => ({ id: String(c._id), name: c.name })),
      fontChoices: FONT_CHOICES,
      blockTypes: SITE_BLOCK_TYPES,
      templates: ['modern', 'classic', 'bold'],
    };
  }

  static async update(schoolId: string, patch: any) {
    const site = await SiteService.ensureSite(schoolId);
    const p = patch || {};

    if (p.published !== undefined) site.published = !!p.published;

    if (p.theme) {
      const t = p.theme;
      if (t.primaryColor !== undefined) {
        if (!HEX.test(t.primaryColor)) throw new BadRequestError('primaryColor must look like #0f766e');
        site.theme.primaryColor = t.primaryColor;
      }
      if (t.secondaryColor !== undefined) {
        if (!HEX.test(t.secondaryColor)) throw new BadRequestError('secondaryColor must look like #f59e0b');
        site.theme.secondaryColor = t.secondaryColor;
      }
      if (t.fontFamily !== undefined) {
        if (!FONT_CHOICES.includes(t.fontFamily)) throw new BadRequestError('Choose a font from fontChoices.');
        site.theme.fontFamily = t.fontFamily;
      }
      if (t.template !== undefined) {
        if (!['modern', 'classic', 'bold'].includes(t.template)) throw new BadRequestError('template must be modern, classic or bold');
        site.theme.template = t.template;
      }
      if (t.heroImage !== undefined) site.theme.heroImage = safeUrl(t.heroImage) || undefined;
      if (t.logoUrl !== undefined) site.theme.logoUrl = safeUrl(t.logoUrl) || undefined;
    }

    if (p.seo) {
      if (p.seo.title !== undefined) site.seo.title = String(p.seo.title).slice(0, 70);
      if (p.seo.description !== undefined) site.seo.description = String(p.seo.description).slice(0, 160);
    }

    if (p.socials) {
      for (const k of ['facebook', 'instagram', 'x', 'youtube', 'whatsapp'] as const) {
        if (p.socials[k] !== undefined) (site.socials as any)[k] = safeUrl(p.socials[k]) || undefined;
      }
    }

    if (p.blocks !== undefined) site.blocks = cleanBlocks(p.blocks) as any;

    if (p.admissions) {
      const a = p.admissions;
      if (a.open !== undefined) site.admissions.open = !!a.open;
      if (a.intro !== undefined) site.admissions.intro = String(a.intro).slice(0, 2000);
      if (a.successMessage !== undefined) site.admissions.successMessage = String(a.successMessage).slice(0, 500);
      if (a.closingDate !== undefined) {
        if (!a.closingDate) site.admissions.closingDate = undefined;
        else {
          const d = new Date(a.closingDate);
          if (isNaN(d.getTime())) throw new BadRequestError('closingDate is not a valid date.');
          site.admissions.closingDate = d;
        }
      }
      if (a.classIds !== undefined) {
        const ids = (Array.isArray(a.classIds) ? a.classIds : []).filter((x: any) => mongoose.isValidObjectId(x));
        const found = await Class.find({ _id: { $in: ids }, schoolId }).select('_id').lean();
        site.admissions.classIds = found.map((c: any) => c._id) as any;
      }
      if (a.fields !== undefined) site.admissions.fields = cleanFields(a.fields) as any;
    }

    // Keep the school's own record in sync for the colour/logo the dashboard shows.
    await site.save();
    bustSlugCache();
    return SiteService.getAdmin(schoolId);
  }

  static async checkSlug(schoolId: string, raw: string) {
    const slug = slugify(raw);
    const reason = await SiteService.slugProblem(schoolId, slug);
    return { slug, available: !reason, reason: reason || null, publicUrl: publicUrlFor(slug) };
  }

  private static async slugProblem(schoolId: string, slug: string): Promise<string | null> {
    if (!slug || slug.length < 3 || slug.length > 60) return 'Use 3 to 60 characters.';
    if (!SLUG_RE.test(slug)) return 'Use only letters, numbers and single dashes.';
    if (RESERVED_SLUGS.has(slug)) return 'That name is reserved.';
    const clash = await SchoolSite.findOne({ $or: [{ slug }, { slugHistory: slug }], schoolId: { $ne: schoolId } }).select('_id').lean();
    return clash ? 'That link is already taken by another school.' : null;
  }

  /** Change the school's link. The old link keeps redirecting to the new one. */
  static async changeSlug(schoolId: string, raw: string) {
    const site = await SiteService.ensureSite(schoolId);
    const slug = slugify(raw);
    if (slug === site.slug) return SiteService.getAdmin(schoolId);
    const reason = await SiteService.slugProblem(schoolId, slug);
    if (reason) throw new ConflictError(reason);
    if (!site.slugHistory.includes(site.slug)) site.slugHistory.push(site.slug);
    site.slugHistory = site.slugHistory.filter((s) => s !== slug).slice(-10);
    site.slug = slug;
    await site.save();
    bustSlugCache();
    return SiteService.getAdmin(schoolId);
  }

  static async reset(schoolId: string) {
    const site = await SiteService.ensureSite(schoolId);
    const school: any = await School.findById(schoolId).select('name motto').lean();
    site.blocks = defaultBlocks({ name: school.name, motto: school.motto }) as any;
    await site.save();
    return SiteService.getAdmin(schoolId);
  }

  static async uploadImage(dataUrl: string) {
    if (!dataUrl) throw new BadRequestError('dataUrl is required');
    return { url: await saveImage({ dataUrl, folder: 'site' }) };
  }

  // ------------------------------------------------------------------
  // Public: link resolution that forgives typos, spaces and old links
  // ------------------------------------------------------------------
  static async resolve(input: string): Promise<{ site: ISchoolSite; redirect: boolean } | null> {
    let raw = String(input || '');
    try { raw = decodeURIComponent(raw); } catch (_) {}
    const slug = slugify(raw);
    if (!slug) return null;
    const compact = slug.replace(/-/g, '');

    const exact = await SchoolSite.findOne({ slug });
    if (exact) return { site: exact, redirect: false };

    const prev = await SchoolSite.findOne({ slugHistory: slug });
    if (prev) return { site: prev, redirect: true };

    const byCompact = await SchoolSite.findOne({ slugCompact: compact, published: true });
    if (byCompact) return { site: byCompact, redirect: true };

    if (!slugCache || slugCache.expires < Date.now()) {
      const rows = await SchoolSite.find({ published: true }).select('slug slugCompact slugHistory').lean();
      slugCache = { expires: Date.now() + 60_000, rows: rows as any };
    }
    const rows = slugCache.rows;

    // Prefix: "stmary" -> "stmarys-college" when exactly one school starts with it.
    if (compact.length >= 4) {
      const pref = rows.filter((r) => r.slugCompact.startsWith(compact));
      if (pref.length === 1) {
        const s = await SchoolSite.findOne({ slug: pref[0].slug });
        if (s) return { site: s, redirect: true };
      }
    }

    // Typos: pick the single closest slug within a small distance.
    const maxDist = compact.length >= 10 ? 2 : compact.length >= 5 ? 1 : 0;
    if (maxDist > 0) {
      const scored = rows
        .map((r) => ({ r, d: lev(compact, r.slugCompact) }))
        .filter((x) => x.d <= maxDist)
        .sort((a, b) => a.d - b.d);
      if (scored.length && (scored.length === 1 || scored[0].d < scored[1].d)) {
        const s = await SchoolSite.findOne({ slug: scored[0].r.slug });
        if (s) return { site: s, redirect: true };
      }
    }
    return null;
  }

  static async publicPayload(input: string) {
    const hit = await SiteService.resolve(input);
    if (!hit) throw new NotFoundError('We could not find a school with that link.');
    const { site, redirect } = hit;
    if (!site.published) throw new NotFoundError('This school website is not published yet.');

    const [school, allClasses, studentCount]: any[] = await Promise.all([
      School.findById(site.schoolId).select('name logo motto address phone email city state website').lean(),
      Class.find({ schoolId: site.schoolId, isActive: true }).select('name level').sort({ level: 1, name: 1 }).lean(),
      Student.countDocuments({ schoolId: site.schoolId, status: 'ACTIVE' }),
    ]);
    if (!school) throw new NotFoundError('School not found');

    const allowed = site.admissions.classIds.map(String);
    const openClasses = allClasses.filter((c: any) => allowed.length === 0 || allowed.includes(String(c._id)));
    const closing = site.admissions.closingDate;
    const isOpen = site.admissions.open && (!closing || closing.getTime() >= Date.now());

    const blocks = [...site.blocks]
      .filter((b) => b.enabled)
      .sort((a, b) => a.order - b.order)
      .map((b) => {
        const data = JSON.parse(JSON.stringify(b.data || {}));
        if (b.type === 'STATS' && Array.isArray(data.items)) {
          data.items = data.items.map((it: any) => ({
            label: it.label,
            value: it.auto === 'students' ? String(studentCount) : it.auto === 'classes' ? String(allClasses.length) : String(it.value ?? ''),
          }));
        }
        if (b.type === 'PROGRAMS' && data.showClasses) {
          data.items = [...(data.items || []), ...allClasses.map((c: any) => ({ title: c.name }))];
        }
        return { id: b.id, type: b.type, data };
      });

    const fields = site.admissions.fields
      .filter((f) => f.enabled)
      .map((f) => {
        const o: any = { key: f.key, label: f.label, type: f.type, required: f.required, section: f.section, placeholder: f.placeholder, options: f.options };
        if (f.key === 'classAppliedId') {
          o.choices = openClasses.map((c: any) => ({ value: String(c._id), label: c.name }));
        }
        return o;
      });

    return {
      slug: site.slug,
      redirected: redirect,
      canonicalUrl: publicUrlFor(site.slug),
      portalUrl: String(env.PORTAL_URL || '').replace(/\/+$/, ''),
      school: {
        name: school.name, logo: safeUrl(school.logo) || safeUrl(site.theme.logoUrl) || null, motto: school.motto || '',
        address: school.address, phone: school.phone,
        email: String(school.email || '').endsWith('.local') ? '' : school.email,
        city: school.city, state: school.state, website: school.website || '',
      },
      theme: site.theme,
      seo: { title: site.seo.title || school.name, description: site.seo.description || '' },
      socials: site.socials,
      blocks,
      admissions: {
        open: isOpen,
        closingDate: closing || null,
        intro: site.admissions.intro || '',
        successMessage: site.admissions.successMessage || 'Your application has been received.',
        fields,
      },
    };
  }

  // ------------------------------------------------------------------
  // Public: submit an application
  // ------------------------------------------------------------------
  static async submitApplication(input: string, body: any, ip?: string) {
    // Bots fill hidden fields; pretend success and store nothing.
    if (body && body.website_url) return { applicationNumber: 'APP-RECEIVED', message: 'Thank you.' };

    const hit = await SiteService.resolve(input);
    if (!hit || !hit.site.published) throw new NotFoundError('We could not find that school.');
    const site = hit.site;
    const schoolId = String(site.schoolId);

    const closing = site.admissions.closingDate;
    if (!site.admissions.open || (closing && closing.getTime() < Date.now())) {
      throw new BadRequestError('Admissions are currently closed for this school.');
    }

    const fields = site.admissions.fields.filter((f) => f.enabled);
    const v: Record<string, any> = {};
    const answers: Record<string, any> = {};
    const errors: string[] = [];

    for (const f of fields) {
      let val = body?.[f.key];
      if (f.type === 'photo') {
        if (val) {
          try { v[f.key] = await saveImage({ dataUrl: String(val), folder: 'applicants' }); }
          catch (e: any) { errors.push(`${f.label}: ${e.message}`); }
        } else if (f.required) errors.push(`${f.label} is required.`);
        continue;
      }
      val = val === undefined || val === null ? '' : String(val).trim();
      if (!val) {
        if (f.required) errors.push(`${f.label} is required.`);
        continue;
      }
      const max = f.type === 'textarea' ? 3000 : 300;
      if (val.length > max) { errors.push(`${f.label} is too long.`); continue; }

      switch (f.type) {
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) errors.push(`${f.label} is not a valid email.`);
          break;
        case 'phone':
          if (phoneKey(val).length < 10) errors.push(`${f.label} is not a valid phone number.`);
          break;
        case 'number':
          if (!Number.isFinite(Number(val))) errors.push(`${f.label} must be a number.`);
          break;
        case 'date': {
          const d = new Date(val);
          if (isNaN(d.getTime())) errors.push(`${f.label} is not a valid date.`);
          else if (d.getTime() > Date.now()) errors.push(`${f.label} cannot be in the future.`);
          break;
        }
        case 'select':
          if (f.key !== 'classAppliedId' && f.options && f.options.length && !f.options.includes(val)) {
            errors.push(`${f.label}: choose one of the options.`);
          }
          break;
      }
      v[f.key] = val;
      if (f.section === 'custom') answers[f.key] = val;
    }
    if (errors.length) throw new BadRequestError(errors.join(' '));

    let classApplied: any = null;
    if (v.classAppliedId) {
      if (!mongoose.isValidObjectId(v.classAppliedId)) throw new BadRequestError('Choose a valid class.');
      const allowed = site.admissions.classIds.map(String);
      if (allowed.length && !allowed.includes(String(v.classAppliedId))) throw new BadRequestError('That class is not open for applications.');
      classApplied = await Class.findOne({ _id: v.classAppliedId, schoolId, isActive: true }).select('name').lean();
      if (!classApplied) throw new BadRequestError('Choose a valid class.');
    }

    const parentPhone = localPhone(v.parentPhone);
    const dupe = await AdmissionApplication.findOne({
      schoolId,
      'parent.phone': parentPhone,
      'applicant.firstName': new RegExp(`^${escapeRegex(v.applicantFirstName)}$`, 'i'),
      'applicant.lastName': new RegExp(`^${escapeRegex(v.applicantLastName)}$`, 'i'),
      status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'ADMITTED', 'WAITLISTED'] },
    })
      .select('applicationNumber')
      .lean();
    if (dupe) {
      throw new ConflictError(`An application for this child was already submitted (${(dupe as any).applicationNumber}). Use "Check status" to follow it.`);
    }

    let applicationNumber = '';
    for (let i = 0; i < 6; i++) {
      const cand = `APP-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const used = await AdmissionApplication.exists({ schoolId, applicationNumber: cand });
      if (!used) { applicationNumber = cand; break; }
    }
    if (!applicationNumber) throw new ConflictError('Could not generate an application number. Please try again.');

    const gender = v.gender === 'FEMALE' || v.gender === 'MALE' ? v.gender : undefined;
    const app = await AdmissionApplication.create({
      schoolId,
      applicationNumber,
      status: 'SUBMITTED',
      source: 'ONLINE',
      siteSlug: site.slug,
      applicant: {
        firstName: v.applicantFirstName,
        lastName: v.applicantLastName,
        gender,
        dateOfBirth: v.dateOfBirth ? new Date(v.dateOfBirth) : undefined,
        previousSchool: v.previousSchool,
        address: v.applicantAddress,
        photo: v.applicantPhoto,
      },
      classAppliedId: classApplied?._id,
      classAppliedName: classApplied?.name,
      parent: {
        firstName: v.parentFirstName,
        lastName: v.parentLastName,
        phone: parentPhone,
        email: v.parentEmail ? String(v.parentEmail).toLowerCase() : undefined,
        relationship: v.relationship || 'Guardian',
        address: v.parentAddress,
      },
      answers: Object.keys(answers).length ? answers : undefined,
      history: [{ status: 'SUBMITTED', at: new Date(), note: 'Submitted online' }],
      submittedAt: new Date(),
      submittedIp: ip,
    });

    const school: any = await School.findById(schoolId).select('name notificationSettings').lean();
    const childName = `${v.applicantFirstName} ${v.applicantLastName}`;
    void Notifier.admins(schoolId, 'New admission application', `${childName} applied${classApplied ? ` for ${classApplied.name}` : ''} (${applicationNumber}).`, {
      kind: 'ADMISSION_APPLICATION', applicationId: String(app._id),
    });
    if (school?.notificationSettings?.smsOnAdmission !== false) {
      void Notifier.sms(schoolId, parentPhone, `${school?.name || 'School'}: application ${applicationNumber} received for ${childName}. Check status any time at ${publicUrlFor(site.slug)}`);
    }
    if (v.parentEmail) {
      void Notifier.email(v.parentEmail, `Application received - ${school?.name || 'School'}`,
        `<p>We received the application for <b>${childName.replace(/[<>&]/g, '')}</b>.</p><p>Application number: <b>${applicationNumber}</b></p>`);
    }
    logger.info(`Admission application ${applicationNumber} received for school ${schoolId}`);

    return { applicationNumber, message: site.admissions.successMessage || 'Your application has been received.' };
  }

  static async applicationStatus(input: string, applicationNumber: string, phone: string) {
    const hit = await SiteService.resolve(input);
    if (!hit) throw new NotFoundError('Application not found');
    const app: any = await AdmissionApplication.findOne({
      schoolId: hit.site.schoolId,
      applicationNumber: String(applicationNumber || '').trim().toUpperCase(),
    }).lean();
    // Same error whether the number or the phone is wrong, so numbers cannot be probed.
    if (!app || phoneKey(app.parent?.phone) !== phoneKey(phone) || phoneKey(phone).length < 10) {
      throw new NotFoundError('We could not find an application with those details.');
    }
    const next: Record<string, string> = {
      SUBMITTED: 'The school has received your application and will review it.',
      UNDER_REVIEW: 'The school is reviewing your application.',
      INTERVIEW_SCHEDULED: 'Please attend the interview at the date and place below.',
      ADMITTED: 'Congratulations! The school will send you the next steps.',
      WAITLISTED: 'Your child is on the waiting list. The school will contact you if a place opens.',
      REJECTED: 'Unfortunately the application was not successful this time.',
      ENROLLED: 'Your child is enrolled. Check your SMS/email for the parent portal login.',
      WITHDRAWN: 'This application was withdrawn.',
    };
    return {
      applicationNumber: app.applicationNumber,
      applicantName: `${app.applicant.firstName} ${app.applicant.lastName}`,
      className: app.classAppliedName || null,
      status: app.status,
      statusLabel: STATUS_LABEL[app.status] || app.status,
      message: next[app.status] || '',
      interview: app.status === 'INTERVIEW_SCHEDULED' ? app.interview || null : null,
      submittedAt: app.submittedAt,
    };
  }
}
