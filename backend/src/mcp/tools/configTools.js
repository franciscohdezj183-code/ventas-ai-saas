import { query } from '../../config/database.js';
import { assertAllowedArgs, normalizeEmpresaId } from './utils.js';
import { createHttpError } from '../../utils/http-error.js';

function validateObtenerConfiguracionEmpresa(args, auth) {
  assertAllowedArgs(args, ['empresa_id']);

  return {
    empresaId: normalizeEmpresaId(args.empresa_id, auth)
  };
}

async function executeObtenerConfiguracionEmpresa(args, auth) {
  const input = validateObtenerConfiguracionEmpresa(args, auth);
  const [rows] = await query(
    `SELECT
       e.id,
       e.nombre,
       COALESCE(ce.telefono_dueno, e.telefono) AS telefono,
       COALESCE(ce.direccion, e.direccion) AS direccion,
       e.tipo_negocio,
       e.plan,
       e.activo,
       ce.nombre_bot,
       ce.tono_respuesta,
       ce.mensaje_bienvenida,
       ce.mensaje_fuera_horario,
       ce.instrucciones_negocio,
       ce.temas_bloqueados,
       ce.faq_personalizada,
       COALESCE(ce.auto_pedidos, 1) AS auto_pedidos,
       COALESCE(ce.envio_imagenes, 1) AS envio_imagenes,
       ce.fallback_message,
       ce.telefono_dueno,
       ce.horario_atencion,
       ce.politica_entrega,
       ce.politica_pagos,
       COALESCE(ce.pago_efectivo_activo, 1) AS pago_efectivo_activo,
       COALESCE(ce.pago_transferencia_activo, 0) AS pago_transferencia_activo,
       ce.transferencia_banco,
       ce.transferencia_titular,
       ce.transferencia_cuenta,
       ce.transferencia_clabe,
       ce.transferencia_tarjeta,
       COALESCE(ce.apartado_activo, 0) AS apartado_activo,
       ce.apartado_porcentaje,
       ce.apartado_instrucciones,
       COALESCE(ce.activo_ia, 1) AS activo_ia,
       COALESCE(ce.activo_whatsapp, 1) AS activo_whatsapp
     FROM empresas e
     LEFT JOIN configuracion_empresas ce ON ce.empresa_id = e.id
     WHERE e.id = ?
     LIMIT 1`,
    [input.empresaId]
  );

  if (!rows[0]) {
    throw createHttpError(404, 'Empresa no encontrada');
  }

  return { empresa: rows[0] };
}

export const configTools = [
  {
    name: 'obtener_configuracion_empresa',
    description: 'Obtiene datos publicos y preferencias de IA/WhatsApp de una empresa.',
    inputSchema: {
      type: 'object',
      properties: {
        empresa_id: { type: 'integer' }
      },
      required: ['empresa_id'],
      additionalProperties: false
    },
    validate: validateObtenerConfiguracionEmpresa,
    execute: executeObtenerConfiguracionEmpresa
  }
];
