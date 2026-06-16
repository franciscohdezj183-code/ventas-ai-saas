# Arquitectura

## Vision general

`ventas-ai-saas` / Nexus IA es una plataforma SaaS multiempresa para ventas
conversacionales por WhatsApp con IA. Cada negocio se representa como una fila
en `empresas`, y los datos operativos se relacionan mediante `empresa_id` o
`tenant_id`.

```text
ventas-ai-saas/
  backend/
    src/
      config/
      ai/
      bot/
      database/
      mcp/
      middlewares/
      modules/
      routes/
      utils/
    storage/
    uploads/
  frontend/
    src/
      components/
      config/
      context/
      features/
      layouts/
      pages/
      routes/
      styles/
  docs/
```

## Backend

El backend usa Express con estructura modular. Cada modulo mantiene sus rutas,
controladores y servicios.

Capas principales:

- `ai`: interpretacion de intenciones con OpenAI. No consulta catalogos ni decide datos de negocio.
- `bot`: orquestacion de mensajes WhatsApp, intenciones, herramientas MCP y respuestas finales.
- `mcp`: herramientas internas para consultar datos reales de MySQL por empresa.
- `config`: variables de entorno y conexion MySQL.
- `middlewares`: autenticacion, roles, errores y uploads.
- `modules`: modulos HTTP de la API.
- `routes`: registro central de rutas Express.
- `utils`: helpers comunes, incluyendo cifrado de campos sensibles.

Modulos HTTP principales:

- `auth`: login, logout, usuario actual y validacion de roles.
- `companies`: empresas, resumen SaaS global e impersonacion; lectura/edicion segun permisos y creacion global para `super_admin`.
- `users`: CRUD de usuarios.
- `categories`: CRUD de categorias por empresa.
- `products`: CRUD de productos, imagenes e importacion Excel.
- `services`: CRUD de servicios.
- `leads`: gestion de prospectos y estadisticas.
- `conversations`: historial de conversaciones.
- `orders`: pedidos por empresa.
- `dashboard`: metricas comerciales.
- `whatsapp`: sesiones por empresa con QR y estado de conexion.
- `ai`: endpoints de estado, prueba de intencion y prueba del orquestador.
- `ai-usage`: registro y consulta de consumo IA.
- `company-settings`: configuracion IA por empresa.
- `plans`: planes SaaS y limites.
- `reports`: reportes por empresa/globales.
- `onboarding`: flujo de creacion de empresa y checklist.

## Frontend

El frontend usa React + Vite. La navegacion principal esta protegida por
`ProtectedRoute` y se renderiza dentro de `AdminLayout`.

Rutas principales:

- `/`: dashboard comercial.
- `/empresas`: administracion de empresas.
- `/usuarios`: administracion de usuarios.
- `/categorias`: categorias de catalogo.
- `/productos`: productos, imagenes e importacion.
- `/servicios`: servicios.
- `/leads`: leads y estadisticas.
- `/pedidos`: pedidos.
- `/conversaciones`: historial.
- `/reportes`: reportes.
- `/whatsapp`: sesiones WhatsApp.
- `/configuracion`: configuracion IA/empresa.
- `/mi-empresa`: panel owner.
- `/super-admin`: panel global Super Admin.
- `/inicio-guiado`: onboarding.
- `/prompts-bot`: plantillas globales del bot.

## Multiempresa

Regla base:

- Toda tabla operativa debe incluir `empresa_id`.
- Los usuarios `owner`, `seller`, `support` y `viewer` consultan solo datos de
  su empresa.
- Los usuarios `super_admin` pueden administrar empresas y ver datos globales.

El backend resuelve el usuario autenticado desde el JWT y usa `empresa_id` para
filtrar las consultas segun el rol. El middleware `attachTenantScope` valida que
un usuario no global no intente acceder a otro tenant.

## Roles y permisos

Roles:

- `super_admin`
- `owner`
- `seller`
- `support`
- `viewer`

Los permisos se definen en:

```text
backend/src/config/permissions.js
frontend/src/config/permissions.js
```

El frontend puede ocultar UI con `Can`, pero la seguridad real vive en backend
con `requireAuth`, `requirePermission`, `requireRole` y `attachTenantScope`.

## Flujo IA + MCP

La IA no recibe catalogos completos ni consulta MySQL. Su unica responsabilidad
es interpretar el mensaje del cliente y devolver JSON valido.

Flujo:

1. Cliente envia mensaje por WhatsApp.
2. Backend identifica `empresa_id` desde la sesion WhatsApp.
3. Backend obtiene contexto minimo de empresa.
4. `intentInterpreter` envia a OpenAI solo mensaje, contexto minimo e intenciones permitidas.
5. OpenAI devuelve JSON estructurado.
6. Backend valida el JSON.
7. `messageOrchestrator` llama la herramienta MCP indicada.
8. MCP consulta MySQL con `empresa_id`.
9. Backend construye la respuesta final usando datos reales.
10. Backend guarda la conversacion.

Archivos principales:

- `backend/src/ai/intentInterpreter.js`
- `backend/src/mcp/mcpClient.js`
- `backend/src/bot/messageOrchestrator.js`

Contrato de intencion:

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

Si el JSON es invalido o la intencion no es confiable, se usa fallback
`MENSAJE_GENERAL`.

Fallback:

```json
{
  "intencion": "MENSAJE_GENERAL",
  "herramienta_mcp": null,
  "parametros": {},
  "confianza": 0.3,
  "requiere_respuesta_ia": true
}
```

Herramientas MCP actuales:

- `buscar_productos`: consulta productos activos por empresa.
- `buscar_servicios`: consulta servicios activos por empresa.
- `obtener_categorias`: lista categorias activas por empresa.
- `obtener_promociones`: placeholder para futuras promociones.
- `obtener_configuracion_empresa`: consulta datos basicos de empresa.
- `crear_lead`: registra un lead con datos reales en MySQL.
- `registrar_intencion_compra`: registra intencion comercial como lead.
- `guardar_conversacion`: guarda mensajes del flujo WhatsApp.
- `crear_pedido`: crea pedidos basicos tenant-scoped.

## Pruebas

El backend usa `node:test` para pruebas unitarias.

```bash
npm test -w backend
```

La prueba principal esta en:

```text
backend/src/ai/intentInterpreter.test.js
```

## Autenticacion

El login valida email y contrasena con bcrypt. Si las credenciales son validas,
se emite un JWT firmado con `JWT_SECRET`.

Roles disponibles:

- `SUPER_ADMIN` / `super_admin`
- `OWNER` / `owner`
- `seller`
- `support`
- `viewer`

Middlewares:

- `authenticate`: valida el token Bearer.
- `authorizeRoles`: restringe rutas por rol.
- `authorizePermissions`: restringe rutas por permiso.
- `requireTenantScope`: evita acceso cruzado entre empresas.

## Archivos locales

- `backend/uploads/products`: imagenes subidas.
- `backend/uploads/imports`: archivos Excel temporales.
- `backend/storage/whatsapp`: sesiones de WhatsApp.

Estas carpetas no deben subirse al repositorio, salvo sus `.gitkeep`.
