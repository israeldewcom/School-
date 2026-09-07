import multer from 'multer';
import { BadRequestError } from '../utils/errors';
import fs from 'fs';
import path from 'path';

// Simple magic number check for images and PDFs
const allowedTypes = {
  'image/jpeg': ['FFD8', 'FFD9'],
  'image/png': ['89504E47'],
  'application/pdf': ['25504446'],
};

const validateFileType = (filePath: string): string | null => {
  const buffer = fs.readFileSync(filePath).slice(0, 4);
  const hex = buffer.toString('hex').toUpperCase();
  for (const [mime, signatures] of Object.entries(allowedTypes)) {
    if (signatures.some(sig => hex.startsWith(sig))) {
      return mime;
    }
  }
  return null;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req: any, file: any, cb: any) => {
  // Accept only images and PDFs based on mimetype
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new BadRequestError('Only images and PDFs are allowed'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('file');

// Middleware to validate actual file content after upload
export const validateFileContent = (req: Request, res: Response, next: NextFunction) => {
  if (req.file) {
    const detectedMime = validateFileType(req.file.path);
    if (!detectedMime || !req.file.mimetype.startsWith(detectedMime.split('/')[0])) {
      // Mismatch or not allowed
      fs.unlinkSync(req.file.path);
      return next(new BadRequestError('Invalid file content or corrupted file'));
    }
    // Update mimetype to detected
    req.file.mimetype = detectedMime;
  }
  next();
};
