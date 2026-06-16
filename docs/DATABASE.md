# Base de datos

Motor recomendado:

```text
MySQL 8.x
```

Archivo principal:

```text
backend/src/database/schema.sql
```

## Tablas

- `empresas`
- `usuarios`
- `categorias`
- `productos`
- `servicios`
- `leads`
- `conversaciones`
- `pedidos`
- `ai_usage_logs`
- `configuracion_empresas`
- `conversacion_contexto`
- `bot_prompt_templates`
- `bot_response_settings`
- `notificaciones`
- `human_handoffs`
- `audit_logs`
- `whatsapp_session_status`
- `schema_migrations`

## Relacion multiempresa

Las tablas operativas contienen `empresa_id`:

- `usuarios.empresa_id`
- `categorias.empresa_id`
- `productos.empresa_id`
- `servicios.empresa_id`
- `leads.empresa_id`
- `conversaciones.empresa_id`
- `pedidos.empresa_id`
- `configuracion_empresas.empresa_id`
- `human_handoffs.empresa_id`
- `notificaciones.empresa_id`

La tabla raiz es `empresas`.

## Roles

`usuarios.rol` acepta:

- `SUPER_ADMIN`
- `OWNER`
- `super_admin`
- `owner`
- `seller`
- `support`
- `viewer`

La aplicacion normaliza alias legacy (`SUPER_ADMIN`, `OWNER`) a roles actuales.

## Importacion en phpMyAdmin

1. Crea una base de datos `ventas_ai_saas`.
2. Abre phpMyAdmin.
3. Selecciona la base de datos.
4. Entra en "Importar".
5. Selecciona `backend/src/database/schema.sql`.
6. Ejecuta la importacion.

## Migraciones

El proyecto incluye migraciones SQL en:

```text
backend/src/database/migrations/
```

Migraciones actuales:

- `202606150001_roles_permissions.sql`
- `202606150002_company_logo.sql`
- `202606150003_saas_plan_billing.sql`
- `202606150004_ai_usage_logs.sql`
- `202606160001_conversation_human_mode.sql`
- `202606160002_ai_company_settings.sql`
- `202606160003_orders.sql`

Para una instalacion nueva puedes importar `schema.sql`. Para bases existentes,
ejecuta:

```bash
npm run migrate --workspace backend
```

## Indices

El esquema incluye indices para:

- Busqueda por `empresa_id`.
- Unicidad de slug de empresas.
- Unicidad de email por empresa.
- Relaciones empresa-categoria.
- Estados de entidades.
- Fechas y telefonos en conversaciones.
- Fechas y estados de pedidos.
- Consumo IA por tenant y fecha.
- Auditoria por usuario, empresa, accion y fecha.

## Recomendaciones

- No usar `root` en produccion.
- Crear un usuario MySQL con permisos limitados sobre la base de datos.
- Activar backups automaticos.
- Revisar consultas con `EXPLAIN` cuando crezca el volumen.
- Agregar paginacion en listados grandes.

## Uso desde MCP

Las consultas de negocio usadas por el bot deben pasar por herramientas MCP en:

```text
backend/src/mcp/mcpClient.js
```

Reglas:

- Toda herramienta debe recibir y validar `empresa_id`.
- Ninguna herramienta debe consultar datos de otra empresa.
- OpenAI no debe ejecutar SQL ni recibir resultados completos para decidir.
- El backend construye respuestas finales usando datos reales devueltos por MCP.

## Tablas clave nuevas

### `pedidos`

Guarda pedidos por empresa con estado, total, cliente y conversacion opcional.
Se usa en `/api/orders`, reportes y herramienta MCP `crear_pedido`.

### `ai_usage_logs`

Registra consumo IA mensual por tenant para validar limites de plan y mostrar
consumo en dashboards.

### `configuracion_empresas`

Guarda configuracion IA por empresa: nombre de IA, bienvenida, tono,
instrucciones, temas bloqueados, FAQ, auto pedidos, envio de imagenes y fallback.

### `human_handoffs`

Controla atencion humana, pausas del bot, expiracion y reactivacion.

### `audit_logs`

Registra acciones importantes: login/logout, usuarios, configuracion,
conversaciones, WhatsApp, pedidos y errores relevantes.
