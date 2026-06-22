# Guia de despliegue en VPS Linux

Esta guia deja el proyecto listo para produccion con Node.js, PM2, Nginx,
MySQL y HTTPS con Certbot.

Los ejemplos usan:

```text
Proyecto: /var/www/ventas-ai-saas
Backend local: http://127.0.0.1:4000
Frontend principal: https://app.example.com
API subdominio: https://api.example.com
API por path: https://example.com/api
```

Reemplaza los dominios y rutas por los reales.

## Requisitos del VPS

```bash
sudo apt update
sudo apt install -y nginx mysql-client certbot python3-certbot-nginx
node --version
npm --version
```

Instala PM2 si no existe:

```bash
sudo npm install -g pm2
```

Para WhatsApp en Linux instala dependencias de Chromium si tu imagen no las trae:

```bash
sudo apt install -y chromium-browser fonts-liberation libatk-bridge2.0-0 libatk1.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libnss3 libxcomposite1 libxdamage1 libxrandr2 xdg-utils
```

En algunas distribuciones el binario se llama `chromium` en vez de
`chromium-browser`.

## Descargar codigo

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
cd /var/www
git clone <REPO_URL> ventas-ai-saas
cd ventas-ai-saas
```

Si ya existe el proyecto:

```bash
cd /var/www/ventas-ai-saas
git pull
```

## Variables de entorno

No subas `.env` al repositorio.

Backend:

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Minimo recomendado para produccion:

```env
NODE_ENV=production
PORT=4000
API_URL=https://api.example.com
FRONTEND_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=ventas_app
DB_PASSWORD=replace_with_real_password
DB_NAME=ventas_ai_saas

JWT_SECRET=replace_with_32_or_more_random_characters
FIELD_ENCRYPTION_KEY=replace_with_32_or_more_random_characters

OPENAI_API_KEY=replace_with_real_openai_key
OPENAI_AUTO_REPLY=false

WHATSAPP_SESSION_PATH=storage/whatsapp
WHATSAPP_HEADLESS=true
WHATSAPP_PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage
WHATSAPP_PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

Si usas API bajo el mismo dominio:

```env
API_URL=https://example.com
FRONTEND_URL=https://example.com
CORS_ORIGINS=https://example.com
```

Frontend:

```bash
cp frontend/.env.example frontend/.env.production
nano frontend/.env.production
```

Para subdominio API:

```env
VITE_API_URL=https://api.example.com/api
```

Para API bajo `/api` del mismo dominio:

```env
VITE_API_URL=https://example.com/api
```

## Instalar dependencias

Desde la raiz del monorepo:

```bash
npm install
```

Tambien puedes usar:

```bash
npm install --workspaces
```

## Base de datos

Crea la base y usuario con permisos limitados:

```bash
mysql -u root -p
```

```sql
CREATE DATABASE ventas_ai_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ventas_app'@'localhost' IDENTIFIED BY 'replace_with_real_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON ventas_ai_saas.* TO 'ventas_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Ejecuta migraciones:

```bash
npm run migrate --workspace backend
```

Prueba la conexion:

```bash
npm run db:check --workspace backend
```

Crea el primer super admin si no existe:

```bash
INITIAL_SUPER_ADMIN_NAME="Super Admin" \
INITIAL_SUPER_ADMIN_EMAIL="admin@example.com" \
INITIAL_SUPER_ADMIN_PASSWORD="Replace_With_Strong_Password_123!" \
INITIAL_SUPER_ADMIN_COMPANY_NAME="Admin Company" \
INITIAL_SUPER_ADMIN_COMPANY_SLUG="admin-company" \
npm run db:seed:super-admin --workspace backend
```

## Backend manual

Para una prueba directa:

```bash
npm run start --workspace backend
```

Equivalente desde `backend/`:

```bash
cd backend
npm run start
```

El backend debe responder:

```bash
curl http://127.0.0.1:4000/api/health
```

## PM2

El ejemplo esta en:

```text
deploy/ecosystem.config.cjs
```

Incluye dos procesos:

- `ventas-ai-api`: API Express.
- `ventas-ai-whatsapp-worker`: worker de WhatsApp con sesiones persistentes.

Inicia PM2 desde la raiz del proyecto:

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 status
pm2 logs
```

Guarda procesos para reinicio automatico:

```bash
pm2 save
pm2 startup
```

PM2 imprimira un comando con `sudo env PATH=... pm2 startup ...`; copialo y
ejecutalo exactamente.

Comandos utiles:

```bash
pm2 logs ventas-ai-api
pm2 logs ventas-ai-whatsapp-worker
pm2 restart ventas-ai-api
pm2 restart ventas-ai-whatsapp-worker
pm2 reload deploy/ecosystem.config.cjs
pm2 stop ventas-ai-api
pm2 delete ventas-ai-api
```

## Reiniciar backend despues de cambios

Despues de desplegar codigo nuevo:

```bash
cd /var/www/ventas-ai-saas
git pull
npm install
npm run migrate --workspace backend
npm run build --workspace frontend
pm2 restart ventas-ai-api
pm2 restart ventas-ai-whatsapp-worker
pm2 save
```

