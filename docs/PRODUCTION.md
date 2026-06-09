# Guia de produccion

Esta guia resume los pasos minimos antes de publicar el proyecto.

## Seguridad

- Cambiar `JWT_SECRET` por un secreto largo y aleatorio.
- No subir `.env`.
- No subir `backend/storage/whatsapp`.
- No subir `backend/uploads`.
- No usar usuario MySQL `root`.
- Configurar `NODE_ENV=production`.
- Configurar `FRONTEND_URL` con el dominio real.
- Ejecutar `npm audit --workspaces`.

## Autenticacion

El proyecto usa JWT Bearer. Para una version productiva con varias instancias:

- Mover blacklist de logout a Redis.
- Usar access tokens cortos.
- Evaluar refresh tokens rotados.
- Agregar rate limiting a `/api/auth/login`.

## WhatsApp

`whatsapp-web.js` guarda sesiones locales. Para produccion:

- Usar un volumen persistente para `WHATSAPP_SESSION_PATH`.
- No versionar sesiones.
- Ejecutar WhatsApp en un worker o servicio separado si hay muchas empresas.
- Agregar backoff de reconexion.
- Monitorear estado de cada sesion.

## OpenAI

Antes de activar respuestas automaticas:

- Mantener `OPENAI_AUTO_REPLY=false` durante pruebas.
- Revisar prompts y respuestas con datos reales.
- Agregar auditoria de respuestas.
- Agregar handoff humano.
- Limitar datos por `empresa_id`.

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

## Checklist antes de publicar

- [ ] `.env` configurado sin secretos por defecto.
- [ ] MySQL con usuario limitado.
- [ ] `schema.sql` importado.
- [ ] Usuario `SUPER_ADMIN` creado.
- [ ] `npm run build` exitoso.
- [ ] `npm audit --workspaces` revisado.
- [ ] HTTPS activo.
- [ ] Backups configurados.
- [ ] Logs y monitoreo activos.
- [ ] WhatsApp probado por empresa.
- [ ] IA probada con `OPENAI_AUTO_REPLY=false`.

