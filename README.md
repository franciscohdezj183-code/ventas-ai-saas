# Nexus IA / ventas-ai-saas

Plataforma SaaS multiempresa para ventas conversacionales por WhatsApp con IA.
Incluye API con Node.js, Express y MySQL, mas un panel administrativo con React
y Vite.

## Estado del proyecto

El proyecto contiene una base funcional avanzada para:

- Autenticacion JWT con roles `super_admin`, `owner`, `seller`, `support` y `viewer`.
- Gestion multiempresa con aislamiento por `empresa_id` / `tenant_id`.
- Matriz reutilizable de permisos backend/frontend.
- CRUD de empresas, usuarios, categorias, productos, servicios, leads, conversaciones y pedidos.
- Carga de imagenes para productos.
- Importacion masiva de productos desde Excel.
- Dashboard comercial distinto por rol.
- Panel Super Admin.
- Panel Owner.
- Onboarding para nuevas empresas.
- Planes SaaS y limites de uso.
- Consumo IA mensual por tenant.
- Reportes por empresa y globales.
- Configuracion IA por empresa.
- Modo atencion humana en conversaciones.
- Integracion WhatsApp con `whatsapp-web.js`.
- Integracion OpenAI como interprete de intenciones JSON.
- Orquestador tipo MCP para consultar datos reales antes de responder.
- Seguridad SaaS: tenant scope, permisos backend, sanitizacion, rate limiting,
  auditoria y cifrado de campos sensibles de WhatsApp.
- Pruebas unitarias e integracion con base de datos.

## Stack

- Backend: Node.js, Express, mysql2, JWT, bcrypt, multer, whatsapp-web.js, OpenAI.
- Base de datos: MySQL compatible con phpMyAdmin.
- Frontend: React, Vite, React Router, Axios, lucide-react.
- Monorepo: npm workspaces.

## Requisitos

- Node.js 18 o superior.
- npm 9 o superior.
- MySQL 8 o MariaDB compatible.
- phpMyAdmin opcional para importar `schema.sql`.

## Instalacion rapida

```bash
npm install
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

En Linux/macOS:

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Configura las credenciales de MySQL en `backend/.env`.

## Base de datos

1. Crea una base de datos llamada `ventas_ai_saas`.
2. Importa el archivo:

```text
backend/src/database/schema.sql
```

Puedes importarlo desde phpMyAdmin o ejecutarlo por consola:

```bash
mysql -u root -p ventas_ai_saas < backend/src/database/schema.sql
```

## Variables de entorno

Backend: `backend/.env`

```env
NODE_ENV=development
PORT=4000
API_URL=http://localhost:4000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ventas_ai_saas

FRONTEND_URL=http://localhost:5173

JWT_SECRET=change_this_secret_in_production
JWT_EXPIRES_IN=1d

WHATSAPP_SESSION_PATH=storage/whatsapp
WHATSAPP_HEADLESS=true

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_AUTO_REPLY=false
```

Frontend: `frontend/.env`

```env
VITE_API_URL=http://localhost:4000/api
```

## Scripts

```bash
npm run dev
npm run dev:backend
npm run dev:frontend
npm run build
npm test -w backend
npm run test:db -w backend
npm run migrate -w backend
npm start
```

- `npm run dev`: levanta backend y frontend en paralelo.
- `npm run dev:backend`: levanta solo la API.
- `npm run dev:frontend`: levanta solo React/Vite.
- `npm run build`: genera el build del frontend.
- `npm test -w backend`: ejecuta pruebas del backend.
- `npm run test:db -w backend`: ejecuta pruebas de integracion con MySQL.
- `npm run migrate -w backend`: aplica migraciones SQL pendientes.
- `npm start`: ejecuta el backend con Node.

## URLs locales

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- API: `http://localhost:4000/api`
- Health check: `http://localhost:4000/api/health`

## Acceso inicial

El sistema requiere un usuario en MySQL para iniciar sesion. Crea primero una
empresa y un usuario `SUPER_ADMIN` o `OWNER`.

