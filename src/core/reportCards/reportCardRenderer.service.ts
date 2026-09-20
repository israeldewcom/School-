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

type Resolvable = string | number | null;

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

export class ReportCardRendererService {
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

    const { imageBytes, isPng } = this.decodeDataUrl(template.imageData);
    const image = isPng
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);

    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

    const imgAspect = image.width / image.height;
    const pageAspect = A4_WIDTH / A4_HEIGHT;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > pageAspect) {
      drawWidth = A4_WIDTH;
      drawHeight = A4_WIDTH / imgAspect;
      offsetY = (A4_HEIGHT - drawHeight) / 2;
    } else {
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

    const drawRect = {
      x: offsetX,
      y: offsetY,
      width: drawWidth,
      height: drawHeight,
    };

    for (const pin of template.pins || []) {
      try {
        const value = this.resolveField(pin, data, isReceipt);
        if (value === null || value === undefined || value === '') continue;
        this.drawText(page, font, boldFont, drawRect, pin, String(value));
      } catch (err: any) {
        logger.warn(`Render: pin ${pin.field} failed — ${err?.message}`);
      }
    }

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
  // Field resolution — every branch returns Resolvable (never undefined)
  // ------------------------------------------------------------------
  private static resolveField(
    pin: any,
    data: RenderData,
    isReceipt: boolean
  ): Resolvable {
    const receiptValues: any = (data as any)._receiptValues || {};

    // Helper: coerce anything to a Resolvable.
    const coerce = (v: any): Resolvable => {
      if (v === undefined || v === null || v === '') return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      return String(v);
    };

    switch (pin.field) {
      case 'student_name':
        return coerce(isReceipt ? receiptValues.studentName : data.student?.fullName);
      case 'admission_number':
        return coerce(data.student?.admissionNumber);
      case 'class_name':
        return coerce(data.student?.className);
      case 'session':
        return coerce(data.session);
      case 'term':
        return coerce(data.term);
      case 'date_of_birth':
        return coerce(data.student?.dateOfBirth);
      case 'gender':
        return coerce(data.student?.gender);
      case 'age':
        return coerce(data.student?.age);
      case 'average':
        return data.average ? coerce(`${data.average}%`) : null;
      case 'position':
        return data.position ? coerce(`${data.position}${this.ordinal(data.position)}`) : null;
      case 'grade':
        return coerce(data.grade);
      case 'class_size':
        return coerce(data.classSize);
      case 'teacher_remark':
        return coerce(data.teacherRemark);
      case 'principal_remark':
        return coerce(data.principalRemark);
      case 'attendance_present':
        return coerce(data.attendance?.present);
      case 'attendance_absent':
        return coerce(data.attendance?.absent);
      case 'attendance_total':
        return coerce(data.attendance?.total);
      case 'next_term_begins':
        return coerce(data.nextTermBegins);
      case 'school_name':
        return coerce(data.school?.name);
      case 'custom_text':
        return coerce(pin.customText);

      // Receipt-specific fields.
      case 'receipt_no':
        return coerce(receiptValues.receiptNo);
      case 'date':
        return coerce(receiptValues.date);
      case 'amount':
        return receiptValues.amount
          ? coerce(`₦${(receiptValues.amount / 100).toLocaleString('en-NG')}`)
          : null;
      case 'amount_in_words':
        return coerce(receiptValues.amountInWords);
      case 'method':
        return coerce(receiptValues.method);
      case 'reference':
        return coerce(receiptValues.reference);
      case 'cashier_name':
        return coerce(receiptValues.cashierName);

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
    const absX = rect.x + (pin.x / 100) * rect.width;
    const absYFromTop = (pin.y / 100) * rect.height;
    const absY = rect.y + rect.height - absYFromTop;

    const fontSize = pin.size || 11;
    const chosenFont = pin.bold ? boldFont : font;

    let displayText = text;
    if (pin.maxWidth) {
      const maxAbsWidth = (pin.maxWidth / 100) * rect.width;
      displayText = this.truncateToWidth(text, chosenFont, fontSize, maxAbsWidth);
    }

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

    const colOffsets: number[] = ((table.columnOffsets || []) as number[]).map(
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
