// src/core/branding/logo.service.ts
//
// Generates school logos from the school's name and colours (no design skills
// needed), stores the chosen one, and exposes a PNG reader for PDF receipts.
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { School } from '../../models/School';
import { SchoolSite } from '../../models/SchoolSite';
import { saveImage, parseDataUrl } from '../../services/storage.service';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

const HEX = /^#[0-9a-fA-F]{6}$/;
const STOP = new Set([
  'the', 'of', 'and', '&', 'for', 'school', 'schools', 'college', 'academy', 'international',
  'group', 'nursery', 'primary', 'secondary', 'high', 'comprehensive', 'schl', 'sch',
]);

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function initialsFor(name: string): string {
  const words = String(name || '')
    .replace(/[^A-Za-z0-9&\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !STOP.has(w.toLowerCase().replace(/'/g, '')));
  const pool = meaningful.length >= 2 ? meaningful : words;
  const letters = pool.map((w) => w[0]).join('').toUpperCase().slice(0, 3);
  return letters || String(name || 'S').slice(0, 2).toUpperCase();
}

function textColorOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff';
}

interface LogoParams {
  name: string;
  initials: string;
  primary: string;
  secondary: string;
  motto?: string;
}

const FONT = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Arial, sans-serif";

function nameLine(p: LogoParams, y: number, size: number, fill: string, maxWidth = 400): string {
  const t = esc(p.name.toUpperCase());
  const approx = t.length * size * 0.62;
  const fit = approx > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="256" y="${y}" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="${size}" letter-spacing="1" fill="${fill}"${fit}>${t}</text>`;
}

function initialsSize(n: number): number {
  return n >= 3 ? 104 : n === 2 ? 132 : 170;
}

const DESIGNS: Array<{ id: string; label: string; build: (p: LogoParams) => string }> = [
  {
    id: 'crest',
    label: 'Classic crest',
    build: (p) => `
  <path d="M256 40 L440 96 V250 C440 345 360 410 256 452 C152 410 72 345 72 250 V96 Z" fill="${p.primary}"/>
  <path d="M256 62 L420 111 V250 C420 333 350 391 256 429 C162 391 92 333 92 250 V111 Z" fill="none" stroke="${p.secondary}" stroke-width="8"/>
  <text x="256" y="278" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${initialsSize(p.initials.length)}" fill="${textColorOn(p.primary)}">${esc(p.initials)}</text>
  <path d="M176 318 H336" stroke="${p.secondary}" stroke-width="6" stroke-linecap="round"/>
  ${nameLine(p, 486, 26, p.primary)}`,
  },
  {
    id: 'seal',
    label: 'Round seal',
    build: (p) => `
  <circle cx="256" cy="236" r="190" fill="${p.primary}"/>
  <circle cx="256" cy="236" r="170" fill="#ffffff"/>
  <circle cx="256" cy="236" r="154" fill="none" stroke="${p.secondary}" stroke-width="6" stroke-dasharray="2 12" stroke-linecap="round"/>
  <text x="256" y="${236 + initialsSize(p.initials.length) * 0.33}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${initialsSize(p.initials.length) - 10}" fill="${p.primary}">${esc(p.initials)}</text>
  ${nameLine(p, 480, 26, p.primary)}`,
  },
  {
    id: 'book',
    label: 'Open book',
    build: (p) => `
  <rect x="56" y="36" width="400" height="400" rx="72" fill="${p.primary}"/>
  <path d="M256 158 C216 130 160 128 120 146 V334 C160 316 216 318 256 346 C296 318 352 316 392 334 V146 C352 128 296 130 256 158 Z" fill="#ffffff"/>
  <path d="M256 158 V346" stroke="${p.primary}" stroke-width="6"/>
  <path d="M256 70 l12 26 28 4 -20 20 5 28 -25 -14 -25 14 5 -28 -20 -20 28 -4 Z" fill="${p.secondary}"/>
  <text x="256" y="262" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${Math.min(initialsSize(p.initials.length) - 50, 86)}" fill="${p.primary}" transform="translate(0,0)">${esc(p.initials)}</text>
  ${nameLine(p, 486, 26, p.primary)}`,
  },
  {
    id: 'cap',
    label: 'Graduation cap',
    build: (p) => `
  <circle cx="256" cy="236" r="196" fill="${p.secondary}" opacity="0.18"/>
  <path d="M256 92 L436 168 L256 244 L76 168 Z" fill="${p.primary}"/>
  <path d="M146 214 V290 C146 322 196 344 256 344 C316 344 366 322 366 290 V214 L256 262 Z" fill="${p.primary}"/>
  <path d="M436 168 V262" stroke="${p.secondary}" stroke-width="10" stroke-linecap="round"/>
  <circle cx="436" cy="272" r="14" fill="${p.secondary}"/>
  <text x="256" y="420" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="64" letter-spacing="6" fill="${p.primary}">${esc(p.initials)}</text>
  ${nameLine(p, 486, 26, p.primary)}`,
  },
  {
    id: 'hex',
    label: 'Modern badge',
    build: (p) => `
  <path d="M256 36 L436 140 V332 L256 436 L76 332 V140 Z" fill="${p.primary}"/>
  <path d="M256 70 L406 157 V315 L256 402 L106 315 V157 Z" fill="none" stroke="${p.secondary}" stroke-width="10" stroke-linejoin="round"/>
  <text x="256" y="${236 + initialsSize(p.initials.length) * 0.3}" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="${initialsSize(p.initials.length) - 14}" fill="${textColorOn(p.primary)}">${esc(p.initials)}</text>
  ${nameLine(p, 486, 26, p.primary)}`,
  },
  {
    id: 'monogram',
    label: 'Bold monogram',
    build: (p) => `
  <rect x="64" y="44" width="384" height="384" rx="56" fill="${p.primary}"/>
  <rect x="64" y="348" width="384" height="80" rx="0" fill="${p.secondary}"/>
  <path d="M64 348 H448 V372 H64 Z" fill="${p.secondary}"/>
  <rect x="64" y="372" width="384" height="56" rx="0" fill="${p.secondary}"/>
  <path d="M64 372 V372 Q64 428 120 428 H392 Q448 428 448 372 Z" fill="${p.secondary}"/>
  <text x="256" y="${215 + initialsSize(p.initials.length) * 0.32}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${initialsSize(p.initials.length)}" fill="${textColorOn(p.primary)}">${esc(p.initials)}</text>
  <text x="256" y="405" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="22" letter-spacing="3" fill="${textColorOn(p.secondary)}">${esc((p.motto || 'EXCELLENCE').toUpperCase().slice(0, 28))}</text>
  ${nameLine(p, 486, 26, p.primary)}`,
  },
];

function wrapSvg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${inner}</svg>`;
}

function validateColors(primary?: string, secondary?: string) {
  if (primary && !HEX.test(primary)) throw new BadRequestError('primaryColor must be a hex colour like #0f766e');
  if (secondary && !HEX.test(secondary)) throw new BadRequestError('secondaryColor must be a hex colour like #f59e0b');
}

async function loadParams(schoolId: string, input: any): Promise<LogoParams> {
  const school: any = await School.findById(schoolId).select('name motto').lean();
  if (!school) throw new NotFoundError('School not found');
  const site: any = await SchoolSite.findOne({ schoolId }).select('theme').lean();

  validateColors(input?.primaryColor, input?.secondaryColor);
  const name = String(input?.name || school.name || 'School').trim().slice(0, 60);
  const initials = String(input?.initials || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || initialsFor(name);
  return {
    name,
    initials,
    primary: input?.primaryColor || site?.theme?.primaryColor || '#0f766e',
    secondary: input?.secondaryColor || site?.theme?.secondaryColor || '#f59e0b',
    motto: String(input?.motto || school.motto || '').slice(0, 40),
  };
}

function trySharp(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('sharp');
  } catch (_) {
    return null;
  }
}

export class LogoService {
  static async options(schoolId: string, input: any = {}) {
    const p = await loadParams(schoolId, input);
    return {
      params: { name: p.name, initials: p.initials, primaryColor: p.primary, secondaryColor: p.secondary, motto: p.motto || '' },
      variants: DESIGNS.map((d) => ({ id: d.id, label: d.label, svg: wrapSvg(d.build(p)) })),
    };
  }

  /** Build the chosen design on the server (never trust SVG from the client) and save it. */
  static async apply(schoolId: string, input: any) {
    const design = DESIGNS.find((d) => d.id === String(input?.variantId || ''));
    if (!design) throw new BadRequestError(`variantId must be one of: ${DESIGNS.map((d) => d.id).join(', ')}`);
    const p = await loadParams(schoolId, input);
    const svg = wrapSvg(design.build(p));

    const sharp = trySharp();
    let logoUrl: string;
    let svgUrl: string | undefined;
    if (sharp) {
      const png: Buffer = await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer();
      logoUrl = await saveImage({ buffer: png, mime: 'image/png', folder: 'logos' });
      svgUrl = await saveImage({ buffer: Buffer.from(svg), mime: 'image/svg+xml', folder: 'logos', allowSvg: true });
    } else {
      logger.warn('sharp is not installed — saving SVG logo only (PDFs will omit the logo).');
      logoUrl = await saveImage({ buffer: Buffer.from(svg), mime: 'image/svg+xml', folder: 'logos', allowSvg: true });
      svgUrl = logoUrl;
    }

    await School.updateOne({ _id: schoolId }, { $set: { logo: logoUrl } });
    await SchoolSite.updateOne(
      { schoolId },
      {
        $set: {
          'theme.logoUrl': svgUrl || logoUrl,
          'theme.primaryColor': p.primary,
          'theme.secondaryColor': p.secondary,
        },
      }
    );
    return { logo: logoUrl, svg: svgUrl || null, design: design.id };
  }

  /** Upload the school's own logo (PNG/JPG/WEBP as a data URL). */
  static async upload(schoolId: string, dataUrl: string) {
    if (!dataUrl) throw new BadRequestError('dataUrl is required');
    parseDataUrl(dataUrl);
    const url = await saveImage({ dataUrl, folder: 'logos' });
    await School.updateOne({ _id: schoolId }, { $set: { logo: url } });
    await SchoolSite.updateOne({ schoolId }, { $set: { 'theme.logoUrl': url } });
    return { logo: url };
  }

  static async current(schoolId: string) {
    const school: any = await School.findById(schoolId).select('name logo motto').lean();
    if (!school) throw new NotFoundError('School not found');
    const site: any = await SchoolSite.findOne({ schoolId }).select('theme').lean();
    return {
      name: school.name,
      motto: school.motto || '',
      logo: school.logo || null,
      primaryColor: site?.theme?.primaryColor || '#0f766e',
      secondaryColor: site?.theme?.secondaryColor || '#f59e0b',
    };
  }
}

/**
 * Read a school's logo as a PNG/JPEG buffer for PDF embedding.
 * Returns null for SVG or unreachable logos (PDF then renders without one).
 */
export async function logoPngBuffer(logo?: string | null): Promise<Buffer | null> {
  try {
    if (!logo) return null;
    const v = String(logo);
    let buf: Buffer | null = null;
    if (v.startsWith('data:')) {
      const { mime, buffer } = parseDataUrl(v);
      if (mime === 'image/png' || mime === 'image/jpeg') buf = buffer;
    } else if (v.startsWith('/uploads/')) {
      const file = path.join(process.cwd(), v.replace(/^\//, ''));
      if (/\.(png|jpe?g)$/i.test(file) && fs.existsSync(file)) buf = fs.readFileSync(file);
    } else if (/^https?:\/\//i.test(v) && /\.(png|jpe?g)(\?|$)/i.test(v)) {
      const res = await axios.get<ArrayBuffer>(v, { responseType: 'arraybuffer', timeout: 5000 });
      buf = Buffer.from(res.data);
    }
    return buf;
  } catch (_) {
    return null;
  }
}
