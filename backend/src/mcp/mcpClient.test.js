import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mcpClient } from './mcpClient.js';

const REQUIRED_TOOLS = [
  'buscar_productos',
  'obtener_producto',
  'buscar_servicios',
  'obtener_servicio',
  'crear_lead',
  'guardar_conversacion',
  'obtener_configuracion_empresa',
  'obtener_categorias',
  'obtener_promociones',
  'registrar_intencion_compra'
];

describe('mcpClient tool registry', () => {
  it('registers all required MCP tools with metadata', () => {
    const tools = mcpClient.listTools();
    const toolNames = tools.map((tool) => tool.nombre);

    REQUIRED_TOOLS.forEach((toolName) => {
      assert.ok(toolNames.includes(toolName));
    });

    tools.forEach((tool) => {
      assert.ok(tool.nombre);
      assert.ok(tool.descripcion);
      assert.ok(tool.inputSchema);
    });
  });

  it('rejects raw SQL arguments before executing a tool', async () => {
    await assert.rejects(
      () => mcpClient.callTool('buscar_productos', { empresa_id: 1, sql: 'SELECT * FROM usuarios' }),
      /Parametro no permitido/
    );
  });
});
