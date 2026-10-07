// src/core/reportCards/reportCardPresets.service.ts
//
// Ready-made report card designs. Each design is drawn on the server as an A4 background
// (school logo, name, address, motto, brand colours) together with the pins and subject
// table that the existing PDF renderer fills in. A school picks one, and is done - no image
// editing, no pin placement.
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { School } from '../../models/School';
import { SchoolSite } from '../../models/SchoolSite';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import { logoPngBuffer } from '../branding/logo.service';
import { clampHex, inkOf, mix, onColor } from '../site/site.renderer';
import logger from '../../config/logger';

const W = 595.28;
const H = 841.89;
const FONT = "'DejaVu Sans', 'Liberation Sans', Arial, Helvetica, sans-serif";
const SERIF = "'DejaVu Serif', Georgia, 'Times New Roman', serif";

const xe = (v: any) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
const px = (x: number) => Math.round((x / W) * 10000) / 100;
const py = (y: number) => Math.round((y / H) * 10000) / 100;

interface Brand {
  name: string;
  motto: string;
  address: string;
  phone: string;
  primary: string;
  secondary: string;
  logo: string | null; // data URL (png/jpeg) or null
}

interface Style {
  headFill: string;
  headText: string;
  zebra: string;
  line: string;
  radius: number;
  font: string;
  frame: 'none' | 'single' | 'double';
}

// ---------------------------------------------------------------------------
// Fixed geometry shared by every design (so pins and table always line up)
// ---------------------------------------------------------------------------
const TABLE = { top: 270, head: 20, rowH: 22, rows: 14, left: 40, right: 555 };
const COLS = [
  { key: 'subject', x: 40, label: 'SUBJECT' },
  { key: 'ca', x: 252, label: 'CA' },
  { key: 'exam', x: 312, label: 'EXAM' },
  { key: 'total', x: 372, label: 'TOTAL' },
  { key: 'grade', x: 432, label: 'GRADE' },
  { key: 'remark', x: 484, label: 'REMARK' },
] as const;
const SUMMARY = { top: 610, h: 42 };

function pins() {
  const P = (field: string, x: number, y: number, extra: any = {}) => ({ field, x: px(x), y: py(y), size: 10, ...extra });
  const cell = (i: number) => 40 + (515 / 4) * (i + 0.5);
  return [
    P('student_name', 112, 190, { bold: true, maxWidth: px(178) }),
    P('admission_number', 368, 190, { maxWidth: px(108) }),
    P('class_name', 112, 212, { maxWidth: px(178) }),
    P('session', 368, 212, { maxWidth: px(108) }),
    P('term', 112, 234, { maxWidth: px(178) }),
    P('next_term_begins', 368, 234, { maxWidth: px(108) }),
    P('student_photo', 486, 166, { size: 69 }), // x/y = top-left, size = width in points
    P('average', cell(0), 641, { size: 13, bold: true, align: 'center' }),
    P('position', cell(1), 641, { size: 13, bold: true, align: 'center' }),
    P('grade', cell(2), 641, { size: 13, bold: true, align: 'center' }),
    P('class_size', cell(3), 641, { size: 13, bold: true, align: 'center' }),
    P('attendance_present', 110, 684, { size: 10 }),
    P('attendance_absent', 285, 684, { size: 10 }),
    P('attendance_total', 492, 684, { size: 10 }),
    P('teacher_remark', 40, 728, { size: 9, maxWidth: px(515) }),
    P('principal_remark', 40, 766, { size: 9, maxWidth: px(515) }),
  ];
}

function tables() {
  return [
    {
      x: px(TABLE.left + 6),
      y: py(TABLE.top + TABLE.head + 15),
      columnOffsets: COLS.map((c) => px(c.x - TABLE.left)),
      columns: COLS.map((c) => c.key),
      rowHeight: Math.round((TABLE.rowH / H) * 10000) / 100,
      fontSize: 9,
      maxRows: TABLE.rows,
    },
  ];
}

