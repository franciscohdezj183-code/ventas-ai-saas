import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datasetPath = path.resolve(__dirname, '../../storage/evaluations/ncie-dataset.json');

function average(rows, field) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
  return Number((total / rows.length).toFixed(4));
}

function countBy(rows, predicate) {
  return rows.filter(predicate).length;
}

async function readDataset() {
  try {
    const raw = await fs.readFile(datasetPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function main() {
  const rows = await readDataset();
  const report = {
    total_mensajes_evaluados: rows.length,
    servicios: countBy(rows, (row) => String(row.intent_ncie ?? '').toUpperCase().includes('SERVICE')),
    productos: countBy(rows, (row) => String(row.intent_ncie ?? '').toUpperCase().includes('PRODUCT')),
    desconocidos: countBy(rows, (row) => String(row.intent_ncie ?? '').toUpperCase().includes('UNKNOWN')),
    falsos_no_contamos: countBy(rows, (row) => row.legacy_dijo_no_contamos && row.posible_mejora),
    aclaraciones_generadas: countBy(rows, (row) => row.ncie_hizo_pregunta),
    promedio_confidence: average(rows, 'confidence_ncie'),
    promedio_retrieval_score: average(rows, 'retrieval_score'),
    tiempo_promedio_ncie_ms: average(rows, 'tiempo_ncie_ms')
  };

  logger.info('ncie_real_dataset_evaluated', report);
  console.info(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
