# Arquitectura

## Vision general

`ventas-ai-saas` es una plataforma SaaS multiempresa. Cada negocio se representa
como una fila en `empresas`, y los datos operativos se relacionan mediante
`empresa_id`.

```text
ventas-ai-saas/
  backend/
    src/
      config/
      database/
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

Modulos principales:

- `auth`: login, logout, usuario actual y validacion de roles.
- `companies`: CRUD de empresas, solo `SUPER_ADMIN`.
- `users`: CRUD de usuarios.
- `categories`: CRUD de categorias por empresa.
- `products`: CRUD de productos, imagenes e importacion Excel.
- `services`: CRUD de servicios.
- `leads`: gestion de prospectos y estadisticas.
- `conversations`: historial de conversaciones.
- `dashboard`: metricas comerciales.
- `whatsapp`: sesiones por empresa con QR y estado de conexion.
- `ai`: respuesta automatica multiempresa usando datos de cada empresa.

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
- `/conversaciones`: historial.
- `/whatsapp`: sesiones WhatsApp.
- `/configuracion`: modulo reservado.

## Multiempresa

Regla base:

- Toda tabla operativa debe incluir `empresa_id`.
- Los usuarios `OWNER` deben consultar solo datos de su empresa.
- Los usuarios `SUPER_ADMIN` pueden administrar empresas y ver datos globales.

El backend resuelve el usuario autenticado desde el JWT y usa `empresa_id` para
filtrar las consultas segun el rol.

## Autenticacion

El login valida email y contrasena con bcrypt. Si las credenciales son validas,
se emite un JWT firmado con `JWT_SECRET`.

Roles disponibles:

- `SUPER_ADMIN`
- `OWNER`

Middlewares:

- `authenticate`: valida el token Bearer.
- `authorizeRoles`: restringe rutas por rol.

## Archivos locales

- `backend/uploads/products`: imagenes subidas.
- `backend/uploads/imports`: archivos Excel temporales.
- `backend/storage/whatsapp`: sesiones de WhatsApp.

Estas carpetas no deben subirse al repositorio, salvo sus `.gitkeep`.

