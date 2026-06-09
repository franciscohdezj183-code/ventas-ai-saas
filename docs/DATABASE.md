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

## Relacion multiempresa

Las tablas operativas contienen `empresa_id`:

- `usuarios.empresa_id`
- `categorias.empresa_id`
- `productos.empresa_id`
- `servicios.empresa_id`
- `leads.empresa_id`
- `conversaciones.empresa_id`

La tabla raiz es `empresas`.

## Roles

`usuarios.rol` acepta:

- `SUPER_ADMIN`
- `OWNER`

## Importacion en phpMyAdmin

1. Crea una base de datos `ventas_ai_saas`.
2. Abre phpMyAdmin.
3. Selecciona la base de datos.
4. Entra en "Importar".
5. Selecciona `backend/src/database/schema.sql`.
6. Ejecuta la importacion.

## Archivos ALTER

Tambien existen archivos incrementales:

- `alter_empresas_crud.sql`
- `alter_productos_imagen.sql`
- `alter_leads_modulo.sql`
- `alter_conversaciones_historial.sql`

Para una instalacion nueva, usa primero `schema.sql`. Los `ALTER` sirven como
historial de cambios o apoyo en bases existentes.

## Indices

El esquema incluye indices para:

- Busqueda por `empresa_id`.
- Unicidad de slug de empresas.
- Unicidad de email por empresa.
- Relaciones empresa-categoria.
- Estados de entidades.
- Fechas y telefonos en conversaciones.

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
