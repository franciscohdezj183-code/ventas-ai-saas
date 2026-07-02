import { runConversationEngine } from '../conversation-engine.service.js';
import { normalizeForNcie } from '../message-normalizer.js';
import { evaluationCases, evaluationProducts, evaluationServices } from './evaluation-cases.js';
import { buildEvaluationReport, printEvaluationReport } from './evaluation-reporter.js';
import { EVALUATION_STATUS } from './evaluation.types.js';

function buildContextStore(context = null) {
  const saved = [];
  return {
    saved,
    async find() {
      return context;
    },
    async save(payload) {
      saved.push(payload);
      return payload;
    }
  };
}

function matchesCatalog(items, text) {
  const normalized = normalizeForNcie(text);
  const tokens = normalized.split(/\s+/).filter((token) => token.length > 2);
  return items.filter((item) => {
    const haystack = normalizeForNcie(`${item.nombre} ${item.descripcion} ${item.categoria}`);
    return tokens.some((token) => haystack.includes(token));
  });
}

function buildMcpClient() {
  return {
    async callTool(toolName, args) {
      if (toolName === 'obtener_configuracion_empresa') {
        return { empresa: { nombre: 'Empresa Evaluacion', tipo_negocio: 'MIXTO' } };
      }
      if (toolName === 'obtener_categorias') {
        return { categorias: [{ id: 1, nombre: 'Servicios' }, { id: 2, nombre: 'Productos' }] };
      }
      if (toolName === 'buscar_servicios') {
        return { servicios: matchesCatalog(evaluationServices, args.texto) };
      }
      if (toolName === 'buscar_productos') {
        return { productos: matchesCatalog(evaluationProducts, args.texto) };
      }
      if (toolName === 'guardar_conversacion') {
        return { conversacion_id: 1000 };
      }
      if (toolName === 'crear_lead') {
        return { lead_id: 2000, interes: args.interes };
      }
      throw new Error(`Unexpected evaluation tool: ${toolName}`);
    }
  };
}

function validateCase(testCase, result) {
  const errors = [];
  const normalizedResponse = normalizeForNcie(result.respuesta);
  const noContamos = /no contamos|no manejamos|no tenemos ese servicio/.test(normalizedResponse);
  const hasRetrieval = (result.ncie?.retrieval?.services?.length ?? 0) + (result.ncie?.retrieval?.products?.length ?? 0) > 0;
  const falseNegative = Boolean(result.parametros?.problem && !hasRetrieval);

  if (result.intencion !== testCase.expectedIntent) {
    errors.push(`intent esperado ${testCase.expectedIntent}, recibido ${result.intencion}`);
  }
  if (result.tipo !== testCase.expectedType) {
    errors.push(`type esperado ${testCase.expectedType}, recibido ${result.tipo}`);
  }
  if (testCase.expectedEntity && result.parametros?.problem !== testCase.expectedEntity) {
    errors.push(`entidad problem esperada ${testCase.expectedEntity}, recibida ${result.parametros?.problem}`);
  }
  if (noContamos) {
    errors.push('respuesta contiene negacion falsa');
  }
  if (testCase.mustAskIfMissing && !result.respuesta.includes('¿')) {
    errors.push('debia hacer pregunta aclaratoria');
  }
  if (!result.respuesta || result.respuesta.length < 8) {
    errors.push('respuesta final vacia o demasiado corta');
  }

  return {
    status: errors.length === 0 ? EVALUATION_STATUS.PASSED : EVALUATION_STATUS.FAILED,
    errors,
    noContamos,
    falseNegative
  };
}

export async function runEvaluation({ cases = evaluationCases } = {}) {
  const results = [];

  for (const testCase of cases) {
    const contextStore = buildContextStore(testCase.context ?? null);
    const result = await runConversationEngine({
      empresaId: 1,
      phone: '5215550000000',
      message: testCase.message,
      whatsappChatId: '5215550000000@c.us',
      contactName: 'Cliente Evaluacion',
      mcpClient: buildMcpClient(),
      contextStore
    });
    const validation = validateCase(testCase, result);

    results.push({
      id: testCase.id,
      group: testCase.group,
      message: testCase.message,
      expectedIntent: testCase.expectedIntent,
      expectedType: testCase.expectedType,
      actualIntent: result.intencion,
      actualType: result.tipo,
      response: result.respuesta,
      retrievalMode: result.ncie?.retrieval?.retrievalMode,
      topServiceScore: result.ncie?.retrieval?.services?.[0]?.score ?? 0,
      topProductScore: result.ncie?.retrieval?.products?.[0]?.score ?? 0,
      ...validation
    });
  }

  return buildEvaluationReport(results);
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  const report = await runEvaluation();
  printEvaluationReport(report);
  process.exitCode = report.failed > 0 ? 1 : 0;
}
