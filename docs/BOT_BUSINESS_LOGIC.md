# Logica del bot por tipo de negocio

Este documento define como dividir el trabajo entre desarrolladores para modificar la logica comercial del bot sin generar conflictos en el orquestador principal.

## Archivos responsables

### Empresas de productos

Archivo:

```text
backend/src/bot/business-types/product-business.strategy.js
```

Controla empresas cuyo `tipo_negocio` se normaliza como `PRODUCTOS`.

Responsabilidades:

- Busqueda de catalogo de productos.
- Preguntas de precio, stock y disponibilidad.
- Intencion de compra: "lo quiero", "me interesa", "quiero comprar".
- Derivar a asesor cuando el cliente pregunta por servicios en una empresa enfocada en productos.

### Empresas de servicios

Archivo:

```text
backend/src/bot/business-types/service-business.strategy.js
```

Controla empresas cuyo `tipo_negocio` se normaliza como `SERVICIOS`.

Responsabilidades:

- Busqueda de servicios.
- Preguntas de precio o costo de servicios.
- Agendar citas, cotizar y crear leads.
- Derivar a asesor cuando el cliente pregunta por productos en una empresa enfocada en servicios.

### Empresas mixtas

Archivo:

```text
backend/src/bot/business-types/mixed-business.strategy.js
```

Controla empresas con `tipo_negocio` mixto o no definido.

Responsabilidades:

- Decidir si el mensaje parece producto o servicio.
- Buscar primero productos o servicios segun el mensaje.
- Hacer fallback cruzado si no hay resultados.
- Mantener contexto previo de producto o servicio para preguntas cortas.
- Registrar interes usando `producto_id` o `servicio_id` segun el ultimo contexto.

## Archivos compartidos

Factory de seleccion:

```text
backend/src/bot/business-types/business-strategy.factory.js
```

Helpers comunes:

```text
backend/src/bot/business-types/shared-response-helpers.js
```

Orquestador principal:

```text
backend/src/bot/messageOrchestrator.js
```

El orquestador debe mantenerse estable. Las estrategias deben modificar intenciones antes o despues de llamar herramientas MCP, pero no deben duplicar toda la logica del bot.

## Que NO debe tocar cada desarrollador

### Desarrollador de productos

Puede tocar:

```text
backend/src/bot/business-types/product-business.strategy.js
```

No debe tocar:

- `service-business.strategy.js`
- `mixed-business.strategy.js`
- `messageOrchestrator.js`, salvo acuerdo tecnico.
- Rutas, controladores o base de datos.
- Builders globales de respuesta si el cambio solo aplica a productos.

### Desarrollador de servicios

Puede tocar:

```text
backend/src/bot/business-types/service-business.strategy.js
```

No debe tocar:

- `product-business.strategy.js`
- `mixed-business.strategy.js`
- `messageOrchestrator.js`, salvo acuerdo tecnico.
- Rutas, controladores o base de datos.
- Logica de catalogo de productos.

### Desarrollador de empresas mixtas

Puede tocar:

```text
backend/src/bot/business-types/mixed-business.strategy.js
```

No debe tocar:

- `product-business.strategy.js`
- `service-business.strategy.js`
- `messageOrchestrator.js`, salvo acuerdo tecnico.
- Factory de seleccion, excepto si se agrega un nuevo tipo de negocio.

## Seleccion de estrategia

La estrategia se selecciona en:

```text
backend/src/bot/business-types/business-strategy.factory.js
```

El factory lee:

```js
companyContext.tipo_negocio
```

Reglas actuales:

- `PRODUCTO`, `PRODUCTOS`, `TIENDA`, `ECOMMERCE` -> `productBusinessStrategy`
- `SERVICIO`, `SERVICIOS` -> `serviceBusinessStrategy`
- `MIXTO`, `PRODUCTOS_SERVICIOS`, vacio o desconocido -> `mixedBusinessStrategy`

El orquestador llama la estrategia despues de interpretar el mensaje y aplicar contexto conversacional:

```js
const businessStrategy = getBusinessStrategy(contextoEmpresa);
const intent = businessStrategy.prepareIntent(...);
```