Genera un hash bcrypt para la contrasena:

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Admin123!', 10).then(console.log);"
```

Luego inserta una empresa y usuario desde phpMyAdmin o MySQL. Sustituye
`HASH_GENERADO` por el valor anterior:

```sql
INSERT INTO empresas (nombre, slug, telefono, direccion, tipo_negocio, plan, activo, estado)
VALUES ('Empresa Demo', 'empresa-demo', '5550000000', 'Direccion demo', 'Retail', 'PRO', 1, 'ACTIVA');

INSERT INTO usuarios (empresa_id, nombre, email, password_hash, rol, estado)
VALUES (1, 'Administrador', 'admin@demo.com', 'HASH_GENERADO', 'SUPER_ADMIN', 'ACTIVO');
```

## Rutas del frontend

- `/login`
- `/`
- `/empresas`
- `/usuarios`
- `/categorias`
- `/productos`
- `/servicios`
- `/leads`
- `/pedidos`
- `/conversaciones`
- `/reportes`
- `/whatsapp`
- `/configuracion`
- `/mi-empresa`
- `/super-admin`
- `/inicio-guiado`
- `/prompts-bot`

## Documentacion adicional

- [Arquitectura](docs/ARCHITECTURE.md)
- [API](docs/API.md)
- [Base de datos](docs/DATABASE.md)
- [Guia de produccion](docs/PRODUCTION.md)
- [Pruebas](docs/TESTING.md)
- [Actualizacion 2026-06-16](docs/UPDATE_2026-06-16.md)

## Flujo IA + MCP

OpenAI no recibe catalogos completos ni consulta MySQL. La IA solo interpreta el
mensaje del cliente y devuelve JSON. El backend valida ese JSON, ejecuta la
herramienta MCP correspondiente, consulta datos reales y construye la respuesta
final para WhatsApp.

Archivos principales del flujo:

- `backend/src/ai/intentInterpreter.js`
- `backend/src/mcp/mcpClient.js`
- `backend/src/bot/messageOrchestrator.js`
- `backend/src/ai/intentInterpreter.test.js`

Contrato de salida de la IA:

```json
{
  "intencion": "BUSCAR_PRODUCTO",
  "herramienta_mcp": "buscar_productos",
  "parametros": {
    "texto": "sala gris",
    "categoria": "salas",
    "precio_min": null,
    "precio_max": 8000,
    "stock_requerido": true
  },
  "confianza": 0.92,
  "requiere_respuesta_ia": false
}
```

Fallback obligatorio cuando la IA no entiende o devuelve JSON invalido:

```json
{
  "intencion": "MENSAJE_GENERAL",
  "herramienta_mcp": null,
  "parametros": {},
  "confianza": 0.3,
  "requiere_respuesta_ia": true
}
```

Herramientas MCP disponibles:

- `buscar_productos`
- `obtener_producto`
- `buscar_servicios`
- `obtener_servicio`
- `obtener_categorias`
- `obtener_promociones`
- `obtener_configuracion_empresa`
- `crear_lead`
- `registrar_intencion_compra`
- `guardar_conversacion`
- `crear_pedido`

## Pruebas

```bash
npm test -w backend
```

Las pruebas actuales validan que el interprete:

- Devuelva intenciones validas para mensajes reales.
- Asigne la herramienta MCP correcta.
- Use fallback ante JSON invalido.
- Rechace herramientas que no corresponden a la intencion.

## Seguridad antes de subir a produccion

- Cambiar `JWT_SECRET`.
- Configurar `FIELD_ENCRYPTION_KEY`.
- No usar usuario MySQL `root`.
- Mantener `.env`, sesiones WhatsApp y uploads fuera del repositorio.
- Revisar vulnerabilidades con `npm audit`.
- Desactivar `OPENAI_AUTO_REPLY` hasta validar respuestas.
- Usar almacenamiento persistente para revocacion de tokens si hay multiples instancias.
