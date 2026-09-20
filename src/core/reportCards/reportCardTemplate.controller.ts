// src/core/reportCards/reportCardTemplate.controller.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ReportCardTemplate } from '../../models/ReportCardTemplate';
import { BadRequestError, NotFoundError } from '../../middleware/error.middleware';

export class ReportCardTemplateController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { type } = req.query;
      const filter: any = { schoolId: req.schoolId };
      if (type) filter.type = type;
      const templates = await ReportCardTemplate.find(filter)
        .select('-imageData') // don't ship the base64 blob in the list
        .sort({ createdAt: -1 })
        .lean();
      res.json({ success: true, data: templates });
    } catch (err) { next(err); }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await ReportCardTemplate.findOne({
        _id: req.params.id,
        schoolId: req.schoolId,
      }).lean();
      if (!template) throw new NotFoundError('Template not found');
      res.json({ success: true, data: template });
    } catch (err) { next(err); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, type, imageData, pins, tables, isDefault } = req.body || {};
      if (!name || !String(name).trim()) {
        throw new BadRequestError('Template name is required');
      }
      if (!imageData || !String(imageData).startsWith('data:image')) {
        throw new BadRequestError('Template image must be a data URL');
      }

      // Optional: cap image size to protect the Mongo document limit.
      const approxBytes = Math.ceil(String(imageData).length * 0.75);
      if (approxBytes > 8 * 1024 * 1024) {
        throw new BadRequestError(
          'Template image is too large (max 8 MB decoded). Compress it first.'
        );
      }

      // If this is the first template of its type, mark it default.
      const existingCount = await ReportCardTemplate.countDocuments({
        schoolId: req.schoolId,
        type: type || 'report_card',
      });

      const doc = await ReportCardTemplate.create({
        schoolId: req.schoolId,
        name: String(name).trim(),
        type: type || 'report_card',
        imageData,
        pins: Array.isArray(pins) ? pins : [],
        tables: Array.isArray(tables) ? tables : [],
        isActive: true,
        isDefault: isDefault || existingCount === 0,
      });

      // If marked default, unset the flag on siblings.
      if (doc.isDefault) {
        await ReportCardTemplate.updateMany(
          { schoolId: req.schoolId, type: doc.type, _id: { $ne: doc._id } },
          { $set: { isDefault: false } }
        );
      }

      res.status(201).json({
        success: true,
        data: {
          id: String(doc._id),
          name: doc.name,
          type: doc.type,
          pinCount: (doc.pins || []).length,
          tableCount: (doc.tables || []).length,
        },
      });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await ReportCardTemplate.findOne({
        _id: req.params.id,
        schoolId: req.schoolId,
      });
      if (!template) throw new NotFoundError('Template not found');

      if (req.body.name !== undefined) template.name = String(req.body.name).trim();
      if (req.body.imageData !== undefined) template.imageData = req.body.imageData;
      if (Array.isArray(req.body.pins)) template.pins = req.body.pins;
      if (Array.isArray(req.body.tables)) template.tables = req.body.tables;
      if (req.body.isActive !== undefined) template.isActive = !!req.body.isActive;

      if (req.body.isDefault) {
        template.isDefault = true;
        await ReportCardTemplate.updateMany(
          { schoolId: req.schoolId, type: template.type, _id: { $ne: template._id } },
          { $set: { isDefault: false } }
        );
      }

      await template.save();
      res.json({ success: true, data: { id: String(template._id) } });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const t = await ReportCardTemplate.findOneAndDelete({
        _id: req.params.id,
        schoolId: req.schoolId,
      });
      if (!t) throw new NotFoundError('Template not found');
      res.json({ success: true });
    } catch (err) { next(err); }
  }

  static async setDefault(req: Request, res: Response, next: NextFunction) {
    try {
      const t = await ReportCardTemplate.findOne({
        _id: req.params.id,
        schoolId: req.schoolId,
      });
      if (!t) throw new NotFoundError('Template not found');
      t.isDefault = true;
      await t.save();
      await ReportCardTemplate.updateMany(
        { schoolId: req.schoolId, type: t.type, _id: { $ne: t._id } },
        { $set: { isDefault: false } }
      );
      res.json({ success: true });
    } catch (err) { next(err); }
  }
}
