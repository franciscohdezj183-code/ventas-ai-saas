# Guia de produccion

Esta guia resume los pasos minimos antes de publicar el proyecto.

## Seguridad

- Cambiar `JWT_SECRET` por un secreto largo y aleatorio.
- Usar `API_URL=https://...` en produccion.
- Definir `CORS_ORIGINS` con dominios exactos separados por coma, por ejemplo `https://app.tudominio.com`.
- Ajustar `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` y `AUTH_RATE_LIMIT_MAX` segun trafico real.
- Mantener `JSON_BODY_LIMIT` bajo, por ejemplo `1mb`, salvo que exista una razon operativa.
- No subir `.env`.
- No subir `backend/storage/whatsapp`.
- No subir `.wwebjs_auth` ni `.wwebjs_cache`.
- No subir `backend/uploads`.
- No subir `node_modules`, `dist` ni builds generados.
- No usar usuario MySQL `root`.
- Configurar `NODE_ENV=production`.
- Configurar `FRONTEND_URL` y `CORS_ORIGINS` con dominios reales.
- Ejecutar `npm audit --workspaces`.
- Ejecutar `npm test -w backend`.

## Variables obligatorias

En produccion la API falla al iniciar si faltan o son inseguras:

```env
NODE_ENV=production
PORT=4000
API_URL=https://api.tudominio.com
FRONTEND_URL=https://app.tudominio.com
CORS_ORIGINS=https://app.tudominio.com
JWT_SECRET=un_secreto_largo_de_32_caracteres_o_mas
DB_HOST=...
DB_PORT=3306
DB_USER=ventas_ai
DB_PASSWORD=...
DB_NAME=ventas_ai_saas
```

Opcionales recomendadas:

```env
JSON_BODY_LIMIT=1mb
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=20
WHATSAPP_SESSION_PATH=/var/lib/ventas-ai/whatsapp
WHATSAPP_HEADLESS=true
WHATSAPP_RECONNECT_BASE_DELAY_MS=5000
WHATSAPP_RECONNECT_MAX_DELAY_MS=60000
WHATSAPP_RECONNECT_MAX_ATTEMPTS=8
WHATSAPP_WORKER_MONITOR_INTERVAL_MS=60000
WHATSAPP_WORKER_START_STAGGER_MS=3000
HANDOFF_JOB_ENABLED=true
OPENAI_AUTO_REPLY=false
```

## Autenticacion

El proyecto usa JWT Bearer. Para una version productiva con varias instancias:

- Mover blacklist de logout a Redis.
- Usar access tokens cortos.
- Evaluar refresh tokens rotados.
- El rate limiting ya esta activo en API general y `/api/auth/login`; si escalas a varias instancias, mover contadores a Redis.

## WhatsApp

`whatsapp-web.js` guarda sesiones locales. Para produccion:

- Usar un volumen persistente para `WHATSAPP_SESSION_PATH`.
- No versionar sesiones.
- Confirmar que `.gitignore` cubre `backend/storage/whatsapp`, `.wwebjs_auth` y `.wwebjs_cache`.
- Ejecutar WhatsApp en un worker o servicio separado con `npm run worker:whatsapp -w backend`.
- El worker inicia empresas activas con WhatsApp habilitado y monitorea sesiones cada `WHATSAPP_WORKER_MONITOR_INTERVAL_MS`.
- Las sesiones tienen lock por empresa, backoff exponencial y limpieza de locks locales de Chromium (`SingletonLock`, `SingletonSocket`, `SingletonCookie`).
- El estado de sesiones se persiste en `whatsapp_session_status`, por lo que `/api/health` y el panel pueden ver snapshots aunque WhatsApp viva en el worker.
- Ajustar `WHATSAPP_RECONNECT_BASE_DELAY_MS`, `WHATSAPP_RECONNECT_MAX_DELAY_MS` y `WHATSAPP_RECONNECT_MAX_ATTEMPTS` segun estabilidad del servidor.
- Si el worker es el responsable de WhatsApp, ejecuta la API con `HANDOFF_JOB_ENABLED=false` y deja el worker con `HANDOFF_JOB_ENABLED=true` para evitar jobs duplicados.

## OpenAI

Antes de activar respuestas automaticas:

- Mantener `OPENAI_AUTO_REPLY=false` durante pruebas.
- Verificar que OpenAI solo devuelva JSON de intencion.
- No enviar catalogos completos a OpenAI.
- No permitir que OpenAI defina precios, stock, productos ni datos de negocio.
- Validar siempre el JSON antes de ejecutar herramientas.
- Agregar auditoria de intenciones y herramientas ejecutadas.
- Agregar handoff humano.
- Limitar toda herramienta MCP por `empresa_id`.

## Uploads

Para imagenes y Excel:

- Validar extension, MIME y magic bytes.
- Limitar tamano.
- Considerar antivirus si recibes archivos de clientes.
- Usar storage externo o CDN en produccion.
- No servir archivos sensibles desde el mismo dominio.

## MySQL

- Crear indices adicionales segun consultas reales.
- Agregar paginacion y filtros server-side.
- Activar slow query log.
- Hacer backups periodicos.
- Usar pool de conexiones con limites adecuados.
- Ejecutar migraciones SQL nuevas antes de arrancar la version nueva.
- Ejecutar `npm run migrate -w backend` antes de levantar la API cuando exista una version nueva.

## Observabilidad

- Los logs salen en JSON por stdout/stderr.
- Configura el runtime para capturar stdout y enviarlo a tu plataforma de logs.
- El health check completo vive en `/api/health` e incluye DB, uptime, memoria y sesiones WhatsApp.
- Los errores HTTP pasan por un handler centralizado.
- El apagado ordenado escucha `SIGINT` y `SIGTERM`, cierra sesiones WhatsApp y pool MySQL.

## Frontend

- Construir con `npm run build`.
- Servir `frontend/dist` desde hosting estatico o CDN.
- Configurar `VITE_API_URL` con la URL real de la API.
- Usar HTTPS.

## Despliegue sugerido

Separar servicios:

```text
frontend: hosting estatico/CDN
backend: Node.js process manager o contenedor
mysql: servicio administrado o servidor dedicado
storage: volumen persistente o servicio externo
redis: sesiones, rate limit y jobs
```

## Comandos sugeridos

Backend:

```bash
cd backend
npm ci --omit=dev
npm run migrate
NODE_ENV=production npm start
```

Worker WhatsApp:

```bash
cd backend
NODE_ENV=production npm run worker:whatsapp
```

Frontend:

```bash
cd frontend
npm ci
npm run build
```

Sirve `frontend/dist` desde hosting estatico/CDN. No lo subas al repositorio.

## Checklist antes de publicar

- [ ] `.env` configurado sin secretos por defecto.
- [ ] `CORS_ORIGINS` solo contiene dominios reales.
- [ ] Rate limits revisados.
- [ ] MySQL con usuario limitado.
- [ ] `schema.sql` importado.
- [ ] Usuario `SUPER_ADMIN` creado.
- [ ] `npm run build` exitoso.
- [ ] `npm test -w backend` exitoso.
- [ ] `npm audit --workspaces` revisado.
- [ ] HTTPS activo.
- [ ] Backups configurados.
- [ ] Logs y monitoreo activos.
- [ ] `/api/health` responde `ok`.
- [ ] WhatsApp probado por empresa.
- [ ] IA probada con `OPENAI_AUTO_REPLY=false`.
