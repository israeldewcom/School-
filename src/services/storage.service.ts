// src/services/storage.service.ts
//
// One place that stores images/files. Uses Cloudinary when it is configured,
// otherwise falls back to the local /uploads folder (served statically by app.ts).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { cloudinary } from '../integrations/storage/cloudinary';
import { env } from '../config/env';
import logger from '../config/logger';
import { BadRequestError } from '../middleware/error.middleware';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}
ensureDir(UPLOAD_ROOT);

export function cloudinaryConfigured(): boolean {
  return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || '').trim());
  if (!m) throw new BadRequestError('Image must be a base64 data URL.');
  const buffer = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  return { mime: m[1].toLowerCase(), buffer };
}

function sniffImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export function isDataUrl(v: any): boolean {
  return typeof v === 'string' && v.startsWith('data:');
}

/**
 * Store an image that arrives as a base64 data URL (or Buffer) and return a URL.
 * Raster images are verified by magic bytes. SVG is allowed only when
 * `allowSvg` is set (used for generated logos, never for user uploads).
 */
export async function saveImage(opts: {
  dataUrl?: string;
  buffer?: Buffer;
  mime?: string;
  folder: string;
  allowSvg?: boolean;
}): Promise<string> {
  let buffer = opts.buffer;
  let mime = opts.mime;
  if (opts.dataUrl) {
    const parsed = parseDataUrl(opts.dataUrl);
    buffer = parsed.buffer;
    mime = parsed.mime;
  }
  if (!buffer || !mime) throw new BadRequestError('No image supplied.');
  if (buffer.length > MAX_IMAGE_BYTES) throw new BadRequestError('Image is larger than 5MB.');

  if (mime === 'image/svg+xml') {
    if (!opts.allowSvg) throw new BadRequestError('SVG uploads are not allowed.');
  } else {
    const sniffed = sniffImage(buffer);
    if (!sniffed) throw new BadRequestError('File is not a valid JPG, PNG or WEBP image.');
    mime = sniffed;
  }
  const ext = IMAGE_MIME[mime];
  if (!ext) throw new BadRequestError('Unsupported image type.');

  const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;

  if (cloudinaryConfigured()) {
    try {
      const url: string = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: `schoolflow/${opts.folder}`, public_id: name, resource_type: 'image' },
          (err: any, result: any) => (err || !result ? reject(err || new Error('upload failed')) : resolve(result.secure_url))
        );
        stream.end(buffer);
      });
      return url;
    } catch (err: any) {
      logger.warn(`Cloudinary upload failed, falling back to disk: ${err?.message}`);
    }
  }

  const dir = path.join(UPLOAD_ROOT, opts.folder);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `${name}.${ext}`), buffer);
  return `/uploads/${opts.folder}/${name}.${ext}`;
}

/**
 * Persist a file that multer already wrote to disk (assignment attachments,
 * documents). Returns a public URL and removes the temp file if it was sent
 * to Cloudinary.
 */
export async function persistUploadedFile(
  file: { path: string; originalname: string; filename?: string },
  folder: string
): Promise<{ name: string; url: string }> {
  if (cloudinaryConfigured()) {
    try {
      const res: any = await cloudinary.uploader.upload(file.path, {
        folder: `schoolflow/${folder}`,
        resource_type: 'auto',
      });
      try { fs.unlinkSync(file.path); } catch (_) {}
      return { name: file.originalname, url: res.secure_url };
    } catch (err: any) {
      logger.warn(`Cloudinary file upload failed, keeping on disk: ${err?.message}`);
    }
  }
  const base = file.filename || path.basename(file.path);
  return { name: file.originalname, url: `/uploads/${base}` };
}

/** If the value is a data URL, store it and return the URL; otherwise pass through. */
export async function normalizeImageField(value: any, folder: string): Promise<string | undefined> {
  if (value === undefined || value === null || value === '') return undefined;
  const v = String(value);
  if (isDataUrl(v)) return saveImage({ dataUrl: v, folder });
  return v;
}
