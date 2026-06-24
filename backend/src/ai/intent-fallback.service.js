import { FALLBACK_INTENT } from './intent-validation.service.js';

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function buildSafeFallbackIntent({ message, context = {} }) {
  const text = normalize(message);

  if (/^(hola|buenas|buenos dias|buen dia|buenas tardes|buenas noches)$/.test(text)) {
    return { ...FALLBACK_INTENT, intencion: 'SALUDO', confianza: 1 };
  }
  if (/^(ok |perfecto |listo )?(muchas )?gracias/.test(text)) {
    return { ...FALLBACK_INTENT, intencion: 'AGRADECIMIENTO', confianza: 1 };
  }
  if (/^(adios|hasta luego|nos vemos|hasta pronto)/.test(text)) {
    return { ...FALLBACK_INTENT, intencion: 'DESPEDIDA', confianza: 1 };
  }
  if (/\b(asesor|humano|persona|vendedor|ejecutivo)\b/.test(text)) {
    return {
      ...FALLBACK_INTENT,
      intencion: 'HABLAR_ASESOR',
      herramienta_mcp: 'crear_lead',
      parametros: { interes: String(message ?? '').trim() },
      confianza: 1
    };
  }
  if (/^(el |la )?(opcion )?\d{1,2}$/.test(text)) {
    const option = Number(text.match(/\d{1,2}/)?.[0]);
    const shown = context?.ultimos_resultados_mostrados ?? [];
    const selected = shown[option - 1];
    if (selected?.id) {
      const isService = selected.tipo === 'servicio' || context?.producto_o_servicio_seleccionado?.tipo === 'servicio';
      return {
        ...FALLBACK_INTENT,
        intencion: 'CONSULTAR_PRECIO',
        herramienta_mcp: isService ? 'obtener_servicio' : 'obtener_producto',
        parametros: isService ? { servicio_id: selected.id } : { producto_id: selected.id },
        confianza: 0.8
      };
    }
  }

  return { ...FALLBACK_INTENT, parametros: {} };
}
