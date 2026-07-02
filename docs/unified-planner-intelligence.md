# Unified Planner Intelligence

Fase 8 optimiza calidad conversacional dentro del Unified Planner sin reactivar autoridad legacy.

## Reglas

- Unified Planner decide intent, estado, servicio, recomendaciones, handoff y resumen.
- Executor solo renderiza el `ExecutionPlan`.
- Canary mantiene rollback a legacy.
- Memoria util no revive servicios ni estados viejos.

## emojiMode

Configurable por empresa en `obtener_configuracion_empresa`:

```json
{
  "emojiMode": "professional"
}
```

Valores:

- `none`: sin emojis en respuestas.
- `professional`: emojis sobrios, maximo 3-5 por mensaje.
- `friendly`: tono mas cercano, sin exagerar.

## Recomendaciones Consultivas

Cuando el cliente expresa objetivo comercial, presupuesto o incertidumbre, el Planner usa:

- objetivo detectado
- presupuesto detectado
- tipo de negocio de empresa o mensaje
- catalogo disponible

Ejemplo antes:

> Para recomendarte algo util, que quieres lograr?

Ejemplo despues:

> Con lo que me cuentas, revisaria estas opciones:
> Objetivo: atraer clientes
> Presupuesto: $1,000.00
> 1. Impresion de lona: Da visibilidad rapida...
> 2. Vinil de rotulacion de color: Convierte fachada...

Si el cliente dice "no se que necesito", el Planner hace diagnostico breve:

> Claro. Para recomendarte algo util: quieres atraer clientes, vender mas o mejorar tu imagen?

## Memoria Util

Se guarda bajo `datos_json.ncie.unified_memory`:

- `lastServiceConsulted`
- `lastObjective`
- `lastBudget`
- `lastSummary`
- `preferences`

No se usa como autoridad de estado. La autoridad sigue en `datos_json.ncie.unified.currentState`.

## Sinonimos

Base soportada:

- lona / manta / banner impreso
- logo / logotipo / marca
- rotulacion / vinil / rotular
- catalogo / servicios / menu
- asesor / ejecutivo / vendedor / humano
- presupuesto / cuanto cuesta / cuanto sale

Configurable por empresa:

```json
{
  "synonyms": {
    "services": {
      "Impresion de lona": ["super banner", "manta exterior"]
    }
  }
}
```

## Resumen De Cotizacion

Cuando hay datos suficientes:

```text
Resumen:
Servicio:
Medidas/cantidad:
Presupuesto:
Diseno:
Instalacion:
Estimado:
Siguiente paso:
```

Luego pregunta si desea asesor.

## Mensaje Al Dueno

Formato corto para handoff Unified:

```text
Nueva solicitud - {empresa}
Cliente:
Servicio:
Datos:
Estimado:
Mensaje:
Responder: si {codigo} / no {codigo}
```

## Metricas

Eventos agregados:

- `unified_recommendation_generated`
- `unified_quote_summary_generated`
- `unified_memory_enriched`
- `unified_synonym_matched`
- `unified_emoji_mode_applied`
- `unified_conversation_quality_score`

El reporter canary los incluye en `byMessage`.
