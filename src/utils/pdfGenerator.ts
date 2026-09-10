import PDFDocument from 'pdfkit';

// ============================================================================
// Real PDF generation, replacing the pdf.worker.ts stub that returned a fake
// URL. Two entry points: report cards (coordinate-based, driven by
// ReportCardTemplate.config.fields) and payment receipts (fixed layout).
// Both return a Buffer, which callers upload to Cloudinary themselves.
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
  school: { name: string; address?: string; phone?: string; logo?: string };
  data: {
    student: { name: string; admissionNumber: string; class: string; photo?: string };
    results: Array<{ subject: string; ca: number; exam: number; total: number; grade: string; remark: string }>;
    attendance: { present: number; absent: number; total: number; percentage: number };
    classAverage: number;
    position?: number;
    teacherComment?: string;
    principalComment?: string;
  };
}

export const renderReportCardPDF = async (input: ReportCardRenderInput): Promise<Buffer> => {
  const { template, school, data } = input;
  const size: [number, number] = template.layout === 'A4_LANDSCAPE' ? [841.89, 595.28] : [595.28, 841.89];

  const doc = new PDFDocument({ size, margin: 40 });

  // Header
  if (template.config.showSchoolInfo) {
    doc.fontSize(18).font('Helvetica-Bold').text(school.name, { align: 'center' });
    if (school.address) doc.fontSize(9).font('Helvetica').text(school.address, { align: 'center' });
    if (school.phone) doc.fontSize(9).text(school.phone, { align: 'center' });
    doc.moveDown(0.5);
  }

  doc.fontSize(14).font('Helvetica-Bold').text('STUDENT REPORT CARD', { align: 'center' });
  doc.moveDown(1);

  // Student info block
  doc.fontSize(11).font('Helvetica');
  doc.text(`Name: ${data.student.name}`);
  doc.text(`Admission No: ${data.student.admissionNumber}`);
  doc.text(`Class: ${data.student.class}`);
  if (typeof data.position === 'number' && data.position > 0) {
    doc.text(`Position in Class: ${data.position}`);
  }
  doc.moveDown(1);

  // Results table
  const tableTop = doc.y;
  const colWidths = { subject: 180, ca: 60, exam: 60, total: 60, grade: 50, remark: 110 };
  let x = doc.page.margins.left;
  const rowHeight = 20;

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Subject', x, tableTop, { width: colWidths.subject });
  x += colWidths.subject;
  doc.text('CA', x, tableTop, { width: colWidths.ca });
  x += colWidths.ca;
  doc.text('Exam', x, tableTop, { width: colWidths.exam });
  x += colWidths.exam;
  doc.text('Total', x, tableTop, { width: colWidths.total });
  x += colWidths.total;
  if (template.config.showGrade) {
    doc.text('Grade', x, tableTop, { width: colWidths.grade });
    x += colWidths.grade;
  }
  if (template.config.showRemark) {
    doc.text('Remark', x, tableTop, { width: colWidths.remark });
  }

  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();

  doc.font('Helvetica').fontSize(10);
  for (const row of data.results) {
    const y = doc.y + 4;
    x = doc.page.margins.left;
    doc.text(row.subject, x, y, { width: colWidths.subject });
    x += colWidths.subject;
    doc.text(String(row.ca ?? '-'), x, y, { width: colWidths.ca });
    x += colWidths.ca;
    doc.text(String(row.exam ?? '-'), x, y, { width: colWidths.exam });
    x += colWidths.exam;
    doc.text(String(row.total ?? '-'), x, y, { width: colWidths.total });
    x += colWidths.total;
    if (template.config.showGrade) {
      doc.text(row.grade || '-', x, y, { width: colWidths.grade });
      x += colWidths.grade;
    }
    if (template.config.showRemark) {
      doc.text(row.remark || '-', x, y, { width: colWidths.remark });
    }
    doc.y = y + rowHeight - 4;
  }

  doc.moveDown(1);

  if (template.config.showClassAverage) {
    doc.font('Helvetica-Bold').fontSize(10).text(`Class Average: ${data.classAverage.toFixed(1)}`);
  }

  if (template.config.showAttendance) {
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10).text(
      `Attendance: ${data.attendance.present}/${data.attendance.total} days (${data.attendance.percentage.toFixed(1)}%)`
    );
  }

  if (template.config.showTeacherComment && data.teacherComment) {
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10).text('Teacher\u2019s Comment:');
    doc.font('Helvetica').text(data.teacherComment);
  }

  if (template.config.showPrincipalComment && data.principalComment) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).text('Principal\u2019s Comment:');
    doc.font('Helvetica').text(data.principalComment);
  }

  // Custom positioned fields from the template config, if any were defined
  // beyond the standard layout above (e.g. custom grading-system labels).
  for (const field of template.config.fields || []) {
    const value = (data as any)[field.key];
    if (value === undefined || value === null) continue;
    doc.fontSize(field.style?.fontSize || 10);
    doc.font(field.style?.fontWeight === 'bold' ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(`${field.label}: ${value}`, field.position.x, field.position.y);
  }

  if (template.config.showSignature) {
    doc.moveDown(2);
    doc.text('_______________________', doc.page.margins.left);
    doc.fontSize(9).text('Signature', doc.page.margins.left);
  }

  return bufferFromDoc(doc);
};

// ---- Payment receipt ---------------------------------------------------------

interface ReceiptRenderInput {
  school: { name: string; address?: string; phone?: string };
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
  student: { name: string; admissionNumber: string };
}

export const renderReceiptPDF = async (input: ReceiptRenderInput): Promise<Buffer> => {
  const { school, payment, invoice, student } = input;
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  doc.fontSize(18).font('Helvetica-Bold').text(school.name, { align: 'center' });
  if (school.address) doc.fontSize(9).font('Helvetica').text(school.address, { align: 'center' });
  if (school.phone) doc.fontSize(9).text(school.phone, { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(14).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
  doc.moveDown(1.5);

  const naira = (kobo: number) => `\u20A6${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

  doc.fontSize(11).font('Helvetica');
  doc.text(`Receipt Reference: ${payment.reference}`);
  doc.text(`Date: ${(payment.confirmedAt || new Date()).toLocaleDateString('en-NG')}`);
  doc.moveDown(0.5);
  doc.text(`Student: ${student.name}`);
  doc.text(`Admission No: ${student.admissionNumber}`);
  doc.moveDown(0.5);
  doc.text(`Invoice: ${invoice.invoiceNumber}`);
  doc.text(`Payment Method: ${payment.method}`);
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(12).text(`Amount Paid: ${naira(payment.amount)}`);
  doc.font('Helvetica').fontSize(10);
  doc.text(`Invoice Total: ${naira(invoice.total)}`);
  doc.text(`Total Paid to Date: ${naira(invoice.amountPaid)}`);
  doc.text(`Outstanding Balance: ${naira(invoice.balance)}`);

  doc.moveDown(3);
  doc.fontSize(9).font('Helvetica').text('This is a computer-generated receipt.', { align: 'center' });

  return bufferFromDoc(doc);
};
