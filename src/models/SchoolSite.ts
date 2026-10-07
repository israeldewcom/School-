// src/models/SchoolSite.ts
import mongoose, { Schema, Document } from 'mongoose';

export const SITE_BLOCK_TYPES = [
  'HERO',
  'ABOUT',
  'STATS',
  'PROGRAMS',
  'FEATURES',
  'GALLERY',
  'TESTIMONIALS',
  'TEXT',
  'CONTACT',
  'ADMISSION_CTA',
] as const;
export type SiteBlockType = (typeof SITE_BLOCK_TYPES)[number];

export interface ISiteBlock {
  id: string;
  type: SiteBlockType;
  enabled: boolean;
  order: number;
  data: Record<string, any>;
}

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'select',
  'date',
  'phone',
  'email',
  'number',
  'photo',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export interface IAdmissionFormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  section: 'applicant' | 'parent' | 'custom';
  options?: string[];
  placeholder?: string;
  // Built-in fields map to real columns on AdmissionApplication and cannot
  // be deleted (only hidden / made optional where it is safe to do so).
  builtIn: boolean;
  enabled: boolean;
}

export interface ISchoolSite extends Document {
  schoolId: mongoose.Types.ObjectId;
  slug: string;
  slugCompact: string;
  slugHistory: string[];
  published: boolean;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    logoUrl?: string;
    heroImage?: string;
    template?: 'modern' | 'classic' | 'bold';
  };
  seo: { title?: string; description?: string };
  socials: { facebook?: string; instagram?: string; x?: string; youtube?: string; whatsapp?: string };
  blocks: ISiteBlock[];
  admissions: {
    open: boolean;
    intro?: string;
    closingDate?: Date;
    classIds: mongoose.Types.ObjectId[]; // empty = every class
    fields: IAdmissionFormField[];
    successMessage?: string;
  };
  customDomain?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BlockSchema = new Schema<ISiteBlock>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: SITE_BLOCK_TYPES, required: true },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const FieldSchema = new Schema<IAdmissionFormField>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: FORM_FIELD_TYPES, default: 'text' },
    required: { type: Boolean, default: false },
    section: { type: String, enum: ['applicant', 'parent', 'custom'], default: 'custom' },
    options: [{ type: String }],
    placeholder: { type: String },
    builtIn: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const SchoolSiteSchema = new Schema<ISchoolSite>(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    slugCompact: { type: String, required: true, index: true },
    slugHistory: { type: [String], default: [], index: true },
    published: { type: Boolean, default: true },
    theme: {
      primaryColor: { type: String, default: '#0f766e' },
      secondaryColor: { type: String, default: '#f59e0b' },
      fontFamily: { type: String, default: 'Inter, system-ui, sans-serif' },
      logoUrl: { type: String },
      heroImage: { type: String },
      template: { type: String, enum: ['modern', 'classic', 'bold'], default: 'modern' },
    },
    seo: { title: String, description: String },
    socials: {
      facebook: String,
      instagram: String,
      x: String,
      youtube: String,
      whatsapp: String,
    },
    blocks: { type: [BlockSchema], default: [] },
    admissions: {
      open: { type: Boolean, default: true },
      intro: { type: String },
      closingDate: { type: Date },
      classIds: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
      fields: { type: [FieldSchema], default: [] },
      successMessage: { type: String },
    },
    customDomain: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
  },
  { timestamps: true }
);

SchoolSiteSchema.pre('validate', function (next) {
  if (this.slug) this.slugCompact = this.slug.replace(/-/g, '');
  next();
});

export const SchoolSite = mongoose.model<ISchoolSite>('SchoolSite', SchoolSiteSchema);
