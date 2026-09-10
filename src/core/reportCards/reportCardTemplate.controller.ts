import { Request, Response, NextFunction } from 'express';
import { ReportCardTemplateService } from './reportCardTemplate.service';

export class ReportCardTemplateController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await ReportCardTemplateService.create(req.schoolId!, req.body);
      res.status(201).json({ success: true, data: template });
    } catch (error) { next(error); }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const templates = await ReportCardTemplateService.getAll(req.schoolId!);
      res.json({ success: true, data: templates });
    } catch (error) { next(error); }
  }

  static async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await ReportCardTemplateService.getById(req.params.id, req.schoolId!);
      res.json({ success: true, data: template });
    } catch (error) { next(error); }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await ReportCardTemplateService.update(req.params.id, req.schoolId!, req.body);
      res.json({ success: true, data: template });
    } catch (error) { next(error); }
  }

  static async setDefault(req: Request, res: Response, next: NextFunction) {
    try {
      const template = await ReportCardTemplateService.setDefault(req.params.id, req.schoolId!);
      res.json({ success: true, data: template });
    } catch (error) { next(error); }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await ReportCardTemplateService.delete(req.params.id, req.schoolId!);
      res.json({ success: true, message: 'Template deleted' });
    } catch (error) { next(error); }
  }
}
