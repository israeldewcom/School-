// src/core/site/site.defaults.ts
import crypto from 'crypto';
import { IAdmissionFormField, ISiteBlock } from '../../models/SchoolSite';

export const MANDATORY_FIELD_KEYS = new Set([
  'applicantFirstName',
  'applicantLastName',
  'parentFirstName',
  'parentLastName',
  'parentPhone',
]);

export const FONT_CHOICES = [
  'Inter, system-ui, sans-serif',
  "Georgia, 'Times New Roman', serif",
  "'Trebuchet MS', Arial, sans-serif",
  'Verdana, Geneva, sans-serif',
  "'Palatino Linotype', 'Book Antiqua', serif",
  "'Courier New', monospace",
];

export const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'logout', 'app', 'www', 's', 'static', 'uploads', 'health', 'public',
  'schoolflow', 'support', 'dashboard', 'portal', 'signup', 'register', 'onboard', 'platform', 'assets',
]);

export function newBlockId(): string {
  return crypto.randomBytes(5).toString('hex');
}

export function defaultFormFields(): IAdmissionFormField[] {
  const f = (
    key: string, label: string, type: IAdmissionFormField['type'], section: IAdmissionFormField['section'],
    required: boolean, extra: Partial<IAdmissionFormField> = {}
  ): IAdmissionFormField => ({ key, label, type, section, required, builtIn: true, enabled: true, ...extra });

  return [
    f('applicantFirstName', "Child's first name", 'text', 'applicant', true),
    f('applicantLastName', "Child's last name", 'text', 'applicant', true),
    f('gender', 'Gender', 'select', 'applicant', true, { options: ['MALE', 'FEMALE'] }),
    f('dateOfBirth', 'Date of birth', 'date', 'applicant', true),
    f('classAppliedId', 'Class applying for', 'select', 'applicant', true),
    f('previousSchool', 'Previous school (if any)', 'text', 'applicant', false),
    f('applicantAddress', 'Home address', 'textarea', 'applicant', false),
    f('applicantPhoto', "Child's passport photograph", 'photo', 'applicant', true),
    f('parentFirstName', "Parent/guardian's first name", 'text', 'parent', true),
    f('parentLastName', "Parent/guardian's last name", 'text', 'parent', true),
    f('parentPhone', 'Phone number', 'phone', 'parent', true, { placeholder: '08012345678' }),
    f('parentEmail', 'Email address', 'email', 'parent', false),
    f('relationship', 'Relationship to child', 'select', 'parent', false, { options: ['Father', 'Mother', 'Guardian'] }),
    f('parentAddress', "Parent/guardian's address", 'textarea', 'parent', false),
  ];
}

export function defaultBlocks(school: { name: string; motto?: string }): ISiteBlock[] {
  const b = (type: ISiteBlock['type'], data: Record<string, any>, order: number): ISiteBlock => ({
    id: newBlockId(), type, enabled: true, order, data,
  });
  return [
    b('HERO', {
      headline: school.name,
      subheadline: school.motto || 'Welcome to our school. Nurturing learners for a brighter future.',
      ctaLabel: 'Apply for admission',
      image: '',
    }, 0),
    b('ABOUT', {
      title: 'About us',
      body: `Welcome to ${school.name}. Tell parents about your school, your values and what makes your classrooms special. You can edit this text from your dashboard.`,
      image: '',
    }, 1),
    b('STATS', {
      items: [
        { label: 'Students', auto: 'students' },
        { label: 'Classes', auto: 'classes' },
      ],
    }, 2),
    b('FEATURES', {
      title: 'Why parents choose us',
      items: [
        { title: 'Caring teachers', text: 'Dedicated staff who know every child by name.' },
        { title: 'Safe environment', text: 'A secure, friendly campus where children thrive.' },
        { title: 'Strong academics', text: 'Well-planned lessons and regular progress reports.' },
      ],
    }, 3),
    b('PROGRAMS', { title: 'Classes we offer', showClasses: true, items: [] }, 4),
    b('ADMISSION_CTA', {
      title: 'Admissions are open',
      text: 'Apply online in a few minutes. We will review your application and contact you.',
      ctaLabel: 'Start application',
    }, 5),
    b('CONTACT', { title: 'Contact us' }, 6),
  ];
}
