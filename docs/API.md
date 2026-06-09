# API

Base local:

```text
http://localhost:4000/api
```

Autenticacion:

```http
Authorization: Bearer TOKEN
```

## Auth

| Metodo | Ruta | Acceso | Descripcion |
| --- | --- | --- | --- |
| POST | `/auth/login` | Publico | Inicia sesion |
| POST | `/auth/logout` | Autenticado | Cierra sesion |
| GET | `/auth/me` | Autenticado | Devuelve el usuario actual |
| GET | `/auth/super-admin` | SUPER_ADMIN | Prueba de rol |
| GET | `/auth/owner` | OWNER | Prueba de rol |

Login:

```json
{
  "email": "admin@demo.com",
  "password": "Admin123!"
}
```

## Empresas

Solo `SUPER_ADMIN`.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/companies` | Lista empresas |
| POST | `/companies` | Crea empresa |
| GET | `/companies/:id` | Obtiene empresa |
| PUT | `/companies/:id` | Actualiza empresa |
| DELETE | `/companies/:id` | Elimina empresa |

Campos:

```json
{
  "nombre": "Empresa Demo",
  "telefono": "5550000000",
  "direccion": "Direccion demo",
  "tipo_negocio": "Retail",
  "plan": "PRO",
  "activo": true
}
```

## Usuarios

`SUPER_ADMIN` y `OWNER` segun reglas del backend.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/users` | Lista usuarios |
| POST | `/users` | Crea usuario |
| GET | `/users/:id` | Obtiene usuario |
| PUT | `/users/:id` | Actualiza usuario |
| DELETE | `/users/:id` | Elimina usuario |

Campos:

```json
{
  "nombre": "Administrador",
  "correo": "admin@demo.com",
  "password": "Admin123!",
  "rol": "OWNER",
  "empresa_id": 1
}
```

## Categorias

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/categories` | Lista categorias |
| POST | `/categories` | Crea categoria |
| GET | `/categories/:id` | Obtiene categoria |
| PUT | `/categories/:id` | Actualiza categoria |
| DELETE | `/categories/:id` | Elimina categoria |

Campos:

```json
{
  "nombre": "Ropa",
  "empresa_id": 1
}
```

## Productos

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/products` | Lista productos |
| POST | `/products` | Crea producto con imagen opcional |
| POST | `/products/import` | Importa productos desde XLSX |
| GET | `/products/:id` | Obtiene producto |
| PUT | `/products/:id` | Actualiza producto |
| DELETE | `/products/:id` | Elimina producto |

Para imagenes usar `multipart/form-data` con el campo `imagen`.

Campos:

```json
{
  "nombre": "Producto demo",
  "descripcion": "Descripcion",
  "precio": 199.99,
  "stock": 10,
  "categoria_id": 1,
  "empresa_id": 1
}
```

Formato Excel para importacion:

```text
nombre | descripcion | precio | stock | categoria
```

## Servicios

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/services` | Lista servicios |
| POST | `/services` | Crea servicio |
| GET | `/services/:id` | Obtiene servicio |
| PUT | `/services/:id` | Actualiza servicio |
| DELETE | `/services/:id` | Elimina servicio |

Campos:

```json
{
  "nombre": "Consulta",
  "descripcion": "Servicio demo",
  "precio": 500,
  "duracion": 60,
  "empresa_id": 1
}
```

## Leads

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/leads` | Lista leads |
| GET | `/leads/stats` | Estadisticas por estado |
| POST | `/leads` | Crea lead |
| GET | `/leads/:id` | Obtiene lead |
| PUT | `/leads/:id` | Actualiza lead |
| DELETE | `/leads/:id` | Elimina lead |

Estados:

- `NUEVO`
- `EN_PROCESO`
- `GANADO`
- `PERDIDO`

## Conversaciones

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/conversations` | Lista conversaciones |
| POST | `/conversations` | Crea conversacion |
| GET | `/conversations/:id` | Obtiene conversacion |
| PUT | `/conversations/:id` | Actualiza conversacion |
| DELETE | `/conversations/:id` | Elimina conversacion |

Campos:

```json
{
  "telefono_cliente": "5550000000",
  "mensaje": "Hola, quiero informacion",
  "respuesta": "Claro, te ayudo.",
  "empresa_id": 1
}
```

## Dashboard

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/dashboard/commercial` | Metricas comerciales |

## WhatsApp

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/whatsapp/sessions` | Lista estados de sesiones |
| POST | `/whatsapp/sessions/:empresaId/start` | Inicia sesion por empresa |
| GET | `/whatsapp/sessions/:empresaId/status` | Estado de sesion |
| GET | `/whatsapp/sessions/:empresaId/qr` | QR de conexion |
| POST | `/whatsapp/sessions/:empresaId/disconnect` | Desconecta sesion |
| POST | `/whatsapp/session/start` | Inicia sesion de la empresa del OWNER |
| GET | `/whatsapp/session/status` | Estado de la empresa del OWNER |
| GET | `/whatsapp/session/qr` | QR de la empresa del OWNER |
| POST | `/whatsapp/session/disconnect` | Desconecta la empresa del OWNER |

## IA

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/ai/status` | Estado de configuracion IA |
| POST | `/ai/test-reply` | Genera respuesta de prueba |

La IA consulta productos y servicios de la empresa correspondiente, detecta
intencion de compra y puede generar leads.

