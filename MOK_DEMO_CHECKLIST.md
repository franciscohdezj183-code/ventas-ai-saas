# MOK Demo Checklist

## Preparar base de datos

1. Ejecutar migraciones:

```bash
npm run migrate --workspace backend
```

2. Normalizar datos de MOK Estudio + Taller:

```bash
npm run db:seed:mok --workspace backend
```

El seed es idempotente: puede ejecutarse de nuevo sin duplicar categorías ni servicios canónicos. Usa `MOK_COMPANY_SLUG` o `MOK_COMPANY_NAME` si necesitas apuntar a otra empresa MOK en una base distinta.

## Correr backend

```bash
npm run dev --workspace backend
```

El backend debe quedar escuchando en `http://localhost:4000`.

## Correr frontend

```bash
npm run dev --workspace frontend
```

El frontend debe quedar disponible en `http://localhost:5173`.

## Probar catálogo de servicios

1. Entrar al frontend.
2. Seleccionar la empresa `MOK Estudio + Taller`.
3. Abrir Servicios.
4. Confirmar que se muestran categorías como Diseño, Marketing, Impresión, Vinil, Rotulación, Señalética, Textil, Promocionales, Banners e Instalación.
5. Confirmar que los servicios sin duración muestran `No aplica`, no `60 min`.
6. Confirmar que `Diseño de logotipo` aparece como `Cotización con asesor` y sin duración.
7. Confirmar que los servicios por m² muestran precio por `m²` y badge de `Medidas`.

## Probar bot

Con el backend y frontend corriendo, conectar WhatsApp desde la pantalla de WhatsApp y enviar mensajes al número de MOK. También puedes probar desde la conversación/inbox si el entorno tiene mensajes simulados.

Preguntas de prueba:

- cuánto cuesta una lona de 2x1
- vinil impreso 1.5x2
- vinil reflejante 1x1
- quiero tarjetas 100 piezas
- quiero 600 tarjetas
- hacen diseño web
- hacen logotipos
- quiero instalación
- me interesa pásame con asesor

Resultados esperados:

- Lona y viniles por m² calculan área y total aproximado.
- Servicios por cotización no inventan precio y ofrecen asesor.
- Tarjetas responden el precio fijo del paquete.
- El bot no menciona duración cuando `duracion_minutos` es `NULL`.
- Al pedir asesor después de interés real, se crea lead con teléfono del cliente.

## Verificación final

```bash
npm test --workspace backend
npm run build --workspace frontend
```
