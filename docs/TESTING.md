# Pruebas automatizadas

## Suite base

Corre pruebas unitarias sin depender de MySQL:

```bash
cd backend
npm test
```

Incluye:

- `intentInterpreter`
- roles
- seguridad multiempresa helpers
- MCP registry y rechazo de parametros peligrosos
- `messageOrchestrator` con contexto conversacional mockeado

## Integracion con base de datos

Las pruebas de login, seguridad multiempresa real y CRUD de productos/servicios usan datos demo en MySQL.
Estan desactivadas por defecto para no tocar una base local accidentalmente.

Configura una base de pruebas y ejecuta:

```bash
cd backend
npm run test:db
```

La prueba crea empresas y usuarios con slug/email `codex-test-*`, y los limpia al finalizar.

Cobertura de integracion:

- login
- rutas por rol
- OWNER no accede a datos de otra empresa
- CRUD productos
- CRUD servicios
- seller no puede configurar IA
- viewer no puede modificar datos
- pedidos tenant-scoped
- super_admin puede consultar datos globales

## Verificacion manual recomendada

Antes de subir una actualizacion importante:

```bash
npm run build --workspace frontend
npm test --workspace backend
npm run test:db --workspace backend
npm run migrate --workspace backend
```

Checklist manual:

- Login con `super_admin`, `owner`, `seller`, `support`, `viewer`.
- Menu lateral correcto por rol.
- Owner no ve datos de otra empresa.
- Seller no puede entrar a configuracion IA.
- Viewer no puede crear/editar/eliminar.
- Super Admin ve dashboard global y empresas.
- WhatsApp muestra estado sin exponer QR en listados.
- QR solo disponible con `whatsapp.manage`.
- IA devuelve JSON valido o fallback.
- Conversaciones guardan mensajes.
- Pedidos se crean y aparecen filtrados por tenant.
- Reportes usan pedidos reales.

## Recomendacion CI

Usa una base MySQL efimera para `npm run test:db`. No apuntes estas pruebas a produccion.
