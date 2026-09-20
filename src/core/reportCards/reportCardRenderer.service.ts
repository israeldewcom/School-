// src/core/reportCards/reportCardRenderer.service.ts
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import mongoose from 'mongoose';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { NotFoundError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

interface RenderData {
  student: {
    fullName: string;
    admissionNumber: string;
    className: string;
    dateOfBirth?: string;
    gender?: string;
    age?: number;
  };
  session: string;
  term: string;
  school: {
    name: string;
    address?: string;
  };
  results: Array<{
    subjectName: string;
    ca: number;
    exam: number;
    total: number;
    grade: string;
    remark?: string;
  }>;
  average: number;
  grade: string;
  position?: number;
  classSize?: number;
  attendance?: {
    present: number;
    absent: number;
    total: number;
  };
  nextTermBegins?: string;
  teacherRemark?: string;
  principalRemark?: string;
}

const A4_WIDTH = 595.28;   // points
const A4_HEIGHT = 841.89;  // points

export class ReportCardRendererService {
  /**
   * Compose a report card PDF by overlaying the student's data onto
   * the school's uploaded template image.
   *
   * Returns the PDF as a Buffer, ready to write to disk or stream to
   * the browser.
   */
  static async renderReportCard(
    schoolId: string,
    templateId: string,
    data: RenderData
  ): Promise<Buffer> {
    if (!mongoose.isValidObjectId(templateId)) {
      throw new NotFoundError('Invalid template id');
    }

    const template = await ReportCardTemplate.findOne({
      _id: templateId,
      schoolId,
      type: 'report_card',
    });

    if (!template) {
      throw new NotFoundError('Report card template not found');
    }

    return this.compose(template, data);
  }

  /**
   * Compose a receipt PDF from a receipt-type template.
   */
  static async renderReceipt(
    schoolId: string,
    templateId: string,
    data: {
      receiptNo: string;
      date: string;
      studentName: string;
      amount: number;
      amountInWords: string;
      method: string;
      reference: string;
      schoolName: string;
      cashierName?: string;
    }
  ): Promise<Buffer> {
    if (!mongoose.isValidObjectId(templateId)) {
      throw new NotFoundError('Invalid template id');
    }

    const template = await ReportCardTemplate.findOne({
      _id: templateId,
      schoolId,
      type: 'receipt',
    });

    if (!template) {
      throw new NotFoundError('Receipt template not found');
    }

    // Receipts use the same composer — the pins just have different
    // field names. We map receipt data into the RenderData shape.
    const renderData: RenderData = {
      student: {
        fullName: data.studentName,
        admissionNumber: '',
        className: '',
      },
      session: '',
      term: '',
      school: { name: data.schoolName },
      results: [],
      average: 0,
      grade: '',
      // Receipt-specific values stuffed into pins via custom fields.
      // The composer reads from _receiptValues if present.
      ...({ _receiptValues: data } as any),
    };

    return this.compose(template, renderData, true);
  }

  // ------------------------------------------------------------------
  // Composer
  // ------------------------------------------------------------------
  private static async compose(
    template: any,
    data: RenderData,
    isReceipt = false
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Decode the data URL into an image.
    const { imageBytes, isPng } = this.decodeDataUrl(template.imageData);
    const image = isPng
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

    // Page geometry — always A4 portrait. If the template is landscape
    // the image still fits inside the A4 box.
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    // Scale the image to fill the page, preserving aspect ratio.
    const imgAspect = image.width / image.height;
    const pageAspect = A4_WIDTH / A4_HEIGHT;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > pageAspect) {
      // Image is wider than page — fit width, center vertically.
      drawWidth = A4_WIDTH;
      drawHeight = A4_WIDTH / imgAspect;
      offsetY = (A4_HEIGHT - drawHeight) / 2;
    } else {
      // Image is taller than page — fit height, center horizontally.
      drawHeight = A4_HEIGHT;
      drawWidth = A4_HEIGHT * imgAspect;
      offsetX = (A4_WIDTH - drawWidth) / 2;
    }

    page.drawImage(image, {
      x: offsetX,
      y: offsetY,
      width: drawWidth,
      height: drawHeight,
    });

    // The drawing area is the image's box on the page. Pin coordinates
    // are % of the image, so we map through this box.
    const drawRect = {
      x: offsetX,
      y: offsetY,
      width: drawWidth,
      height: drawHeight,
    };

    // Draw each pinned field.
    for (const pin of template.pins || []) {
      try {
        const value = this.resolveField(pin, data, isReceipt);
        if (value === null || value === undefined || value === '') continue;
        this.drawText(page, font, boldFont, drawRect, pin, String(value));
      } catch (err: any) {
        logger.warn(`Render: pin ${pin.field} failed — ${err?.message}`);
      }
    }

    // Draw each subject table.
    for (const table of template.tables || []) {
      try {
        this.drawTable(page, font, drawRect, table, data.results || []);
      } catch (err: any) {
        logger.warn(`Render: table failed — ${err?.message}`);
      }
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  // ------------------------------------------------------------------
  // Field resolution
  // ------------------------------------------------------------------
  private static resolveField(
    pin: any,
    data: RenderData,
    isReceipt: boolean
  ): string | number | null {
    const receiptValues: any = (data as any)._receiptValues || {};

    switch (pin.field) {
      case 'student_name':
        return isReceipt ? receiptValues.studentName : data.student?.fullName;
      case 'admission_number':
        return data.student?.admissionNumber;
      case 'class_name':
        return data.student?.className;
      case 'session':
        return data.session;
      case 'term':
        return data.term;
      case 'date_of_birth':
        return data.student?.dateOfBirth;
      case 'gender':
        return data.student?.gender;
      case 'age':
        return data.student?.age;
      case 'average':
        return data.average ? `${data.average}%` : '';
      case 'position':
        return data.position ? `${data.position}${this.ordinal(data.position)}` : '';
      case 'grade':
        return data.grade;
      case 'class_size':
        return data.classSize;
      case 'teacher_remark':
        return data.teacherRemark;
      case 'principal_remark':
        return data.principalRemark;
      case 'attendance_present':
        return data.attendance?.present;
      case 'attendance_absent':
        return data.attendance?.absent;
      case 'attendance_total':
        return data.attendance?.total;
      case 'next_term_begins':
        return data.nextTermBegins;
      case 'school_name':
        return data.school?.name;
      case 'custom_text':
        return pin.customText;

      // Receipt-specific fields.
      case 'receipt_no' as any:
        return receiptValues.receiptNo;
      case 'date' as any:
        return receiptValues.date;
      case 'amount' as any:
        return receiptValues.amount
          ? `₦${(receiptValues.amount / 100).toLocaleString('en-NG')}`
          : '';
      case 'amount_in_words' as any:
        return receiptValues.amountInWords;
      case 'method' as any:
        return receiptValues.method;
      case 'reference' as any:
        return receiptValues.reference;
      case 'cashier_name' as any:
        return receiptValues.cashierName;

      default:
        return null;
    }
  }

  private static ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }

  // ------------------------------------------------------------------
  // Text drawing
  // ------------------------------------------------------------------
  private static drawText(
    page: PDFPage,
    font: PDFFont,
    boldFont: PDFFont,
    rect: { x: number; y: number; width: number; height: number },
    pin: any,
    text: string
  ) {
    // Convert pin % coords to absolute PDF coords.
    // PDF's origin is bottom-left, but our pin Y is from the top.
    const absX = rect.x + (pin.x / 100) * rect.width;
    const absYFromTop = (pin.y / 100) * rect.height;
    const absY = rect.y + rect.height - absYFromTop;

    const fontSize = pin.size || 11;
    const chosenFont = pin.bold ? boldFont : font;

    // Truncate if it would overflow maxWidth.
    let displayText = text;
    if (pin.maxWidth) {
      const maxAbsWidth = (pin.maxWidth / 100) * rect.width;
      displayText = this.truncateToWidth(text, chosenFont, fontSize, maxAbsWidth);
    }

    // Adjust X for alignment.
    let textX = absX;
    if (pin.align === 'center') {
      const w = chosenFont.widthOfTextAtSize(displayText, fontSize);
      textX = absX - w / 2;
    } else if (pin.align === 'right') {
      const w = chosenFont.widthOfTextAtSize(displayText, fontSize);
      textX = absX - w;
    }

    page.drawText(displayText, {
      x: textX,
      y: absY,
      size: fontSize,
      font: chosenFont,
      color: rgb(0.09, 0.14, 0.12),
    });
  }

  private static truncateToWidth(
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number
  ): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let result = text;
    while (result.length > 3 && font.widthOfTextAtSize(result + '…', size) > maxWidth) {
      result = result.slice(0, -1);
    }
    return result + '…';
  }

  // ------------------------------------------------------------------
  // Subject table
  // ------------------------------------------------------------------
  private static drawTable(
    page: PDFPage,
    font: PDFFont,
    rect: { x: number; y: number; width: number; height: number },
    table: any,
    rows: RenderData['results']
  ) {
    if (!rows || rows.length === 0) return;

    const startX = rect.x + (table.x / 100) * rect.width;
    const startYFromTop = (table.y / 100) * rect.height;
    const startY = rect.y + rect.height - startYFromTop;

    const rowHeightAbs = (table.rowHeight / 100) * rect.height;
    const fontSize = table.fontSize || 10;
    const maxRows = Math.min(table.maxRows || 20, rows.length);

    const colOffsets: number[] = (table.columnOffsets || []).map(
      (o: number) => (o / 100) * rect.width
    );
    const columns: string[] = table.columns || [];

    for (let i = 0; i < maxRows; i++) {
      const row = rows[i];
      const rowY = startY - i * rowHeightAbs;

      for (let c = 0; c < columns.length && c < colOffsets.length; c++) {
        const col = columns[c];
        const colX = startX + colOffsets[c];

        let value: string | number = '';
        switch (col) {
          case 'subject':
            value = row.subjectName || '';
            break;
          case 'ca':
            value = row.ca ?? '';
            break;
          case 'exam':
            value = row.exam ?? '';
            break;
          case 'total':
            value = row.total ?? '';
            break;
          case 'grade':
            value = row.grade || '';
            break;
          case 'remark':
            value = row.remark || '';
            break;
        }

        if (value === '' || value === undefined || value === null) continue;

        page.drawText(String(value), {
          x: colX,
          y: rowY,
          size: fontSize,
          font,
          color: rgb(0.09, 0.14, 0.12),
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------------
  private static decodeDataUrl(dataUrl: string): {
    imageBytes: Uint8Array;
    isPng: boolean;
  } {
    const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg));base64,(.*)$/);
    if (!match) {
      throw new Error('Template image must be a PNG or JPEG data URL');
    }
    const mime = match[1];
    const base64 = match[3];
    const buffer = Buffer.from(base64, 'base64');
    return {
      imageBytes: new Uint8Array(buffer),
      isPng: mime.includes('png'),
    };
  }
}