Si solo cambiaste frontend:

```bash
npm run build --workspace frontend
sudo nginx -t
sudo systemctl reload nginx
```

## Frontend

Construye assets estaticos:

```bash
npm run build --workspace frontend
```

Nginx debe servir:

```text
/var/www/ventas-ai-saas/frontend/dist
```

No levantes Vite en produccion.

## Nginx

Hay dos plantillas:

```text
deploy/nginx-main-domain-api-path.conf
deploy/nginx-api-subdomain.conf
```

Estas plantillas son configuraciones finales con HTTPS. Si los certificados aun
no existen, genera primero los certificados con la seccion "HTTPS con Certbot" y
despues copia la plantilla final.

### Opcion A: dominio principal con API en `/api`

Usa `deploy/nginx-main-domain-api-path.conf`.

```bash
sudo certbot certonly --nginx -d example.com -d www.example.com
sudo cp deploy/nginx-main-domain-api-path.conf /etc/nginx/sites-available/ventas-ai-saas
sudo nano /etc/nginx/sites-available/ventas-ai-saas
sudo ln -s /etc/nginx/sites-available/ventas-ai-saas /etc/nginx/sites-enabled/ventas-ai-saas
sudo nginx -t
sudo systemctl reload nginx
```

Configura:

```text
server_name example.com www.example.com;
root /var/www/ventas-ai-saas/frontend/dist;
proxy_pass http://127.0.0.1:4000/api/;
client_max_body_size 10m;
```

### Opcion B: frontend y API en subdominios

Usa `deploy/nginx-api-subdomain.conf`.

```bash
sudo certbot certonly --nginx -d app.example.com -d api.example.com
sudo cp deploy/nginx-api-subdomain.conf /etc/nginx/sites-available/ventas-ai-saas
sudo nano /etc/nginx/sites-available/ventas-ai-saas
sudo ln -s /etc/nginx/sites-available/ventas-ai-saas /etc/nginx/sites-enabled/ventas-ai-saas
sudo nginx -t
sudo systemctl reload nginx
```

Configura:

```text
server_name app.example.com;
server_name api.example.com;
root /var/www/ventas-ai-saas/frontend/dist;
proxy_pass http://127.0.0.1:4000;
client_max_body_size 10m;
```

Las plantillas incluyen soporte WebSocket:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

Aunque hoy el backend no expone WebSocket propio, dejarlo listo evita problemas
si se agrega realtime mas adelante o si una libreria lo requiere.

## HTTPS con Certbot

Antes de Certbot, DNS debe apuntar al VPS.

Dominio principal:

```bash
sudo certbot certonly --nginx -d example.com -d www.example.com
```

Subdominios:

```bash
sudo certbot certonly --nginx -d app.example.com -d api.example.com
```

Despues de copiar la configuracion Nginx final:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Prueba renovacion:

```bash
sudo certbot renew --dry-run
```

## WhatsApp en VPS Linux

El worker se levanta con PM2 y usa `whatsapp-web.js` + Puppeteer en modo
headless. La sesion se guarda en:

```text
backend/storage/whatsapp
```

Esta carpeta debe persistir en disco y no debe borrarse entre reinicios. Esta
ignorada por git.

Variables recomendadas:

```env
WHATSAPP_SESSION_PATH=storage/whatsapp
WHATSAPP_HEADLESS=true
WHATSAPP_PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage
WHATSAPP_PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WHATSAPP_RECONNECT_BASE_DELAY_MS=5000
WHATSAPP_RECONNECT_MAX_DELAY_MS=60000
WHATSAPP_RECONNECT_MAX_ATTEMPTS=8
```

Si el binario no existe:

```bash
which chromium
which chromium-browser
which google-chrome
```

Actualiza `WHATSAPP_PUPPETEER_EXECUTABLE_PATH` con la ruta correcta.

## Logs y monitoreo

```bash
pm2 logs
pm2 logs ventas-ai-api
pm2 logs ventas-ai-whatsapp-worker
pm2 monit
curl https://api.example.com/api/health
```

Si usas API en `/api`:

```bash
curl https://example.com/api/health
```

## Checklist final

- [ ] DNS apunta al VPS.
- [ ] `backend/.env` existe y no usa valores de ejemplo.
- [ ] `frontend/.env.production` apunta a la API real.
- [ ] `npm install` ejecutado en raiz.
- [ ] `npm run migrate --workspace backend` ejecutado.
- [ ] `npm run db:check --workspace backend` OK.
- [ ] `npm run build --workspace frontend` OK.
- [ ] `pm2 start deploy/ecosystem.config.cjs` OK.
- [ ] `pm2 save` ejecutado.
- [ ] `pm2 startup` configurado.
- [ ] Nginx `sudo nginx -t` OK.
- [ ] Certbot instalado y certificados activos.
- [ ] `/api/health` responde.
- [ ] `backend/storage/whatsapp` persiste.
- [ ] QR de WhatsApp probado desde el panel.
- [ ] Logs PM2 revisados sin errores repetitivos.
