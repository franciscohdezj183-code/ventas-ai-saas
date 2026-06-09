import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { createHttpError } from '../utils/http-error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productsUploadDir = path.resolve(__dirname, '../../uploads/products');
const importsUploadDir = path.resolve(__dirname, '../../uploads/imports');

fs.mkdirSync(productsUploadDir, { recursive: true });
fs.mkdirSync(importsUploadDir, { recursive: true });

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

export const uploadProductImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024
  }
}).single('imagen');

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

export const uploadProductsXlsx = multer({
  storage: importStorage,
  fileFilter: excelFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
}).single('archivo');
