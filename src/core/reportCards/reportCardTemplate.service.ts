// src/core/reportCards/reportCardTemplate.service.ts
import mongoose from 'mongoose';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';
import logger from '../../config/logger';

// ------------------------------------------------------------------
// Validation constants
// ------------------------------------------------------------------

// Every field a pin can target. Kept in sync with the frontend's
// TEMPLATE_FIELD_OPTIONS and with the field resolvers in
// reportCardRenderer.service.ts.
const VALID_REPORT_CARD_FIELDS = new Set([
  'student_name',
  'admission_number',
  'class_name',
  'session',
  'term',
  'date_of_birth',
  'gender',
  'age',
  'average',
  'position',
  'grade',
  'class_size',
  'teacher_remark',
  'principal_remark',
  'attendance_present',
  'attendance_absent',
  'attendance_total',
  'next_term_begins',
  'school_name',
  'custom_text',
]);

const VALID_RECEIPT_FIELDS = new Set([
  'school_name',
  'receipt_no',
  'date',
  'student_name',
  'amount',
  'amount_in_words',
  'method',
  'reference',
  'cashier_name',
  'custom_text',
]);

const VALID_TEMPLATE_TYPES = new Set(['report_card', 'receipt', 'invoice']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB decoded

// ------------------------------------------------------------------
// Service
// ------------------------------------------------------------------
export class ReportCardTemplateService {
  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------

  /**
   * List templates for a school.
   *
   * By default the `imageData` blob is stripped — it can be several
   * megabytes per template and the list view never displays it.
   * Pass `includeImage: true` to keep it (used by edit modals).
   */
  static async list(schoolId: string, query: any = {}) {
    const filter: any = { schoolId };
    if (query.type && VALID_TEMPLATE_TYPES.has(String(query.type))) {
      filter.type = String(query.type);
    }
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true' || query.isActive === true;
    }

    const includeImage = query.includeImage === 'true' || query.includeImage === true;

    let q = ReportCardTemplate.find(filter).sort({ isDefault: -1, createdAt: -1 });
    if (!includeImage) {
      q = q.select('-imageData');
    }
    const templates = await q.lean();

    return templates.map((t: any) => ({
      id: String(t._id),
      name: t.name,
      type: t.type,
      pinCount: (t.pins || []).length,
      tableCount: (t.tables || []).length,
      isActive: t.isActive,
      isDefault: t.isDefault,
      hasImage: !!t.imageData,
      // Only present when includeImage=true.
      ...(includeImage ? { imageData: t.imageData } : {}),
      pins: t.pins || [],
      tables: t.tables || [],
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  /**
   * Get a single template, always including the image data (needed to
   * edit and re-save the pins).
   */
  static async getById(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid template id');
    }
    const template = await ReportCardTemplate.findOne({ _id: id, schoolId }).lean();
    if (!template) throw new NotFoundError('Template not found');

    return {
      id: String((template as any)._id),
      name: (template as any).name,
      type: (template as any).type,
      imageData: (template as any).imageData,
      pins: (template as any).pins || [],
      tables: (template as any).tables || [],
      isActive: (template as any).isActive,
      isDefault: (template as any).isDefault,
      createdAt: (template as any).createdAt,
      updatedAt: (template as any).updatedAt,
    };
  }

  /**
   * Get the active template for a type — used by the renderer when no
   * explicit templateId is passed. Prefers the template marked default,
   * falls back to the most recently created active one.
   */
  static async getActiveForType(schoolId: string, type: string) {
    if (!VALID_TEMPLATE_TYPES.has(type)) {
      throw new BadRequestError(`Template type must be one of: ${[...VALID_TEMPLATE_TYPES].join(', ')}`);
    }
    const template = await ReportCardTemplate.findOne({
      schoolId,
      type,
      isActive: true,
    }).sort({ isDefault: -1, createdAt: -1 });
    return template;
  }

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------

  static async create(schoolId: string, data: any) {
    // --- Validate the top-level fields ---
    if (!data?.name || !String(data.name).trim()) {
      throw new BadRequestError('Template name is required');
    }
    const name = String(data.name).trim();
    if (name.length > 100) {
      throw new BadRequestError('Template name must be 100 characters or fewer');
    }

    const type = data.type ? String(data.type) : 'report_card';
    if (!VALID_TEMPLATE_TYPES.has(type)) {
      throw new BadRequestError(`Template type must be one of: ${[...VALID_TEMPLATE_TYPES].join(', ')}`);
    }

    if (!data?.imageData || typeof data.imageData !== 'string') {
      throw new BadRequestError('Template image is required');
    }

    // --- Validate the image ---
    const imageCheck = ReportCardTemplateService.validateImage(data.imageData);
    if (!imageCheck.ok) {
      throw new BadRequestError(imageCheck.error!);
    }

    // --- Validate pins ---
    const pins = Array.isArray(data.pins) ? data.pins : [];
    const pinCheck = ReportCardTemplateService.validatePins(pins, type);
    if (!pinCheck.ok) {
      throw new BadRequestError(pinCheck.error!);
    }

    // --- Validate tables ---
    const tables = Array.isArray(data.tables) ? data.tables : [];
    const tableCheck = ReportCardTemplateService.validateTables(tables);
    if (!tableCheck.ok) {
      throw new BadRequestError(tableCheck.error!);
    }

    // --- Prevent duplicate names within a type per school ---
    const existingByName = await ReportCardTemplate.findOne({
      schoolId,
      type,
      name,
    });
    if (existingByName) {
      throw new BadRequestError(
        `A ${type.replace('_', ' ')} template named "${name}" already exists.`
      );
    }

    // --- First template of its type is automatically the default ---
    const siblingCount = await ReportCardTemplate.countDocuments({ schoolId, type });
    const shouldBeDefault = data.isDefault === true || siblingCount === 0;

    const doc = await ReportCardTemplate.create({
      schoolId,
      name,
      type,
      imageData: data.imageData,
      pins: pinCheck.normalized,
      tables: tableCheck.normalized,
      isActive: data.isActive !== false,
      isDefault: shouldBeDefault,
    });

    // If this one is default, unset the flag on its siblings.
    if (shouldBeDefault) {
      await ReportCardTemplate.updateMany(
        { schoolId, type, _id: { $ne: doc._id } },
        { $set: { isDefault: false } }
      );
    }

    logger.info(
      `Template created: "${name}" (${type}) — ${pinCheck.normalized.length} pins, ${tableCheck.normalized.length} tables`,
      { schoolId, templateId: String(doc._id) }
    );

    return {
      id: String(doc._id),
      name: doc.name,
      type: doc.type,
      pinCount: (doc.pins || []).length,
      tableCount: (doc.tables || []).length,
      isDefault: doc.isDefault,
      isActive: doc.isActive,
    };
  }

  // ------------------------------------------------------------------
  // Update
  // ------------------------------------------------------------------

  static async update(schoolId: string, id: string, data: any) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid template id');
    }
    const template = await ReportCardTemplate.findOne({ _id: id, schoolId });
    if (!template) throw new NotFoundError('Template not found');

    // --- Name ---
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new BadRequestError('Template name cannot be empty');
      if (name.length > 100) {
        throw new BadRequestError('Template name must be 100 characters or fewer');
      }
      if (name !== template.name) {
        const dup = await ReportCardTemplate.findOne({
          schoolId,
          type: template.type,
          name,
          _id: { $ne: template._id },
        });
        if (dup) {
          throw new BadRequestError(`Another template already uses the name "${name}".`);
        }
        template.name = name;
      }
    }

    // --- Image (only if a new one is passed) ---
    if (data.imageData !== undefined) {
      const imageCheck = ReportCardTemplateService.validateImage(data.imageData);
      if (!imageCheck.ok) {
        throw new BadRequestError(imageCheck.error!);
      }
      template.imageData = data.imageData;
    }

    // --- Pins ---
    if (data.pins !== undefined) {
      const pinCheck = ReportCardTemplateService.validatePins(
        Array.isArray(data.pins) ? data.pins : [],
        template.type
      );
      if (!pinCheck.ok) {
        throw new BadRequestError(pinCheck.error!);
      }
      template.pins = pinCheck.normalized as any;
    }

    // --- Tables ---
    if (data.tables !== undefined) {
      const tableCheck = ReportCardTemplateService.validateTables(
        Array.isArray(data.tables) ? data.tables : []
      );
      if (!tableCheck.ok) {
        throw new BadRequestError(tableCheck.error!);
      }
      template.tables = tableCheck.normalized as any;
    }

    // --- Active flag ---
    if (data.isActive !== undefined) {
      template.isActive = !!data.isActive;
    }

    // --- Default flag ---
    if (data.isDefault === true) {
      template.isDefault = true;
    } else if (data.isDefault === false && template.isDefault) {
      // Allowing un-default only if another template exists to take over.
      const other = await ReportCardTemplate.findOne({
        schoolId,
        type: template.type,
        isActive: true,
        _id: { $ne: template._id },
      });
      if (!other) {
        throw new BadRequestError(
          'Cannot remove default — this is the only template of its type.'
        );
      }
      template.isDefault = false;
    }

    await template.save();

    // If we just made this one default, unset the flag on siblings.
    if (template.isDefault) {
      await ReportCardTemplate.updateMany(
        {
          schoolId,
          type: template.type,
          _id: { $ne: template._id },
          isDefault: true,
        },
        { $set: { isDefault: false } }
      );
    }

    logger.info(`Template updated: "${template.name}"`, {
      schoolId,
      templateId: String(template._id),
    });

    return {
      id: String(template._id),
      name: template.name,
      type: template.type,
      pinCount: (template.pins || []).length,
      tableCount: (template.tables || []).length,
      isDefault: template.isDefault,
      isActive: template.isActive,
    };
  }

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  static async delete(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid template id');
    }
    const template = await ReportCardTemplate.findOne({ _id: id, schoolId });
    if (!template) throw new NotFoundError('Template not found');

    const wasDefault = template.isDefault;
    const type = template.type;
    const name = template.name;

    await ReportCardTemplate.findByIdAndDelete(id);

    // If we just deleted the default, promote the newest remaining
    // active template of the same type.
    if (wasDefault) {
      const next = await ReportCardTemplate.findOne({
        schoolId,
        type,
        isActive: true,
      }).sort({ createdAt: -1 });

      if (next) {
        next.isDefault = true;
        await next.save();
        logger.info(`Promoted "${next.name}" to default for type ${type}`, { schoolId });
      }
    }

    logger.info(`Template deleted: "${name}" (${type})`, { schoolId, templateId: id });
    return { deleted: true, wasDefault };
  }

  // ------------------------------------------------------------------
  // Set default
  // ------------------------------------------------------------------

  static async setDefault(schoolId: string, id: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid template id');
    }
    const template = await ReportCardTemplate.findOne({ _id: id, schoolId });
    if (!template) throw new NotFoundError('Template not found');

    if (!template.isActive) {
      throw new BadRequestError('Cannot set a deactivated template as default.');
    }

    template.isDefault = true;
    await template.save();

    await ReportCardTemplate.updateMany(
      { schoolId, type: template.type, _id: { $ne: template._id } },
      { $set: { isDefault: false } }
    );

    logger.info(`Default template set: "${template.name}" (${template.type})`, {
      schoolId,
      templateId: String(template._id),
    });

    return { id: String(template._id), isDefault: true };
  }

  // ------------------------------------------------------------------
  // Duplicate — handy for "clone this template and modify it"
  // ------------------------------------------------------------------

  static async duplicate(schoolId: string, id: string, newName?: string) {
    if (!mongoose.isValidObjectId(id)) {
      throw new BadRequestError('Invalid template id');
    }
    const source = await ReportCardTemplate.findOne({ _id: id, schoolId }).lean();
    if (!source) throw new NotFoundError('Template not found');

    // Ensure a unique name for the copy.
    let baseName = (newName && String(newName).trim()) || `${(source as any).name} (copy)`;
    if (baseName.length > 100) baseName = baseName.slice(0, 100);

    let finalName = baseName;
    let counter = 1;
    while (
      await ReportCardTemplate.findOne({
        schoolId,
        type: (source as any).type,
        name: finalName,
      })
    ) {
      counter++;
      finalName = `${baseName} ${counter}`;
      if (counter > 50) {
        // Give up on finding a unique name after 50 attempts.
        finalName = `${baseName} ${Date.now()}`;
        break;
      }
    }

    const copy = await ReportCardTemplate.create({
      schoolId,
      name: finalName,
      type: (source as any).type,
      imageData: (source as any).imageData,
      pins: (source as any).pins || [],
      tables: (source as any).tables || [],
      isActive: true,
      isDefault: false,
    });

    logger.info(`Template duplicated: "${(source as any).name}" → "${finalName}"`, {
      schoolId,
      templateId: String(copy._id),
    });

    return {
      id: String(copy._id),
      name: copy.name,
      type: copy.type,
      pinCount: (copy.pins || []).length,
      tableCount: (copy.tables || []).length,
    };
  }

  // ==================================================================
  // Private validation helpers
  // ==================================================================

  /**
   * Validates a data URL image. Returns the decoded byte size and
   * the detected format, or an error message.
   */
  private static validateImage(dataUrl: string): {
    ok: boolean;
    error?: string;
    bytes?: number;
    format?: 'png' | 'jpeg';
  } {
    if (typeof dataUrl !== 'string') {
      return { ok: false, error: 'Template image must be a string' };
    }
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (!match) {
      return {
        ok: false,
        error: 'Template image must be a PNG or JPEG data URL',
      };
    }
    const format = match[1] === 'png' ? 'png' : 'jpeg';
    const base64 = match[2];

    // Base64 length * 3/4 approximates the decoded byte count.
    const approxBytes = Math.ceil((base64.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      const mb = (approxBytes / 1024 / 1024).toFixed(1);
      return {
        ok: false,
        error: `Template image is too large (${mb} MB decoded; max ${MAX_IMAGE_BYTES / 1024 / 1024} MB). Compress it first.`,
      };
    }
    if (approxBytes < 100) {
      return { ok: false, error: 'Template image appears to be empty' };
    }
    return { ok: true, bytes: approxBytes, format };
  }

  /**
   * Validates each pin:
   *   - field is valid for the template type
   *   - x and y are within 0-100
   *   - custom_text pins have non-empty customText
   *   - size is a sane number
   *
   * Returns the normalized pins array (clamped, defaults filled).
   */
  private static validatePins(
    pins: any[],
    type: string
  ): { ok: boolean; error?: string; normalized: any[] } {
    const validFields =
      type === 'receipt' ? VALID_RECEIPT_FIELDS : VALID_REPORT_CARD_FIELDS;
    const normalized: any[] = [];

    if (pins.length > 200) {
      return { ok: false, error: 'Too many pins (max 200)', normalized: [] };
    }

    for (let i = 0; i < pins.length; i++) {
      const raw = pins[i];
      if (!raw || typeof raw !== 'object') {
        return { ok: false, error: `Pin ${i + 1} is invalid`, normalized: [] };
      }

      const field = String(raw.field || '');
      if (!validFields.has(field)) {
        return {
          ok: false,
          error: `Pin ${i + 1}: "${field}" is not a valid ${type} field`,
          normalized: [],
        };
      }

      const x = Number(raw.x);
      const y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { ok: false, error: `Pin ${i + 1}: coordinates must be numbers`, normalized: [] };
      }
      if (x < 0 || x > 100 || y < 0 || y > 100) {
        return {
          ok: false,
          error: `Pin ${i + 1}: coordinates must be between 0 and 100`,
          normalized: [],
        };
      }

      if (field === 'custom_text') {
        const custom = raw.customText ? String(raw.customText).trim() : '';
        if (!custom) {
          return {
            ok: false,
            error: `Pin ${i + 1}: custom_text pins need customText set`,
            normalized: [],
          };
        }
      }

      const size = raw.size !== undefined ? Number(raw.size) : 11;
      if (!Number.isFinite(size) || size < 4 || size > 72) {
        return {
          ok: false,
          error: `Pin ${i + 1}: size must be between 4 and 72`,
          normalized: [],
        };
      }

      const align =
        raw.align === 'center' || raw.align === 'right' ? raw.align : 'left';

      const maxWidth =
        raw.maxWidth !== undefined ? Number(raw.maxWidth) : undefined;
      if (maxWidth !== undefined) {
        if (!Number.isFinite(maxWidth) || maxWidth <= 0 || maxWidth > 100) {
          return {
            ok: false,
            error: `Pin ${i + 1}: maxWidth must be between 0 and 100`,
            normalized: [],
          };
        }
      }

      const entry: any = {
        field,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        size: Number(size.toFixed(1)),
        bold: !!raw.bold,
        align,
      };
      if (maxWidth !== undefined) entry.maxWidth = Number(maxWidth.toFixed(2));
      if (field === 'custom_text') entry.customText = String(raw.customText).trim();

      normalized.push(entry);
    }

    return { ok: true, normalized };
  }

  /**
   * Validates each table:
   *   - x, y within 0-100
   *   - columnOffsets and columns lengths match
   *   - rowHeight positive and <= 20
   *   - maxRows a sane number
   */
  private static validateTables(
    tables: any[]
  ): { ok: boolean; error?: string; normalized: any[] } {
    if (tables.length === 0) return { ok: true, normalized: [] };
    if (tables.length > 5) {
      return { ok: false, error: 'Too many tables (max 5)', normalized: [] };
    }

    const validColumns = new Set([
      'subject',
      'ca',
      'exam',
      'total',
      'grade',
      'remark',
    ]);

    const normalized: any[] = [];
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      if (!t || typeof t !== 'object') {
        return { ok: false, error: `Table ${i + 1} is invalid`, normalized: [] };
      }

      const x = Number(t.x);
      const y = Number(t.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
        return {
          ok: false,
          error: `Table ${i + 1}: coordinates must be between 0 and 100`,
          normalized: [],
        };
      }

      const columns = Array.isArray(t.columns) ? t.columns.map(String) : [];
      if (columns.length === 0) {
        return { ok: false, error: `Table ${i + 1}: at least one column is required`, normalized: [] };
      }
      for (const c of columns) {
        if (!validColumns.has(c)) {
          return {
            ok: false,
            error: `Table ${i + 1}: "${c}" is not a valid column. Use: ${[...validColumns].join(', ')}`,
            normalized: [],
          };
        }
      }

      const offsets = Array.isArray(t.columnOffsets)
        ? t.columnOffsets.map(Number)
        : [];
      if (offsets.length !== columns.length) {
        return {
          ok: false,
          error: `Table ${i + 1}: columnOffsets length must match columns length`,
          normalized: [],
        };
      }
      for (const o of offsets) {
        if (!Number.isFinite(o) || o < 0 || o > 100) {
          return {
            ok: false,
            error: `Table ${i + 1}: columnOffsets must be between 0 and 100`,
            normalized: [],
          };
        }
      }

      const rowHeight = Number(t.rowHeight) || 3;
      if (!Number.isFinite(rowHeight) || rowHeight <= 0 || rowHeight > 20) {
        return {
          ok: false,
          error: `Table ${i + 1}: rowHeight must be between 0 and 20`,
          normalized: [],
        };
      }

      const fontSize = Number(t.fontSize) || 10;
      if (!Number.isFinite(fontSize) || fontSize < 4 || fontSize > 24) {
        return {
          ok: false,
          error: `Table ${i + 1}: fontSize must be between 4 and 24`,
          normalized: [],
        };
      }

      const maxRows = Number(t.maxRows) || 20;
      if (!Number.isFinite(maxRows) || maxRows < 1 || maxRows > 60) {
        return {
          ok: false,
          error: `Table ${i + 1}: maxRows must be between 1 and 60`,
          normalized: [],
        };
      }

      normalized.push({
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        columns,
        columnOffsets: offsets.map((o) => Number(o.toFixed(2))),
        rowHeight: Number(rowHeight.toFixed(2)),
        fontSize,
        maxRows,
      });
    }

    return { ok: true, normalized };
  }
}
