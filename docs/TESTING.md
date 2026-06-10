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

## Recomendacion CI

Usa una base MySQL efimera para `npm run test:db`. No apuntes estas pruebas a produccion.
