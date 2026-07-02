# Semantic Intent Classifier

## Objetivo

El Semantic Intent Classifier es un fallback semantico para el Unified Planner. No es una autoridad de negocio y no puede decidir estado, servicio final, handoff, persistencia ni respuesta al cliente.

Flujo:

```text
Mensaje
-> Entity Extractor
-> Unified Planner
-> si CLARIFY/no_planner_rule_matched y baja confianza
-> Semantic Intent Classifier
-> semanticHints
-> Unified Planner
-> ExecutionPlan
-> Executor
```

## Contrato

El clasificador solo puede devolver:

```json
{
  "intent": "SHOW_CATALOG | REQUEST_RECOMMENDATION | ASK_PRICE | ASK_ADVISOR | PROVIDE_BUSINESS_TYPE | PROVIDE_BUSINESS_GOAL | UNKNOWN",
  "confidence": 0.0,
  "entities": {
    "businessType": null,
    "businessGoal": null,
    "budget": null,
    "currency": null,
    "catalogRequest": false,
    "advisorRequest": false
  },
  "explanation": ""
}
```

Campos prohibidos:

- `respuesta_sugerida`
- `herramienta_mcp`
- `mcpPlan`
- `selectedService`
- `nextState`
- `responseText`
- `handoffPlan`
- `persistencePlan`

Si aparece cualquier campo prohibido, el resultado se descarta y se conserva el plan original.

## Gating

No se llama OpenAI en cada mensaje. El clasificador solo se invoca cuando el plan inicial cumple todo esto:

- `intent === CLARIFY`
- `reason === no_planner_rule_matched`
- `confidence < semanticIntent.minConfidence`
- el Entity Extractor no encontro entidades

Esto evita llamadas para mensajes deterministas como catalogo exacto, numeros, medidas, presupuesto, si/no o asesor.

## Configuracion

Valores por defecto:

```js
semanticIntent: {
  enabled: true,
  minConfidence: 0.85,
  maxTokens: 250,
  temperature: 0,
  timeoutMs: 4000,
  cacheTTL: 3600
}
```

Overrides por entorno:

- `SEMANTIC_INTENT_ENABLED`
- `SEMANTIC_INTENT_MIN_CONFIDENCE`
- `SEMANTIC_INTENT_MAX_TOKENS`
- `SEMANTIC_INTENT_TEMPERATURE`
- `SEMANTIC_INTENT_TIMEOUT_MS`
- `SEMANTIC_INTENT_CACHE_TTL`

## Cache

La cache es en memoria por:

- `empresaId`
- mensaje normalizado
- idioma/contexto simple
- business type activo si existe

Si existe hit vigente, no se llama OpenAI.

## Logs

Eventos:

- `semantic_classifier_called`
- `semantic_classifier_cache_hit`
- `semantic_classifier_success`
- `semantic_classifier_timeout`
- `semantic_classifier_error`
- `semantic_classifier_low_confidence`
- `semantic_classifier_used`
- `semantic_classifier_request`
- `semantic_classifier_response`

## Autoridad

El clasificador produce `semanticHints`. El Unified Planner traduce esos hints a entidades sinteticas y vuelve a planear. El `ExecutionPlan`, el estado, la respuesta, el handoff y la persistencia siguen saliendo exclusivamente del Unified Planner y del Executor.