Despues de ejecutar la herramienta MCP, la estrategia puede aplicar fallback:

```js
await businessStrategy.resolveAfterTool(...);
```

## Como probar

Ejecutar todo el backend:

```bash
npm test --workspace backend
```

Tests relevantes:

```text
backend/src/bot/business-types/business-strategy.factory.test.js
backend/src/bot/messageOrchestrator.test.js
```

Para probar manualmente, usar empresas con `tipo_negocio` configurado segun el caso:

- Productos: `PRODUCTOS`
- Servicios: `SERVICIOS`
- Mixto: `MIXTO` o `PRODUCTOS_SERVICIOS`

Validar siempre:

- Que no se rompan FAQ ni temas bloqueados.
- Que no se duplique handoff humano.
- Que promociones, horario, ubicacion, metodos de pago y envios sigan pasando por configuracion de empresa.
- Que el contexto previo se respete en preguntas cortas como "cuanto cuesta" o "me interesa".

## Ejemplos esperados

### PRODUCTOS

Mensaje:

```text
tienes sillas
```

Comportamiento esperado:

- La estrategia usa `buscar_productos`.
- La respuesta muestra productos encontrados, precio y stock si aplica.
- Si hay imagen, el orquestador mantiene soporte para enviarla.

Mensaje:

```text
cuanto cuesta
```

Comportamiento esperado:

- Si existe `ultimo_producto_id`, usa `obtener_producto`.
- La respuesta habla del ultimo producto consultado.
- Si no hay contexto, intenta busqueda de producto segun el texto.

Mensaje:

```text
lo quiero
```

Comportamiento esperado:

- Usa `registrar_intencion_compra`.
- Si existe contexto, incluye `producto_id`.
- Puede activar notificacion o asesor humano segun la configuracion existente.

### SERVICIOS

Mensaje:

```text
hacen instalacion
```

Comportamiento esperado:

- La estrategia usa `buscar_servicios`.
- La respuesta lista servicios relacionados.
- Si un servicio requiere cotizacion, el builder responde que requiere asesor.

Mensaje:

```text
cuanto cuesta el servicio
```

Comportamiento esperado:

- Si existe `ultimo_servicio_id`, usa `obtener_servicio`.
- Si `tipo_precio` es `COTIZACION`, responde que requiere cotizacion con asesor.
- Si el servicio tiene duracion, la respuesta incluye la duracion.

Mensaje:

```text
quiero agendar
```

Comportamiento esperado:

- Usa `crear_lead`.
- Registra interes por el servicio.
- Si existe contexto, incluye `servicio_id`.
- Prioriza cita, cotizacion o asesor.

### MIXTO

Mensaje:

```text
tienes lonas
```

Comportamiento esperado:

- La estrategia interpreta el mensaje como producto.
- Busca productos primero con `buscar_productos`.
- Si no hay productos, busca servicios con `buscar_servicios`.

Mensaje:

```text
hacen instalacion de lona
```

Comportamiento esperado:

- La estrategia interpreta el mensaje como servicio.
- Busca servicios primero con `buscar_servicios`.
- Si no hay servicios, busca productos con `buscar_productos`.

Mensaje:

```text
me interesa
```

Comportamiento esperado:

- Si el ultimo contexto fue producto, usa `registrar_intencion_compra` con `producto_id`.
- Si el ultimo contexto fue servicio, usa `registrar_intencion_compra` con `servicio_id`.
- Si no hay contexto claro, debe pedir aclaracion breve:

```text
Buscas un producto especifico o quieres informacion de algun servicio?
```

## Reglas de mantenimiento

- Cada estrategia debe cambiar intenciones, no reimplementar todo el bot.
- No duplicar llamadas directas a base de datos dentro de estrategias.
- Usar herramientas MCP existentes: `buscar_productos`, `obtener_producto`, `buscar_servicios`, `obtener_servicio`, `crear_lead`, `registrar_intencion_compra`.
- Mantener `messageOrchestrator.js` como coordinador principal.
- Agregar o actualizar tests cuando cambie una regla comercial.
- Si una regla aplica a mas de un tipo de negocio, revisar si pertenece a `shared-response-helpers.js`.