// ---------------------------------------------------------------------------
// Shared body (info block, table grid, summary, attendance, remarks, signatures)
// ---------------------------------------------------------------------------
function body(b: Brand, s: Style): string {
  const t = (x: number, y: number, txt: string, o: { size?: number; w?: string; fill?: string; anchor?: string } = {}) =>
    `<text x="${x}" y="${y}" font-size="${o.size ?? 8.5}" font-weight="${o.w ?? '600'}" fill="${o.fill ?? '#475569'}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${xe(txt)}</text>`;
  const ink = inkOf(b.primary);
  const out: string[] = [];

  // info block: labels + underlines
  const rows: Array<[number, string, string]> = [
    [190, 'Student name', 'Admission no.'],
    [212, 'Class', 'Session'],
    [234, 'Term', 'Next term begins'],
  ];
  for (const [y, l, r] of rows) {
    out.push(t(40, y, l + ':'), t(296, y, r + ':'));
    out.push(`<line x1="110" y1="${y + 3}" x2="290" y2="${y + 3}" stroke="${s.line}" stroke-width=".7"/>`);
    out.push(`<line x1="366" y1="${y + 3}" x2="478" y2="${y + 3}" stroke="${s.line}" stroke-width=".7"/>`);
  }
  out.push(`<rect x="486" y="166" width="69" height="86" rx="${Math.min(s.radius, 10)}" fill="#f8fafc" stroke="${s.line}" stroke-width=".8"/>`);
  out.push(t(520.5, 212, 'PHOTO', { size: 7, fill: '#cbd5e1', anchor: 'middle' }));

  // subject table grid
  const tx = TABLE.left, tw = TABLE.right - TABLE.left;
  out.push(`<rect x="${tx}" y="${TABLE.top}" width="${tw}" height="${TABLE.head}" rx="${Math.min(s.radius, 8)}" fill="${s.headFill}"/>`);
  for (const c of COLS) out.push(t(c.x + 6, TABLE.top + 13.5, c.label, { size: 8, w: '700', fill: s.headText }));
  const bodyTop = TABLE.top + TABLE.head;
  for (let i = 0; i < TABLE.rows; i++) {
    const y = bodyTop + i * TABLE.rowH;
    if (i % 2 === 1) out.push(`<rect x="${tx}" y="${y}" width="${tw}" height="${TABLE.rowH}" fill="${s.zebra}"/>`);
    out.push(`<line x1="${tx}" y1="${y + TABLE.rowH}" x2="${TABLE.right}" y2="${y + TABLE.rowH}" stroke="${s.line}" stroke-width=".5"/>`);
  }
  for (const c of COLS.slice(1)) {
    out.push(`<line x1="${c.x}" y1="${TABLE.top + TABLE.head}" x2="${c.x}" y2="${bodyTop + TABLE.rows * TABLE.rowH}" stroke="${s.line}" stroke-width=".5"/>`);
  }
  out.push(`<rect x="${tx}" y="${TABLE.top}" width="${tw}" height="${TABLE.head + TABLE.rows * TABLE.rowH}" rx="${Math.min(s.radius, 8)}" fill="none" stroke="${s.line}" stroke-width=".8"/>`);

  // summary strip
  const cw = (TABLE.right - TABLE.left) / 4;
  out.push(`<rect x="${tx}" y="${SUMMARY.top}" width="${tw}" height="${SUMMARY.h}" rx="${Math.min(s.radius, 10)}" fill="${mix(b.primary, '#ffffff', 0.92)}" stroke="${s.line}" stroke-width=".7"/>`);
  ['AVERAGE', 'POSITION', 'GRADE', 'CLASS SIZE'].forEach((l, i) => {
    out.push(t(tx + cw * (i + 0.5), SUMMARY.top + 14, l, { size: 7.5, w: '700', fill: ink, anchor: 'middle' }));
    if (i) out.push(`<line x1="${tx + cw * i}" y1="${SUMMARY.top + 6}" x2="${tx + cw * i}" y2="${SUMMARY.top + SUMMARY.h - 6}" stroke="${s.line}" stroke-width=".6"/>`);
  });

  // attendance
  out.push(t(40, 684, 'Days present:'), t(215, 684, 'Days absent:'), t(390, 684, 'Total school days:'));
  [[108, 150], [283, 325], [488, 545]].forEach(([a, z]) => out.push(`<line x1="${a}" y1="687" x2="${z}" y2="687" stroke="${s.line}" stroke-width=".6"/>`));

  // remarks
  out.push(t(40, 712, "Class teacher's remark", { w: '700', fill: ink }));
  out.push(`<line x1="40" y1="732" x2="555" y2="732" stroke="${s.line}" stroke-width=".6"/>`);
  out.push(t(40, 750, "Principal's remark", { w: '700', fill: ink }));
  out.push(`<line x1="40" y1="770" x2="555" y2="770" stroke="${s.line}" stroke-width=".6"/>`);

  // signatures
  [['Class teacher', 40, 190], ['Principal', 230, 380], ['Parent / guardian', 420, 555]].forEach(([l, a, z]: any) => {
    out.push(`<line x1="${a}" y1="806" x2="${z}" y2="806" stroke="#94a3b8" stroke-width=".6"/>`);
    out.push(t((a + z) / 2, 818, l, { size: 7.5, anchor: 'middle' }));
  });
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Header pieces
// ---------------------------------------------------------------------------
const nameSize = (n: string, max: number, min: number) => Math.max(min, Math.min(max, max - (n.length - 16) * 0.7));

function logoNode(b: Brand, x: number, y: number, size: number, onDark = false): string {
  if (b.logo) {
    return `<image href="${b.logo}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const ini = b.name.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'S';
  const fill = onDark ? '#ffffff' : b.primary;
  const tx = onDark ? inkOf(b.primary) : onColor(b.primary);
  return `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}" fill="${fill}"/><text x="${x + size / 2}" y="${y + size / 2 + size * 0.17}" font-size="${size * 0.46}" font-weight="800" fill="${tx}" text-anchor="middle">${xe(ini)}</text>`;
}

const contactLine = (b: Brand) => [b.address, b.phone].filter(Boolean).join('  •  ');

function headerBlock(variant: string, b: Brand): string {
  const onP = onColor(b.primary);
  const ink = inkOf(b.primary);
  const name = b.name.toUpperCase();
  const centered = (y: number, fill: string, sub: string, ns = 24) =>
    `<text x="${W / 2}" y="${y}" font-size="${nameSize(name, ns, 13)}" font-weight="800" fill="${fill}" text-anchor="middle" font-family="${variant === 'classic-frame' ? SERIF : FONT}">${xe(name)}</text>` +
    (b.motto ? `<text x="${W / 2}" y="${y + 15}" font-size="9" font-style="italic" fill="${sub}" text-anchor="middle">${xe(b.motto)}</text>` : '') +
    (contactLine(b) ? `<text x="${W / 2}" y="${y + (b.motto ? 29 : 16)}" font-size="8" fill="${sub}" text-anchor="middle">${xe(contactLine(b))}</text>` : '');
  const title = (y: number, fill: string, bg?: string) =>
    (bg ? `<rect x="${W / 2 - 110}" y="${y - 15}" width="220" height="24" rx="12" fill="${bg}"/>` : '') +
    `<text x="${W / 2}" y="${y + 2}" font-size="12" font-weight="800" letter-spacing="3" fill="${fill}" text-anchor="middle">TERMINAL REPORT CARD</text>`;

  switch (variant) {
    case 'modern-band':
      return `<rect x="0" y="0" width="${W}" height="128" fill="${b.primary}"/>
<rect x="0" y="128" width="${W}" height="5" fill="${b.secondary}"/>
${logoNode(b, 36, 22, 82, true)}
<text x="134" y="58" font-size="${nameSize(name, 24, 14)}" font-weight="800" fill="${onP}">${xe(name)}</text>
${b.motto ? `<text x="134" y="76" font-size="9.5" font-style="italic" fill="${onP}" opacity=".9">${xe(b.motto)}</text>` : ''}
<text x="134" y="94" font-size="8.5" fill="${onP}" opacity=".85">${xe(contactLine(b))}</text>
<text x="134" y="114" font-size="11" font-weight="800" letter-spacing="2.5" fill="${onP}">TERMINAL REPORT CARD</text>`;
    case 'classic-frame':
      return `${logoNode(b, W / 2 - 32, 28, 64)}${centered(112, '#111827', '#475569', 22)}
<line x1="140" y1="150" x2="455" y2="150" stroke="${b.secondary}" stroke-width="1.5"/>${title(172, ink)}`;
    case 'sidebar':
      return `<rect x="0" y="0" width="26" height="${H}" fill="${b.primary}"/><rect x="26" y="0" width="5" height="${H}" fill="${b.secondary}"/>
${logoNode(b, 50, 26, 76)}
<text x="140" y="56" font-size="${nameSize(name, 23, 13)}" font-weight="800" fill="#111827">${xe(name)}</text>
${b.motto ? `<text x="140" y="73" font-size="9.5" font-style="italic" fill="#475569">${xe(b.motto)}</text>` : ''}
<text x="140" y="90" font-size="8.5" fill="#64748b">${xe(contactLine(b))}</text>
<rect x="140" y="104" width="208" height="24" rx="4" fill="${b.primary}"/><text x="244" y="120" font-size="10.5" font-weight="800" letter-spacing="2" fill="${onP}" text-anchor="middle">REPORT CARD</text>`;
    case 'minimal':
      return `${logoNode(b, 40, 30, 56)}
<text x="108" y="56" font-size="${nameSize(name, 20, 12)}" font-weight="700" fill="#111827" letter-spacing="1">${xe(name)}</text>
<text x="108" y="74" font-size="8.5" fill="#64748b">${xe([b.motto, contactLine(b)].filter(Boolean).join('  •  '))}</text>
<text x="555" y="56" font-size="11" font-weight="700" letter-spacing="2" fill="${ink}" text-anchor="end">REPORT CARD</text>
<line x1="40" y1="112" x2="555" y2="112" stroke="${b.primary}" stroke-width="2.5"/><line x1="40" y1="116" x2="555" y2="116" stroke="${b.secondary}" stroke-width="1"/>`;
    case 'ribbon':
      return `${logoNode(b, W / 2 - 36, 20, 72)}${centered(112, ink, '#475569', 22)}
<polygon points="${W / 2 - 165},152 ${W / 2 + 165},152 ${W / 2 + 177},166 ${W / 2 + 165},180 ${W / 2 - 165},180 ${W / 2 - 177},166" fill="${b.primary}"/>
<text x="${W / 2}" y="171" font-size="11.5" font-weight="800" letter-spacing="3" fill="${onP}" text-anchor="middle">TERMINAL REPORT CARD</text>`;
    case 'crest-curve':
      return `<path d="M0,0 H${W} V104 Q${W / 2},158 0,104 Z" fill="${b.primary}"/>
<path d="M0,104 Q${W / 2},158 ${W},104 V114 Q${W / 2},170 0,114 Z" fill="${b.secondary}"/>
${logoNode(b, W / 2 - 32, 14, 64, true)}
<text x="${W / 2}" y="100" font-size="${nameSize(name, 19, 12)}" font-weight="800" fill="${onP}" text-anchor="middle">${xe(name)}</text>
<text x="${W / 2}" y="174" font-size="10" font-weight="800" letter-spacing="3" fill="${ink}" text-anchor="middle">TERMINAL REPORT CARD</text>`;
    case 'two-tone':
      return `<rect x="0" y="0" width="${W}" height="70" fill="${b.primary}"/><rect x="0" y="70" width="${W}" height="62" fill="${mix(b.primary, '#ffffff', 0.9)}"/>
<rect x="0" y="70" width="${W}" height="3" fill="${b.secondary}"/>
${logoNode(b, 36, 18, 100, true)}
<text x="150" y="42" font-size="${nameSize(name, 22, 13)}" font-weight="800" fill="${onP}">${xe(name)}</text>
${b.motto ? `<text x="150" y="58" font-size="9" font-style="italic" fill="${onP}" opacity=".9">${xe(b.motto)}</text>` : ''}
<text x="150" y="94" font-size="8.5" fill="#475569">${xe(contactLine(b))}</text>
<text x="150" y="116" font-size="11.5" font-weight="800" letter-spacing="2.5" fill="${ink}">STUDENT REPORT CARD</text>`;
    case 'playful':
      return `<rect x="24" y="20" width="${W - 48}" height="116" rx="26" fill="${mix(b.primary, '#ffffff', 0.88)}" stroke="${b.primary}" stroke-width="2"/>
<circle cx="${W - 56}" cy="42" r="22" fill="${b.secondary}" opacity=".55"/><circle cx="${W - 92}" cy="118" r="10" fill="${b.primary}" opacity=".35"/><circle cx="60" cy="122" r="8" fill="${b.secondary}" opacity=".6"/>
${logoNode(b, 44, 34, 78)}
<text x="140" y="68" font-size="${nameSize(name, 21, 13)}" font-weight="800" fill="${ink}">${xe(name)}</text>
${b.motto ? `<text x="140" y="85" font-size="9.5" font-style="italic" fill="#475569">${xe(b.motto)}</text>` : ''}
<text x="140" y="102" font-size="8.5" fill="#64748b">${xe(contactLine(b))}</text>
<rect x="140" y="110" width="150" height="20" rx="10" fill="${b.primary}"/><text x="215" y="124" font-size="9.5" font-weight="800" letter-spacing="2" fill="${onP}" text-anchor="middle">REPORT CARD</text>`;
    default:
      return '';
  }
}

interface PresetDef {
  id: string;
  name: string;
  description: string;
  style: (b: Brand) => Style;
}

const PRESETS: PresetDef[] = [
  { id: 'modern-band', name: 'Modern Band', description: 'Bold colour band with logo on the left. Clean and popular.',
    style: (b) => ({ headFill: b.primary, headText: onColor(b.primary), zebra: '#f8fafc', line: '#cbd5e1', radius: 8, font: FONT, frame: 'none' }) },
  { id: 'classic-frame', name: 'Classic Frame', description: 'Traditional double border with a centred crest and serif title.',
    style: (b) => ({ headFill: '#111827', headText: '#ffffff', zebra: '#f9fafb', line: '#6b7280', radius: 0, font: SERIF, frame: 'double' }) },
  { id: 'sidebar', name: 'Side Stripe', description: 'Slim colour stripe down the page edge.',
    style: (b) => ({ headFill: b.primary, headText: onColor(b.primary), zebra: '#f8fafc', line: '#cbd5e1', radius: 3, font: FONT, frame: 'none' }) },
  { id: 'minimal', name: 'Minimal', description: 'Light, airy and ink-friendly. Great for black-and-white printing.',
    style: (b) => ({ headFill: mix(b.primary, '#ffffff', 0.85), headText: inkOf(b.primary), zebra: '#ffffff', line: '#d1d5db', radius: 2, font: FONT, frame: 'none' }) },
  { id: 'ribbon', name: 'Ribbon Banner', description: 'Centred crest with a ribbon title.',
    style: (b) => ({ headFill: b.primary, headText: onColor(b.primary), zebra: '#f8fafc', line: '#cbd5e1', radius: 4, font: FONT, frame: 'single' }) },
  { id: 'crest-curve', name: 'Curved Crest', description: 'Soft curved header with a centred logo.',
    style: (b) => ({ headFill: b.primary, headText: onColor(b.primary), zebra: '#f8fafc', line: '#cbd5e1', radius: 10, font: FONT, frame: 'none' }) },
  { id: 'two-tone', name: 'Two-Tone', description: 'Large logo space with a split-colour header.',
    style: (b) => ({ headFill: b.primary, headText: onColor(b.primary), zebra: mix(b.primary, '#ffffff', 0.95), line: '#cbd5e1', radius: 6, font: FONT, frame: 'none' }) },
  { id: 'playful', name: 'Bright & Friendly', description: 'Rounded corners and cheerful colours for nursery and primary.',
    style: (b) => ({ headFill: b.primary, headText: onColor(b.primary), zebra: mix(b.secondary, '#ffffff', 0.9), line: mix(b.primary, '#ffffff', 0.55), radius: 14, font: FONT, frame: 'single' }) },
];

function frameNode(s: Style, b: Brand): string {
  if (s.frame === 'none') return '';
  if (s.frame === 'single') return `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="${Math.min(s.radius, 14)}" fill="none" stroke="${b.primary}" stroke-width="1.6"/>`;
  return `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${b.primary}" stroke-width="2.4"/><rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="${b.secondary}" stroke-width="0.9"/>`;
}

export function buildPresetSvg(presetId: string, brand: Brand): string {
  const def = PRESETS.find((p) => p.id === presetId);
  if (!def) throw new BadRequestError(`Unknown design. Choose one of: ${PRESETS.map((p) => p.id).join(', ')}`);
  const s = def.style(brand);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${s.font}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
${frameNode(s, brand)}
${headerBlock(def.id, brand)}
${body(brand, s)}
</svg>`;
}

function sharpOrThrow(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('sharp');
  } catch (_) {
    throw new BadRequestError('Report card designs are temporarily unavailable on this server (image engine missing).');
  }
}

async function toPng(svg: string, width: number): Promise<string> {
  const sharp = sharpOrThrow();
  const buf: Buffer = await sharp(Buffer.from(svg)).resize({ width }).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function loadBrand(schoolId: string, input: any = {}): Promise<Brand> {
  const school: any = await School.findById(schoolId).select('name motto address city state phone logo').lean();
  if (!school) throw new NotFoundError('School not found');
  const site: any = await SchoolSite.findOne({ schoolId }).select('theme').lean();
  const buf = await logoPngBuffer(school.logo || site?.theme?.logoUrl);
  const mime = buf && buf[0] === 0xff ? 'image/jpeg' : 'image/png';
  return {
    name: String(school.name || 'Your School').slice(0, 70),
    motto: String(school.motto || '').slice(0, 60),
    address: [school.address, school.city, school.state].filter(Boolean).join(', ').slice(0, 80),
    phone: String(school.phone || '').slice(0, 30),
    primary: clampHex(input.primaryColor, clampHex(site?.theme?.primaryColor, '#0f766e')),
    secondary: clampHex(input.secondaryColor, clampHex(site?.theme?.secondaryColor, '#f59e0b')),
    logo: buf ? `data:${mime};base64,${buf.toString('base64')}` : null,
  };
}

export class ReportCardPresetService {
  /** Gallery: every design previewed with the school's own logo, name and colours. */
  static async gallery(schoolId: string, query: any = {}) {
    const brand = await loadBrand(schoolId, query);
    const items = [];
    for (const p of PRESETS) {
      items.push({ id: p.id, name: p.name, description: p.description, preview: await toPng(buildPresetSvg(p.id, brand), 420) });
    }
    return { brand: { name: brand.name, primaryColor: brand.primary, secondaryColor: brand.secondary, hasLogo: !!brand.logo }, items };
  }

  /** Create (or refresh) the school's template from a design. */
  static async apply(schoolId: string, presetId: string, input: any = {}) {
    const def = PRESETS.find((p) => p.id === presetId);
    if (!def) throw new BadRequestError(`Unknown design. Choose one of: ${PRESETS.map((p) => p.id).join(', ')}`);
    const brand = await loadBrand(schoolId, input);
    const imageData = await toPng(buildPresetSvg(def.id, brand), 1190);

    const existing = await ReportCardTemplate.countDocuments({ schoolId, type: 'report_card' });
    const makeDefault = input.makeDefault !== false;
    const doc = await ReportCardTemplate.create({
      schoolId,
      name: String(input.name || def.name).trim().slice(0, 80),
      type: 'report_card',
      imageData,
      pins: pins(),
      tables: tables(),
      isActive: true,
      isDefault: makeDefault || existing === 0,
      presetId: def.id,
    });
    if (doc.isDefault) {
      await ReportCardTemplate.updateMany({ schoolId, type: 'report_card', _id: { $ne: doc._id } }, { $set: { isDefault: false } });
    }
    logger.info(`Report card design ${def.id} applied for school ${schoolId}`);
    return { id: String(doc._id), name: doc.name, presetId: def.id, isDefault: doc.isDefault };
  }

  /** Redraw an existing design after the school changed its logo, name or colours. */
  static async refresh(schoolId: string, templateId: string) {
    const t: any = await ReportCardTemplate.findOne({ _id: templateId, schoolId });
    if (!t) throw new NotFoundError('Template not found');
    if (!t.presetId) throw new BadRequestError('Only ready-made designs can be refreshed.');
    const brand = await loadBrand(schoolId);
    t.imageData = await toPng(buildPresetSvg(t.presetId, brand), 1190);
    await t.save();
    return { id: String(t._id), name: t.name, presetId: t.presetId };
  }

  static async list() {
    return PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description }));
  }
}
