import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { createHttpError } from '../utils/http-error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsUploadDir = path.resolve(__dirname, '../../uploads/products');
const importsUploadDir = path.resolve(__dirname, '../../uploads/imports');
const companiesUploadDir = path.resolve(__dirname, '../../uploads/companies');

fs.mkdirSync(productsUploadDir, { recursive: true });
fs.mkdirSync(importsUploadDir, { recursive: true });
fs.mkdirSync(companiesUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, productsUploadDir);
  },
  filename(req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    cb(null, safeName);
  }
});

function imageFileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    cb(createHttpError(400, 'El archivo debe ser una imagen'));
    return;
  }

  cb(null, true);
}

const uploadProductImageRaw = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024
  }
}).single('imagen');

const companyLogoStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, companiesUploadDir);
  },
  filename(req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  }
});

const uploadCompanyLogoRaw = multer({
  storage: companyLogoStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024
  }
}).single('logo');

function hasImageSignature(buffer) {
  const hex = buffer.toString('hex');
  const ascii = buffer.toString('ascii');

  return (
    hex.startsWith('ffd8ff') ||
    hex.startsWith('89504e470d0a1a0a') ||
    ascii.startsWith('GIF87a') ||
    ascii.startsWith('GIF89a') ||
    ascii.slice(8, 12) === 'WEBP'
  );
}

function hasXlsxSignature(buffer) {
  const hex = buffer.toString('hex');
  return hex.startsWith('504b0304') || hex.startsWith('504b0506') || hex.startsWith('504b0708');
}

async function removeUploadedFile(file) {
  if (!file?.path) {
    return;
  }

  await fsPromises.unlink(file.path).catch(() => {});
}

function validateUploadedFileSignature({ required, validator, message }) {
  return async (req, res, next) => {
    try {
      if (!req.file) {
        if (required) {
          throw createHttpError(400, message);
        }

        next();
        return;
      }

      const fileHandle = await fsPromises.open(req.file.path, 'r');
      const buffer = Buffer.alloc(16);

      try {
        await fileHandle.read(buffer, 0, buffer.length, 0);
      } finally {
        await fileHandle.close();
      }

      if (!validator(buffer)) {
        await removeUploadedFile(req.file);
        req.file = undefined;
        throw createHttpError(400, message);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function uploadProductImage(req, res, next) {
  uploadProductImageRaw(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }

    validateUploadedFileSignature({
      required: false,
      validator: hasImageSignature,
      message: 'El archivo debe ser una imagen valida'
    })(req, res, next);
  });
}

export function uploadCompanyLogo(req, res, next) {
  uploadCompanyLogoRaw(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }

    validateUploadedFileSignature({
      required: false,
      validator: hasImageSignature,
      message: 'El archivo debe ser una imagen valida'
    })(req, res, next);
  });
}

const importStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, importsUploadDir);
  },
  filename(req, file, cb) {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  }
});

function excelFileFilter(req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();
  const validExtensions = new Set(['.xlsx']);

  if (!validExtensions.has(extension)) {
    cb(createHttpError(400, 'El archivo debe estar en formato XLSX'));
    return;
  }

  cb(null, true);
}

const uploadProductsXlsxRaw = multer({
  storage: importStorage,
  fileFilter: excelFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
}).single('archivo');

export function uploadProductsXlsx(req, res, next) {
  uploadProductsXlsxRaw(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }

    validateUploadedFileSignature({
      required: true,
      validator: hasXlsxSignature,
      message: 'El archivo debe ser un XLSX valido'
    })(req, res, next);
  });
}
