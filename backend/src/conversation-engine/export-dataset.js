import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { anonymizeEvaluation } from './dataset-anonymizer.js';
import { listShadowEvaluationsForExport } from './shadow-evaluation.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '../../storage/evaluations/ncie-dataset.json');

async function main() {
  const rows = await listShadowEvaluationsForExport();
  const dataset = rows.map(anonymizeEvaluation);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');

  logger.info('ncie_dataset_exported', {
    total: dataset.length,
    path: outputPath
  });
  console.info(`ncie_dataset_exported total=${dataset.length} path=${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
