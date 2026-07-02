import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import { runConversationEngine } from './conversation-engine.service.js';

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const services = [
  {
    id: 1,
    nombre: 'Impresion de lona',
    descripcion: 'Impresion gran formato en lona',
    precio: 390,
    tipo_precio: 'POR_M2',
    unidad_medida: 'm2',
    requiere_medidas: true,
    categoria: 'Impresion'
  },
  {
    id: 2,
    nombre: 'Playeras DTF',
    descripcion: 'Impresion textil personalizada',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Textil'
  },
  {
    id: 3,
    nombre: 'Diseno web',
    descripcion: 'Paginas web y catalogos',
    precio: 0,
    tipo_precio: 'COTIZACION',
    categoria: 'Diseno'
  }
];

function buildMcpClient() {
  const calls = [];
  return {
    calls,
    async loadFullServiceCatalog() {
      return {
        services,
        categories: [
          { id: 1, nombre: 'Impresion', tipo: 'SERVICIO' },
          { id: 2, nombre: 'Textil', tipo: 'SERVICIO' },
          { id: 3, nombre: 'Diseno', tipo: 'SERVICIO' }
        ]
      };
    },
    async callTool(toolName, args) {
      calls.push({ toolName, args });
      if (toolName === 'obtener_configuracion_empresa') {
        return { empresa: { nombre: 'Demo', tipo_negocio: 'SERVICIOS' } };
      }
      if (toolName === 'obtener_categorias') {
        return { categorias: [{ nombre: 'Impresion' }, { nombre: 'Textil' }, { nombre: 'Diseno' }] };
      }
      if (toolName === 'buscar_servicios') {
        const text = normalize(args.texto);
        const tokens = text.split(/\s+/).filter((token) => token.length > 2);
        return {
          servicios: services.filter((service) => {
            const haystack = normalize(`${service.nombre} ${service.descripcion} ${service.categoria}`);
            return tokens.length === 0 || tokens.some((token) => haystack.includes(token));
          })
        };
      }
      if (toolName === 'buscar_productos') return { productos: [] };
      if (toolName === 'guardar_conversacion') return { conversacion_id: 123 };
      if (toolName === 'crear_lead') return { lead_id: 456 };
      throw new Error(`Unexpected tool: ${toolName}`);
    }
  };
}

function buildContextStore(context = null) {
  const saved = [];
  let current = context;
  return {
    saved,
    async find() {
      return current;
    },
    async save(payload) {
      saved.push(payload);
      current = {
        ultima_intencion: payload.ultimaIntencion,
        ultimo_producto_id: payload.ultimoProductoId,
        ultimo_servicio_id: payload.ultimoServicioId,
        ultimo_texto_busqueda: payload.ultimoTextoBusqueda,
        datos_json: payload.datos
      };
      return payload;
    }
  };
}

async function runShadowCase(message, options = {}) {
  const mcpClient = options.mcpClient ?? buildMcpClient();
  const contextStore = options.contextStore ?? buildContextStore(options.context ?? null);
  const result = await runConversationEngine({
    empresaId: 1,
    phone: '5215550000000',
    message,
    whatsappChatId: '5215550000000@c.us',
    contactName: 'Cliente',
    mcpClient,
    contextStore,
    unifiedShadowRunner: options.unifiedShadowRunner
  });
  return { result, mcpClient, contextStore };
}

describe('Unified Planner Shadow Mode', () => {
  afterEach(() => {
    delete process.env.UNIFIED_PLANNER_SHADOW;
  });

  it('runs unified planner in shadow but returns old response', async () => {
    process.env.UNIFIED_PLANNER_SHADOW = 'true';
    const { result } = await runShadowCase('Quiero una impresion de lona');

    assert.match(normalize(result.respuesta), /impresion de lona|medidas/);
    assert.equal(result.ncie.unifiedShadowComparison.oldEngineResponse, result.respuesta);
    assert.match(normalize(result.ncie.unifiedShadowComparison.unifiedResponse), /impresion de lona|medidas/);
  });

  it('keeps old engine working when unified planner shadow fails', async () => {
    process.env.UNIFIED_PLANNER_SHADOW = 'true';
    const { result } = await runShadowCase('Quiero una impresion de lona', {
      unifiedShadowRunner: async () => {
        throw new Error('shadow boom');
      }
    });

    assert.match(normalize(result.respuesta), /impresion de lona|medidas/);
    assert.equal(result.ncie.unifiedShadowComparison.error, 'shadow boom');
  });

  it('records unified_shadow_comparison fields', async () => {
    process.env.UNIFIED_PLANNER_SHADOW = 'true';
    const { result } = await runShadowCase('Catalogo completo');
    const comparison = result.ncie.unifiedShadowComparison;

    assert.ok(comparison);
    assert.equal(comparison.oldEngineResponse, result.respuesta);
    assert.ok(Object.hasOwn(comparison, 'unifiedResponse'));
    assert.ok(Object.hasOwn(comparison, 'oldSelectedService'));
    assert.ok(Object.hasOwn(comparison, 'unifiedSelectedService'));
    assert.ok(Object.hasOwn(comparison, 'oldNextState'));
    assert.ok(Object.hasOwn(comparison, 'unifiedNextState'));
    assert.ok(Object.hasOwn(comparison, 'oldHandoff'));
    assert.ok(Object.hasOwn(comparison, 'unifiedHandoff'));
    assert.ok(Array.isArray(comparison.mismatchReason));
  });

  it('does not create a second old-engine message side effect', async () => {
    process.env.UNIFIED_PLANNER_SHADOW = 'true';
    const { mcpClient } = await runShadowCase('Quiero una impresion de lona');
    const savedConversations = mcpClient.calls.filter((call) => call.toolName === 'guardar_conversacion');

    assert.equal(savedConversations.length, 1);
  });

  it('does not persist unified stateAfter yet', async () => {
    process.env.UNIFIED_PLANNER_SHADOW = 'true';
    const { result, contextStore } = await runShadowCase('Quiero una impresion de lona');

    assert.equal(contextStore.saved.length, 1);
    assert.notDeepEqual(contextStore.saved[0].datos, result.ncie.unifiedShadowComparison.executorResult.stateToPersist);
    assert.equal(result.ncie.unifiedShadowComparison.executorResult.stateToPersist.schema, 'ConversationState');
  });
});
