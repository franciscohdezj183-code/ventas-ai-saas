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

Acceso segun permisos `tenants.view` y `tenants.manage`.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/companies` | Lista empresas |
| POST | `/companies` | Crea empresa |
| GET | `/companies/:id` | Obtiene empresa |
| PUT | `/companies/:id` | Actualiza empresa |
| DELETE | `/companies/:id` | Elimina empresa |
| GET | `/companies/saas/global` | Resumen global SaaS para Super Admin |
| POST | `/companies/:id/impersonate` | Impersona owner de empresa |

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
| GET | `/conversations/inbox/threads` | Lista hilos de inbox |
| GET | `/conversations/inbox/threads/:empresaId/:telefono` | Obtiene hilo |
| POST | `/conversations/inbox/threads/:empresaId/:telefono/pause` | Pausa bot y requiere humano |
| POST | `/conversations/inbox/threads/:empresaId/:telefono/resume` | Reactiva bot |
| POST | `/conversations/inbox/threads/:empresaId/:telefono/reply` | Respuesta manual |
| POST | `/conversations/inbox/threads/:empresaId/:telefono/close` | Cierra hilo |

Campos:

```json
{
  "telefono_cliente": "5550000000",
  "mensaje": "Hola, quiero informacion",
  "respuesta": "Claro, te ayudo.",
  "empresa_id": 1
}
```

## Pedidos

Protegido por `orders.view` y `orders.manage`.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/orders` | Lista pedidos filtrados por tenant |
| POST | `/orders` | Crea pedido |
| GET | `/orders/:id` | Obtiene pedido |
| PUT | `/orders/:id` | Actualiza pedido |
| DELETE | `/orders/:id` | Elimina pedido |

Campos:

```json
{
  "cliente_nombre": "Cliente Demo",
  "telefono_cliente": "5550000000",
  "conversation_id": 1,
  "estado": "NUEVO",
  "total": 450,
  "notas": "Pedido capturado desde WhatsApp",
  "empresa_id": 1
}
```

Estados:

- `NUEVO`
- `CONFIRMADO`
- `EN_PROCESO`
- `ENTREGADO`
- `CANCELADO`

## Dashboard

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/dashboard/commercial` | Metricas comerciales |

## Reportes

Protegido por `reports.view`.

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/reports/overview` | Reportes por empresa o globales |

Filtros:

```text
fecha_inicio=2026-05-18
fecha_fin=2026-06-16
empresa_id=1
```

`empresa_id` solo aplica para `super_admin`.

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
| GET | `/ai/usage/monthly` | Consumo IA mensual |
| POST | `/ai/test-intent` | Interpreta intencion y devuelve JSON validado |
| POST | `/ai/test-reply` | Ejecuta el orquestador completo y genera respuesta final |

## Configuracion IA por empresa

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/configuracion-empresa` | Lista configuraciones accesibles |
| PUT | `/configuracion-empresa` | Guarda configuracion del owner |
| GET | `/configuracion-empresa/:empresaId` | Obtiene configuracion |
| PUT | `/configuracion-empresa/:empresaId` | Guarda configuracion |
| DELETE | `/configuracion-empresa/:empresaId` | Elimina configuracion |

Solo `owner` puede modificar configuracion IA. `seller`, `support` y `viewer`
no pueden modificarla.

## Planes

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/plans` | Lista planes disponibles |
| GET | `/plans/current` | Plan de la empresa autenticada |

## Onboarding

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/onboarding/status` | Checklist de configuracion por empresa |
| POST | `/onboarding/companies` | Crea empresa, owner, plan, IA y productos iniciales |

`POST /onboarding/companies` requiere `super_admin`.

La IA no consulta productos, servicios ni MySQL. Solo interpreta el mensaje y
devuelve JSON. Las consultas de negocio se hacen mediante herramientas MCP.

Ejemplo de `/ai/test-intent`:

```json
{
  "empresa_id": 1,
  "mensaje": "Busco un comedor para 6 personas barato",
  "contexto": {
    "nombre": "Empresa Demo",
    "tipo_negocio": "Muebleria"
  }
}
```

Respuesta esperada:

```json
{
  "data": {
    "intencion": "BUSCAR_PRODUCTO",
    "herramienta_mcp": "buscar_productos",
    "parametros": {
      "texto": "comedor 6 personas barato",
      "categoria": "comedor"
    },
    "confianza": 0.9,
    "requiere_respuesta_ia": false
  }
}
```

Fallback esperado si OpenAI devuelve JSON invalido o una herramienta incorrecta:

```json
{
  "data": {
    "intencion": "MENSAJE_GENERAL",
    "herramienta_mcp": null,
    "parametros": {},
    "confianza": 0.3,
    "requiere_respuesta_ia": true
  }
}
```

Intenciones soportadas:

- `SALUDO`
- `DESPEDIDA`
- `AGRADECIMIENTO`
- `AYUDA`
- `BUSCAR_PRODUCTO`
- `BUSCAR_SERVICIO`
- `VER_CATEGORIAS`
- `VER_PROMOCIONES`
- `CONSULTAR_PRECIO`
- `CONSULTAR_STOCK`
- `CONSULTAR_HORARIO`
- `CONSULTAR_UBICACION`
- `INTENCION_COMPRA`
- `AGENDAR_CITA`
- `HABLAR_ASESOR`
- `FUERA_DE_TEMA`
- `MENSAJE_GENERAL`

Herramientas MCP usadas por el orquestador:

- `buscar_productos`
- `obtener_producto`
- `buscar_servicios`
- `obtener_servicio`
- `obtener_categorias`
- `obtener_promociones`
- `obtener_configuracion_empresa`
- `crear_lead`
- `registrar_intencion_compra`
- `guardar_conversacion`
- `crear_pedido`

Regla de seguridad: OpenAI nunca ejecuta SQL, no recibe catalogos completos y
no decide precios, stock ni datos de negocio.
