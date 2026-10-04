import PDFDocument from 'pdfkit';

// ============================================================================
// Built-in, professional PDF layouts used when a school has NOT uploaded its own
// template. Two entry points: report cards and payment receipts. Both return a
// Buffer, which callers upload to Cloudinary themselves.
// ============================================================================

const bufferFromDoc = (doc: PDFKit.PDFDocument): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
};

const BRAND = '#0f5132';      // deep green
const BRAND_LIGHT = '#e8f3ee';
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#d1d5db';

// ---- Report card ------------------------------------------------------------

interface ReportCardRenderInput {
  template: {
    layout: 'A4_PORTRAIT' | 'A4_LANDSCAPE';
    config: {
      showLogo: boolean;
      showSchoolInfo: boolean;
      showStudentPhoto: boolean;
      showAttendance: boolean;
      showClassAverage: boolean;
      showGrade: boolean;
      showRemark: boolean;
      showTeacherComment: boolean;
      showPrincipalComment: boolean;
      showSignature: boolean;
      showStamp: boolean;
      fields: Array<{
        key: string;
        label: string;
        type: string;
        position: { x: number; y: number };
        style?: { fontSize?: number; fontWeight?: string; color?: string };
      }>;
    };
  };
  school: { name: string; address?: string; phone?: string; logo?: string; logoPng?: Buffer };
  data: {
    student: { name: string; admissionNumber: string; class: string; photo?: string };
    results: Array<{ subject: string; ca: number; exam: number; total: number; grade: string; remark: string }>;
    attendance: { present: number; absent: number; total: number; percentage: number };
    classAverage: number;
    position?: number;
    classSize?: number;
    session?: string;
    term?: string;
    nextTermBegins?: string;
    teacherComment?: string;
    principalComment?: string;
  };
}

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const renderReportCardPDF = async (input: ReportCardRenderInput): Promise<Buffer> => {
  const { template, school, data } = input;
  const landscape = template.layout === 'A4_LANDSCAPE';
  const size: [number, number] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const doc = new PDFDocument({ size, margin: 36 });

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;
  const cfg = template.config;

  // ---------- Header ----------
  let y = 36;
  if (school.logoPng) {
    try {
      doc.image(school.logoPng, L, y, { fit: [58, 58] });
    } catch (_) {}
  }
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(20).text(school.name, L, y + 2, { width: W, align: 'center' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  const sub = [school.address, school.phone].filter(Boolean).join('  |  ');
  if (sub) doc.text(sub, L, doc.y + 2, { width: W, align: 'center' });
  y = Math.max(doc.y, y + 62) + 8;

  doc.moveTo(L, y).lineTo(R, y).lineWidth(2).strokeColor(BRAND).stroke();
  y += 8;

  // Title band
  doc.rect(L, y, W, 24).fill(BRAND);
  const titleBits = ['STUDENT REPORT CARD', data.term, data.session].filter(Boolean).join('   •   ');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(titleBits, L, y + 7, { width: W, align: 'center' });
  y += 34;

  // ---------- Student info box ----------
  const infoH = 58;
  doc.roundedRect(L, y, W, infoH, 4).lineWidth(0.8).strokeColor(LINE).stroke();
  const half = W / 2;
  const cell = (label: string, value: string, x: number, yy: number) => {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, yy, { width: half - 20 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(value || '—', x, yy + 10, { width: half - 20, ellipsis: true, lineBreak: false });
  };
  cell('Student name', data.student.name, L + 12, y + 8);
  cell('Admission no', data.student.admissionNumber, L + half + 6, y + 8);
  cell('Class', data.student.class, L + 12, y + 34);
  const pos =
    typeof data.position === 'number' && data.position > 0
      ? `${ordinal(data.position)}${data.classSize ? ` of ${data.classSize}` : ''}`
      : '—';
  cell('Position in class', pos, L + half + 6, y + 34);
  y += infoH + 14;

  // ---------- Results table ----------
  const cols: Array<{ key: string; label: string; w: number; align: 'left' | 'center' }> = [
    { key: 'subject', label: 'SUBJECT', w: 0, align: 'left' },
    { key: 'ca', label: 'CA', w: 46, align: 'center' },
    { key: 'exam', label: 'EXAM', w: 46, align: 'center' },
    { key: 'total', label: 'TOTAL', w: 50, align: 'center' },
  ];
  if (cfg.showGrade) cols.push({ key: 'grade', label: 'GRADE', w: 46, align: 'center' });
  if (cfg.showRemark) cols.push({ key: 'remark', label: 'REMARK', w: 110, align: 'left' });
  const fixed = cols.reduce((a, c) => a + c.w, 0);
  cols[0].w = W - fixed;

  const rowH = 20;
  const drawHeader = (yy: number) => {
    doc.rect(L, yy, W, rowH).fill(BRAND_LIGHT);
    let x = L;
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(8.5);
    for (const c of cols) {
      doc.text(c.label, x + 6, yy + 6, { width: c.w - 12, align: c.align, lineBreak: false });
      x += c.w;
    }
    return yy + rowH;
  };
  y = drawHeader(y);

  const rows = data.results || [];
  rows.forEach((row, i) => {
    if (y + rowH > bottomLimit() - 150) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawHeader(y);
    }
    if (i % 2 === 1) doc.rect(L, y, W, rowH).fill('#f9fafb');
    let x = L;
    doc.fillColor(INK).font('Helvetica').fontSize(9.5);
    for (const c of cols) {
      const raw = (row as any)[c.key];
      const val = c.key === 'subject' || c.key === 'remark' ? String(raw ?? '-') : String(raw ?? '-');
      const bold = c.key === 'total' || c.key === 'grade';
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(val, x + 6, y + 6, {
        width: c.w - 12,
        align: c.align,
        ellipsis: true,
        lineBreak: false,
      });
      x += c.w;
    }
    doc.moveTo(L, y + rowH).lineTo(R, y + rowH).lineWidth(0.4).strokeColor(LINE).stroke();
    y += rowH;
  });
  if (!rows.length) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text('No results have been recorded for this term.', L + 6, y + 6);
    y += rowH;
  }
  y += 14;

  // ---------- Summary strip ----------
  if (y > bottomLimit() - 130) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  const stats: Array<[string, string]> = [];
  if (cfg.showClassAverage) stats.push(['Average', `${Number(data.classAverage || 0).toFixed(1)}%`]);
  stats.push(['Position', pos]);
  if (cfg.showAttendance) {
    const a = data.attendance || { present: 0, total: 0, percentage: 0, absent: 0 };
    stats.push(['Attendance', `${a.present}/${a.total} days (${Number(a.percentage || 0).toFixed(0)}%)`]);
  }
  const boxW = (W - (stats.length - 1) * 8) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = L + i * (boxW + 8);
    doc.roundedRect(x, y, boxW, 40, 4).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x + 10, y + 7, { width: boxW - 20 });
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(12).text(value, x + 10, y + 20, { width: boxW - 20, ellipsis: true, lineBreak: false });
  });
  y += 52;

  // ---------- Comments ----------
  const comment = (title: string, text?: string) => {
    const h = 46;
    if (y + h > bottomLimit()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.roundedRect(L, y, W, h, 4).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8).text(title.toUpperCase(), L + 10, y + 6);
    doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(text || '', L + 10, y + 18, { width: W - 20, height: h - 22, ellipsis: true });
    y += h + 8;
  };
  if (cfg.showTeacherComment) comment("Class teacher's comment", data.teacherComment);
  if (cfg.showPrincipalComment) comment("Head teacher's / Principal's comment", data.principalComment);

  if (data.nextTermBegins) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(`Next term begins: ${data.nextTermBegins}`, L, y + 2);
    y += 20;
  }

  // Custom positioned fields from an older template config, if any.
  for (const field of cfg.fields || []) {
    const value = (data as any)[field.key];
    if (value === undefined || value === null) continue;
    doc.fillColor(INK).fontSize(field.style?.fontSize || 10);
    doc.font(field.style?.fontWeight === 'bold' ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(`${field.label}: ${value}`, field.position.x, field.position.y);
  }

  // ---------- Signatures ----------
  if (cfg.showSignature) {
    if (y + 50 > bottomLimit()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y += 24;
    const sigW = (W - 40) / 2;
    [L, L + sigW + 40].forEach((x, i) => {
      doc.moveTo(x, y).lineTo(x + sigW, y).lineWidth(0.8).strokeColor(INK).stroke();
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(i === 0 ? 'Class teacher signature' : 'Head teacher / Principal signature', x, y + 4, { width: sigW, align: 'center' });
    });
  }

  // Footer
  const footerY = doc.page.height - doc.page.margins.bottom - 16;
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text('Generated by SchoolFlow  •  This is a computer-generated report card.', L, footerY, { width: W, align: 'center', lineBreak: false });

  return bufferFromDoc(doc);
};

// ---- Payment receipt ---------------------------------------------------------

interface ReceiptRenderInput {
  school: { name: string; address?: string; phone?: string; logoPng?: Buffer };
  status?: string; // 'FULLY PAID' | 'PARTIALLY PAID'
  receiptNo?: string;
  cashierName?: string;
  amountInWords?: string;
  payment: {
    reference: string;
    amount: number; // kobo
    method: string;
    confirmedAt?: Date;
  };
  invoice: {
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    balance: number;
  };
  student: { name: string; admissionNumber: string; className?: string };
}

export const renderReceiptPDF = async (input: ReceiptRenderInput): Promise<Buffer> => {
  const { school, payment, invoice, student } = input;
  const doc = new PDFDocument({ size: 'A4', margin: 44 });

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;
  const naira = (kobo: number) => `\u20A6${((kobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  // Header
  let y = 44;
  if (school.logoPng) {
    try {
      doc.image(school.logoPng, L, y, { fit: [56, 56] });
    } catch (_) {}
  }
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(19).text(school.name, L, y + 2, { width: W, align: 'center' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  const sub = [school.address, school.phone].filter(Boolean).join('  |  ');
  if (sub) doc.text(sub, L, doc.y + 2, { width: W, align: 'center' });
  y = Math.max(doc.y, y + 60) + 8;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(2).strokeColor(BRAND).stroke();
  y += 12;

  // Title + status badge
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text('PAYMENT RECEIPT', L, y);
  if (input.status) {
    const paid = /FULL/i.test(input.status);
    const bw = 110;
    doc.roundedRect(R - bw, y - 2, bw, 22, 11).fill(paid ? '#dcfce7' : '#fef3c7');
    doc.fillColor(paid ? '#166534' : '#92400e').font('Helvetica-Bold').fontSize(9).text(input.status, R - bw, y + 5, { width: bw, align: 'center', lineBreak: false });
  }
  y += 30;

  // Meta rows (two columns)
  const meta = (label: string, value: string, x: number, yy: number, w: number) => {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, yy, { width: w });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(value || '—', x, yy + 11, { width: w, ellipsis: true, lineBreak: false });
  };
  const colW = W / 2 - 10;
  const receiptNo = input.receiptNo || payment.reference;
  meta('Receipt no', receiptNo, L, y, colW);
  meta('Date', (payment.confirmedAt || new Date()).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }), L + colW + 20, y, colW);
  y += 36;
  meta('Received from / Student', student.name, L, y, colW);
  meta('Admission no', student.admissionNumber, L + colW + 20, y, colW);
  y += 36;
  meta('Class', student.className || '—', L, y, colW);
  meta('Invoice', invoice.invoiceNumber, L + colW + 20, y, colW);
  y += 36;
  meta('Payment method', payment.method, L, y, colW);
  meta('Reference', payment.reference, L + colW + 20, y, colW);
  y += 44;

  // Amount box
  doc.roundedRect(L, y, W, 62, 6).fill(BRAND_LIGHT);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('AMOUNT PAID', L + 16, y + 10);
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(24).text(naira(payment.amount), L + 16, y + 24, { width: W - 32, lineBreak: false });
  y += 74;
  if (input.amountInWords) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text(input.amountInWords, L, y, { width: W });
    y = doc.y + 10;
  }

  // Account summary table
  const rows: Array<[string, string, boolean]> = [
    ['Invoice total', naira(invoice.total), false],
    ['Total paid to date', naira(invoice.amountPaid), false],
    ['Outstanding balance', naira(invoice.balance), true],
  ];
  rows.forEach(([label, value, strong], i) => {
    const rh = 24;
    if (i % 2 === 0) doc.rect(L, y, W, rh).fill('#f9fafb');
    doc.fillColor(INK).font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(10.5).text(label, L + 12, y + 7, { lineBreak: false });
    doc.fillColor(strong && invoice.balance > 0 ? '#b91c1c' : INK).font('Helvetica-Bold').fontSize(10.5).text(value, L, y + 7, { width: W - 12, align: 'right', lineBreak: false });
    y += rh;
  });
  y += 36;

  // Signature
  doc.moveTo(R - 190, y).lineTo(R, y).lineWidth(0.8).strokeColor(INK).stroke();
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(input.cashierName ? `Received by: ${input.cashierName}` : 'Authorised signature', R - 190, y + 4, { width: 190, align: 'center' });

  // Footer
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('This is a computer-generated receipt and is valid without a signature.  Powered by SchoolFlow', L, doc.page.height - 60, { width: W, align: 'center', lineBreak: false });

  return bufferFromDoc(doc);
};
