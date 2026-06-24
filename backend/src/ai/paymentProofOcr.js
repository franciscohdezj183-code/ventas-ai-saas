import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

const EXTENSIONS_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff'
};

function tesseractCommand() {
  return process.env.TESSERACT_PATH || process.env.OCR_TESSERACT_PATH || 'tesseract';
}

function imageExtension(mimetype) {
  return EXTENSIONS_BY_MIME[String(mimetype ?? '').toLowerCase()] ?? '.jpg';
}

export async function extractPaymentProofOcrText(media = {}) {
  if (!media?.data || !String(media?.mimetype ?? '').toLowerCase().startsWith('image/')) {
    return {
      available: false,
      text: '',
      reason: 'No se recibio una imagen compatible para OCR'
    };
  }

  const workDir = path.join(tmpdir(), 'ventas-ai-ocr');
  const imagePath = path.join(workDir, `${randomUUID()}${imageExtension(media.mimetype)}`);

  try {
    await mkdir(workDir, { recursive: true });
    await writeFile(imagePath, Buffer.from(media.data, 'base64'));

    const { stdout } = await execFileAsync(tesseractCommand(), [
      imagePath,
      'stdout',
      '-l',
      process.env.OCR_TESSERACT_LANG || 'spa+eng',
      '--psm',
      process.env.OCR_TESSERACT_PSM || '6'
    ], {
      timeout: Number(process.env.OCR_TESSERACT_TIMEOUT_MS ?? 12000),
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });

    return {
      available: true,
      text: String(stdout ?? '').trim(),
      reason: ''
    };
  } catch (error) {
    logger.error('payment_proof_ocr_error', { error });
    return {
      available: false,
      text: '',
      reason: 'No fue posible ejecutar OCR local'
    };
  } finally {
    await rm(imagePath, { force: true }).catch(() => {});
  }
}
