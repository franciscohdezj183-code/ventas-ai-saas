import OpenAI from 'openai';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { extractPaymentProofOcrText } from './paymentProofOcr.js';

let openaiClient = null;

function getOpenAIClient() {
  if (!env.openai.apiKey) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.openai.apiKey,
      timeout: env.openai.timeoutMs,
      maxRetries: env.openai.maxRetries
    });
  }

  return openaiClient;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s.$:/,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mediaKind(media = {}) {
  const type = String(media.type ?? '').toLowerCase();
  const mime = String(media.mimetype ?? '').toLowerCase();
  const filename = String(media.filename ?? '').toLowerCase();

  if (type === 'image' || mime.startsWith('image/')) {
    return 'image';
  }

  if (mime === 'application/pdf' || filename.endsWith('.pdf')) {
    return 'pdf';
  }

  return 'other';
}

function hasPaymentProofText(media = {}) {
  return paymentSignalsFromText([
    media.filename,
    media.caption,
    media.body,
    media.text
  ].filter(Boolean).join(' ')).length >= 2;
}

function paymentSignalsFromText(value) {
  const text = normalizeText(value);
  const signals = new Set();

  if (/\b(bbva|bancomer|banorte|santander|hsbc|banamex|citibanamex|azteca|banco|mercado\s*pago|spin|nu|klar|stp)\b/.test(text)) {
    signals.add('banco');
  }

  if (/\b(spei|transferencia|deposito|comprobante|recibo|pago|operacion|envio|retiro)\b/.test(text)) {
    signals.add('tipo_pago');
  }

  if (/(?:\$|mxn|m\.n\.|importe|monto|total)\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?|\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?\s*(?:mxn|m\.n\.)\b/.test(text)) {
    signals.add('monto');
  }

  if (/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|lunes|martes|miercoles|jueves|viernes|sabado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/.test(text)) {
    signals.add('fecha');
  }

  if (/\b(folio|referencia|rastreo|clave\s+de\s+rastreo|autorizacion|cep|id\s+de\s+operacion|operacion)\b/.test(text) || /\b[a-z0-9]{8,}\b/i.test(value)) {
    signals.add('folio');
  }

  if (/\b(clabe|cuenta|tarjeta|beneficiario|para|de|titular)\b/.test(text)) {
    signals.add('cuenta');
  }

  return [...signals];
}

