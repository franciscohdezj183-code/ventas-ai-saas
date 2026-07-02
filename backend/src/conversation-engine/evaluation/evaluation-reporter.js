import { EVALUATION_STATUS } from './evaluation.types.js';

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

export function buildEvaluationReport(results) {
  const total = results.length;
  const passed = results.filter((result) => result.status === EVALUATION_STATUS.PASSED).length;
  const failed = total - passed;
  const byType = new Map();
  const falseNegatives = results.filter((result) => result.falseNegative);
  const noContamos = results.filter((result) => result.noContamos);

  for (const result of results) {
    const key = result.expectedType;
    const entry = byType.get(key) ?? { total: 0, passed: 0 };
    entry.total += 1;
    if (result.status === EVALUATION_STATUS.PASSED) entry.passed += 1;
    byType.set(key, entry);
  }

  const precisionByType = Object.fromEntries(
    [...byType.entries()].map(([type, entry]) => [type, {
      total: entry.total,
      passed: entry.passed,
      precision: percent(entry.passed / entry.total)
    }])
  );

  const recommendations = [];
  if (falseNegatives.length > 0) recommendations.push('Revisar diccionario semantico para casos sin resultados con problema detectado.');
  if (noContamos.length > 0) recommendations.push('Bloquear respuestas de negacion definitiva en el generador.');
  if (failed > 0) recommendations.push('Agregar casos fallidos al set de regresion antes de activar NCIE globalmente.');
  if (recommendations.length === 0) recommendations.push('Listo para piloto controlado con empresas reales y monitoreo de logs NCIE.');

  return {
    total,
    passed,
    failed,
    accuracy: percent(passed / total),
    precisionByType,
    falseNegatives: falseNegatives.map((result) => result.id),
    noContamos: noContamos.map((result) => result.id),
    recommendations,
    results
  };
}

export function printEvaluationReport(report) {
  console.log('NCIE Offline Evaluation');
  console.log(`Total: ${report.total}`);
  console.log(`Aprobados: ${report.passed}`);
  console.log(`Fallidos: ${report.failed}`);
  console.log(`Precision global: ${report.accuracy}`);
  console.log('Precision por tipo:', JSON.stringify(report.precisionByType, null, 2));
  console.log(`Falsos negativos: ${report.falseNegatives.length ? report.falseNegatives.join(', ') : '0'}`);
  console.log(`Respuestas "no contamos": ${report.noContamos.length ? report.noContamos.join(', ') : '0'}`);
  console.log('Recomendaciones:');
  for (const recommendation of report.recommendations) {
    console.log(`- ${recommendation}`);
  }

  if (report.failed > 0) {
    console.log('Casos fallidos:');
    for (const result of report.results.filter((item) => item.status === EVALUATION_STATUS.FAILED)) {
      console.log(`- ${result.id}: ${result.errors.join('; ')}`);
    }
  }
}
