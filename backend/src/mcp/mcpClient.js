import { createHttpError } from '../utils/http-error.js';
import { createAuditLog } from '../modules/audit/audit.service.js';
import { companyTools } from './tools/companyTools.js';
import { configTools } from './tools/configTools.js';
import { conversationTools } from './tools/conversationTools.js';
import { leadTools } from './tools/leadTools.js';
import { orderTools } from './tools/orderTools.js';
import { productTools } from './tools/productTools.js';
import { serviceTools } from './tools/serviceTools.js';

const toolDefinitions = [
  ...productTools,
  ...serviceTools,
  ...leadTools,
  ...orderTools,
  ...conversationTools,
  ...companyTools,
  ...configTools
];

const toolsByName = new Map();

for (const tool of toolDefinitions) {
  const toolName = tool.nombre ?? tool.name;

  if (!toolName || typeof tool.execute !== 'function' || typeof tool.validate !== 'function') {
    throw new Error('Invalid MCP tool definition');
  }

  if (toolsByName.has(toolName)) {
    throw new Error(`Duplicate MCP tool definition: ${toolName}`);
  }

  toolsByName.set(toolName, {
    ...tool,
    nombre: toolName,
    descripcion: tool.descripcion ?? tool.description
  });
}

function getTool(toolName) {
  const tool = toolsByName.get(toolName);

  if (!tool) {
    throw createHttpError(400, `Herramienta MCP no soportada: ${toolName}`);
  }

  return tool;
}

export const mcpClient = {
  listTools() {
    return toolDefinitions.map((tool) => ({
      name: tool.nombre ?? tool.name,
      nombre: tool.nombre ?? tool.name,
      description: tool.descripcion ?? tool.description,
      descripcion: tool.descripcion ?? tool.description,
      inputSchema: tool.inputSchema
    }));
  },

  async callTool(toolName, args = {}, auth = null) {
    const tool = getTool(toolName);

    try {
      tool.validate(args, auth);
      return await tool.execute(args, auth);
    } catch (error) {
      createAuditLog({
        usuarioId: auth?.user?.id,
        empresaId: auth?.user?.empresaId ?? args?.empresa_id,
        accion: 'ERROR',
        modulo: 'mcp',
        descripcion: `Error MCP en ${toolName}: ${error.message}`
      });
      throw error;
    }
  }
};