function extractAmountFromText(value) {
  const text = normalizeText(value);
  const match = text.match(/(?:\$|mxn|importe|monto|total)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)\s*(?:mxn|m\.n\.)?/i);

  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(/[,\s]/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

function amountLooksClose(detectedAmount, expectedAmount) {
  if (detectedAmount === null || detectedAmount === undefined || detectedAmount === '') {
    return true;
  }

  const detected = Number(detectedAmount);
  const expected = Number(expectedAmount);

  if (!Number.isFinite(detected) || !Number.isFinite(expected) || expected <= 0) {
    return true;
  }

  const differenceRatio = Math.abs(detected - expected) / expected;
  return differenceRatio <= 0.35;
}

function normalizeConfidence(value) {
  const confidence = Number(value ?? 0);

  if (!Number.isFinite(confidence)) {
    return 0;
  }

  if (confidence > 0 && confidence <= 1) {
    return confidence * 100;
  }

  return confidence;
}

function analyzeOcrTextLocally(text, { expectedAmount = null } = {}) {
  const normalized = normalizeText(text);
  const signals = paymentSignalsFromText(text);
  const amount = extractAmountFromText(text);
  const hasEnoughText = normalized.replace(/[^a-z0-9]/g, '').length >= 24;
  const coreSignals = signals.filter((signal) => ['banco', 'monto', 'fecha', 'folio'].includes(signal));
  let confidence = signals.length * 15;

  if (coreSignals.length >= 2) {
    confidence += 25;
  }

  if (!hasEnoughText) {
    confidence -= 35;
  }

  confidence = Math.max(0, Math.min(100, confidence));

  return {
    accepted: hasEnoughText && confidence >= 70 && coreSignals.length >= 2,
    confidence,
    reason: hasEnoughText
      ? `Senales OCR: ${signals.join(', ') || 'sin senales bancarias claras'}`
      : 'El OCR no extrajo texto suficiente del comprobante',
    detected: {
      amount,
      signals,
      text: normalized
    }
  };
}

function normalizeAiAnalysis(parsed) {
  if (!parsed) {
    return null;
  }

  const evidence = Array.isArray(parsed.evidencia)
    ? parsed.evidencia
    : Array.isArray(parsed.evidence)
      ? parsed.evidence
      : [];

  return {
    accepted: parsed.parece_comprobante === true && normalizeConfidence(parsed.confianza) >= 70,
    confidence: normalizeConfidence(parsed.confianza),
    reason: String(parsed.motivo ?? '').trim(),
    detected: {
      bank: parsed.banco ?? null,
      amount: parsed.monto ?? null,
      date: parsed.fecha ?? null,
      folio: parsed.folio ?? null,
      paymentType: parsed.tipo_pago ?? null,
      evidence
    }
  };
}

async function analyzeImageWithVision(media, { expectedAmount = null, client }) {
  if (!client || !media?.data || !media?.mimetype) {
    return null;
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.openai.model,
      temperature: 0,
      max_tokens: 320,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Eres un validador visual de comprobantes de pago mexicanos recibidos por WhatsApp.',
            'Debes distinguir comprobantes reales o capturas bancarias de fotos comunes, imagenes de personas, productos, memes, conversaciones y capturas sin datos financieros.',
            'No confirmes que el dinero se reflejo; solo decide si la imagen parece un comprobante para que el dueno lo revise.',
            'Devuelve solo JSON valido.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `Monto esperado aproximado: ${expectedAmount ?? 'desconocido'}.`,
                'Responde con {"parece_comprobante": boolean, "confianza": number, "banco": string|null, "tipo_pago": string|null, "monto": number|null, "fecha": string|null, "folio": string|null, "evidencia": string[], "motivo": string}.',
                'Acepta si visualmente es una captura o documento de pago, transferencia, SPEI, deposito, recibo bancario o wallet como Mercado Pago, y se observan al menos dos datos financieros claros entre banco/wallet, monto, fecha/hora, folio/referencia/rastreo, origen/destino/cuenta/beneficiario.',
                'Rechaza imagenes de personas, productos, fondos, capturas de chat, comprobantes demasiado recortados, borrosos o sin datos financieros suficientes.',
                'No rechaces ni bajes confianza solo porque el monto sea distinto al esperado; el dueno revisara la cantidad.'
              ].join('\n')
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${media.mimetype};base64,${media.data}`
              }
            }
          ]
        }
      ]
    });

    return normalizeAiAnalysis(parseJsonObject(completion.choices[0]?.message?.content ?? '{}'));
  } catch (error) {
    logger.error('payment_proof_image_classifier_error', { error });
    return null;
  }
}

async function analyzeOcrTextWithAi(text, { expectedAmount = null, client }) {
  if (!client) {
    return null;
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.openai.model,
      temperature: 0,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Eres un validador de texto OCR de comprobantes bancarios mexicanos.',
            'Analiza solo el texto extraido y determina si parece un comprobante bancario real.',
            'No confirmes que el pago se reflejo. Devuelve solo JSON valido.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Monto esperado aproximado: ${expectedAmount ?? 'desconocido'}`,
            'Responde con {"parece_comprobante": boolean, "confianza": number, "banco": string|null, "monto": number|null, "fecha": string|null, "folio": string|null, "motivo": string}.',
            'Criterios: debe contener senales bancarias como banco, transferencia, SPEI, deposito, referencia, folio, rastreo, fecha, hora, cuenta, beneficiario o monto. No aceptes fotos random, muebles, capturas sin datos bancarios, conversaciones, tickets no bancarios o imagenes sin informacion financiera clara. Si no detectas monto, fecha o folio/referencia, baja la confianza. No rechaces ni bajes confianza solo porque el monto sea distinto al esperado; el dueno revisara la cantidad. Si el texto es confuso o insuficiente, responde false.',
            `Texto OCR:\n${text}`
          ].join('\n\n')
        }
      ]
    });

    return normalizeAiAnalysis(parseJsonObject(completion.choices[0]?.message?.content ?? '{}'));
  } catch (error) {
    logger.error('payment_proof_ocr_ai_classifier_error', { error });
    return null;
  }
}

async function extractOcrTextWithVision(media, { client }) {
  if (!client || !media?.data || !media?.mimetype) {
    return {
      available: false,
      text: '',
      reason: 'No hay cliente de IA o imagen compatible para OCR'
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model: env.openai.model,
      temperature: 0,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'Eres un OCR para imagenes recibidas por WhatsApp.',
            'Tu unica tarea es transcribir texto visible de la imagen.',
            'No clasifiques, no interpretes si es comprobante y no inventes texto que no se vea.',
            'Si la imagen no tiene texto legible, devuelve texto_visto como string vacio.',
            'Devuelve solo JSON valido.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extrae el texto visible de esta imagen. Responde con {"texto_visto": "texto exacto visible o vacio", "calidad": "alta|media|baja", "motivo": "breve"}'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${media.mimetype};base64,${media.data}`
              }
            }
          ]
        }
      ]
    });

    const parsed = parseJsonObject(completion.choices[0]?.message?.content ?? '{}');
    const text = String(parsed?.texto_visto ?? '').trim();

    return {
      available: true,
      text,
      reason: String(parsed?.motivo ?? '').trim()
    };
  } catch (error) {
    logger.error('payment_proof_image_ocr_error', { error });
    return {
      available: false,
      text: '',
      reason: 'No fue posible extraer texto de la imagen con IA'
    };
  }
}

function finalAcceptanceFromAnalysis(analysis) {
  if (!analysis) {
    return false;
  }

  const evidence = [
    ...(Array.isArray(analysis.detected?.evidence) ? analysis.detected.evidence : []),
    ...(Array.isArray(analysis.detected?.signals) ? analysis.detected.signals : []),
    analysis.detected?.bank ? 'banco' : null,
    analysis.detected?.amount !== null && analysis.detected?.amount !== undefined ? 'monto' : null,
    analysis.detected?.date ? 'fecha' : null,
    analysis.detected?.folio ? 'folio' : null
  ].filter(Boolean);
  const coreSignals = [...new Set(evidence.map((item) => {
    const normalized = normalizeText(item);

    if (normalized.includes('banco') || normalized.includes('bbva') || normalized.includes('mercado pago')) return 'banco';
    if (normalized.includes('monto') || normalized.includes('importe') || normalized.includes('total') || /(?:\$|mxn|m\.n\.)/.test(normalized)) return 'monto';
    if (normalized.includes('fecha')) return 'fecha';
    if (normalized.includes('folio') || normalized.includes('referencia') || normalized.includes('rastreo')) return 'folio';
    if (normalized.includes('clabe') || normalized.includes('cuenta') || normalized.includes('tarjeta') || normalized.includes('beneficiario') || normalized.includes('origen') || normalized.includes('destino')) return 'cuenta';
    if (normalized.includes('spei') || normalized.includes('transferencia') || normalized.includes('deposito') || normalized.includes('comprobante') || normalized.includes('recibo')) return 'tipo_pago';
    return normalized;
  }))].filter((signal) => ['banco', 'monto', 'fecha', 'folio', 'cuenta', 'tipo_pago'].includes(signal));
  return analysis.accepted === true
    && Number(analysis.confidence) >= 70
    && coreSignals.length >= 2;
}

async function classifyImagePaymentProof(media, { expectedAmount = null, client, ocrReader }) {
  const imageAnalysis = await analyzeImageWithVision(media, { expectedAmount, client });
  logger.info('payment_proof_image_analysis_result', {
    available: Boolean(imageAnalysis),
    accepted: imageAnalysis?.accepted ?? null,
    confidence: imageAnalysis?.confidence ?? null,
    reason: imageAnalysis?.reason ?? null,
    detected: imageAnalysis
      ? {
          bank: imageAnalysis.detected?.bank ?? null,
          amount: imageAnalysis.detected?.amount ?? null,
          date: imageAnalysis.detected?.date ?? null,
          folio: imageAnalysis.detected?.folio ?? null,
          paymentType: imageAnalysis.detected?.paymentType ?? null,
          evidenceCount: Array.isArray(imageAnalysis.detected?.evidence) ? imageAnalysis.detected.evidence.length : 0
        }
      : null
  });
  const localOcrResult = await ocrReader(media);
  let ocrResult = localOcrResult;

  if (
    !ocrResult.available
    || !ocrResult.text
    || normalizeText(ocrResult.text).replace(/[^a-z0-9]/g, '').length < 24
  ) {
    const aiOcrResult = await extractOcrTextWithVision(media, { client });

    if (aiOcrResult.available && aiOcrResult.text) {
      ocrResult = aiOcrResult;
    }
  }

  if (!ocrResult.text || normalizeText(ocrResult.text).replace(/[^a-z0-9]/g, '').length < 24) {
    const imageAccepted = finalAcceptanceFromAnalysis(imageAnalysis);

    if (imageAccepted) {
      return {
        accepted: true,
        confidence: Number(imageAnalysis.confidence ?? 0),
        reason: imageAnalysis.reason || 'La imagen parece un comprobante de pago con datos financieros visibles',
        detected: {
          ...(imageAnalysis.detected ?? {}),
          signals: paymentSignalsFromText([
            imageAnalysis.detected?.bank,
            imageAnalysis.detected?.paymentType,
            imageAnalysis.detected?.date,
            imageAnalysis.detected?.folio,
            ...(Array.isArray(imageAnalysis.detected?.evidence) ? imageAnalysis.detected.evidence : [])
          ].filter(Boolean).join(' ')),
          ocrText: ocrResult.text ?? '',
          ocrAvailable: Boolean(ocrResult.available),
          ocrReason: ocrResult.reason || localOcrResult.reason || null
        }
      };
    }

    return {
      accepted: false,
      confidence: Number(imageAnalysis?.confidence ?? 0),
      reason: imageAnalysis?.reason || 'No pude leer texto suficiente. Envia una captura mas clara del comprobante, completa y sin recortes.',
      detected: {
        ...(imageAnalysis?.detected ?? {}),
        text: ocrResult.text ?? '',
        ocrAvailable: Boolean(ocrResult.available),
        ocrReason: ocrResult.reason || localOcrResult.reason || null
      }
    };
  }

  const localAnalysis = analyzeOcrTextLocally(ocrResult.text, { expectedAmount });
  const aiAnalysis = await analyzeOcrTextWithAi(ocrResult.text, { expectedAmount, client });
  const analyses = [imageAnalysis, aiAnalysis, localAnalysis].filter(Boolean);
  const acceptedAiAnalyses = [imageAnalysis, aiAnalysis]
    .filter((candidate) => finalAcceptanceFromAnalysis(candidate))
    .sort((left, right) => Number(right.confidence ?? 0) - Number(left.confidence ?? 0));
  const analysis = acceptedAiAnalyses[0]
    ?? (finalAcceptanceFromAnalysis(localAnalysis) ? localAnalysis : null)
    ?? analyses.sort((left, right) => Number(right.confidence ?? 0) - Number(left.confidence ?? 0))[0];
  const coreSignals = paymentSignalsFromText(ocrResult.text).filter((signal) => ['banco', 'monto', 'fecha', 'folio'].includes(signal));
  const accepted = finalAcceptanceFromAnalysis(analysis)
    || (
      analysis.accepted
      && Number(analysis.confidence) >= 70
      && coreSignals.length >= 2
    );

  return {
    accepted,
    confidence: Number(analysis.confidence ?? 0),
    reason: accepted
      ? analysis.reason || 'OCR compatible con comprobante bancario'
      : analysis.reason || 'El OCR no contiene suficientes datos bancarios',
    detected: {
      ...(analysis.detected ?? {}),
      amount: analysis.detected?.amount ?? localAnalysis.detected?.amount ?? null,
      signals: paymentSignalsFromText(ocrResult.text),
      ocrText: ocrResult.text
    }
  };
}

export async function classifyPaymentProof(
  media = {},
  {
    client = getOpenAIClient(),
    ocrReader = extractPaymentProofOcrText,
    expectedAmount = null
  } = {}
) {
  if (!media?.hasMedia) {
    return {
      accepted: false,
      confidence: 0,
      reason: 'No se recibio un archivo',
      detected: null
    };
  }

  const kind = mediaKind(media);

  if (kind === 'image') {
    return classifyImagePaymentProof(media, { expectedAmount, client, ocrReader });
  }

  if (kind === 'pdf') {
    const accepted = hasPaymentProofText(media);

    return {
      accepted,
      confidence: accepted ? 72 : 20,
      reason: accepted
        ? 'PDF compatible con comprobante por nombre o descripcion'
        : 'El PDF no tiene datos suficientes para identificarlo como comprobante',
      detected: null
    };
  }

  return {
    accepted: false,
    confidence: 0,
    reason: 'El archivo no es imagen ni PDF',
    detected: null
  };
}
