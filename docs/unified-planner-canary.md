# Unified Planner Canary

El Unified Planner no esta activo por defecto. Para habilitarlo solo en empresas controladas:

```env
UNIFIED_PLANNER_ENABLED=true
UNIFIED_PLANNER_CANARY_EMPRESAS=5
UNIFIED_PLANNER_ROLLBACK_ON_ERROR=true
```

Para varias empresas:

```env
UNIFIED_PLANNER_CANARY_EMPRESAS=5,7,10
```

Con `UNIFIED_PLANNER_ROLLBACK_ON_ERROR=true`, cualquier error del flujo unified registra `unified_canary_error` y cae al motor legacy con `unified_canary_fallback_to_legacy`. El flujo unified no envia respuesta, no persiste estado y no crea notificaciones antes de terminar correctamente.

El canary usa estado separado en `datos_json.ncie.unified` y no toma `activeFlow`, `waitingField`, `active_service_id` ni `ultimo_servicio_id` legacy como autoridad. Si `ncie.unified` no existe, el Unified Planner inicia en `INIT`.

Namespace persistido:

```js
state.unified = {
  currentState,
  selectedService,
  selectedCategory,
  lastOptionsShown,
  entities,
  lastQuestionId,
  lastQuestionText,
  flowId,
  flowStatus
}
```

Logs operativos:

- `unified_canary_selected`
- `unified_canary_skipped`
- `unified_canary_response_sent`
- `unified_canary_fallback_to_legacy`
- `unified_canary_error`
- `unified_canary_clarify`
- `unified_canary_repeated_question_prevented`
- `unified_canary_out_of_order_entity_handled`
- `unified_canary_handoff_sent`
- `unified_canary_legacy_service_revived`

Validacion recomendada antes de activar:

```bash
npm run unified:validate
npm run unified:e2e
npm run shadow:evaluate
npm run canary:report
```

Reset de un chat de prueba:

```bash
npm run conversation:reset -- --empresaId=5 --phone=+527298349854
```

Criterio minimo antes de ampliar canary:

- `criticalMismatchCount` en 0 en `backend/reports/unified-shadow-report.json`.
- `unifiedBetterCount > oldBetterCount`.
- Sin casos de memoria vieja revivida.
- Sin pregunta repetida exacta.
- Sin cambio de servicio sin intencion explicita.

## Fase 7: estabilizacion canary

El canary sigue protegido por dos condiciones: `UNIFIED_PLANNER_ENABLED=true` y `empresaId` dentro de `UNIFIED_PLANNER_CANARY_EMPRESAS`. Si alguna condicion falla, responde el motor legacy. `UNIFIED_PLANNER_ROLLBACK_ON_ERROR=true` mantiene rollback inmediato.

Los eventos `unified_canary_*` se escriben en consola y tambien en:

```text
backend/logs/unified-canary.jsonl
```

`npm run canary:report` lee logs `json/jsonl/log` desde `backend/logs` o `backend` y genera:

```text
backend/reports/unified-canary-report.json
```

Tambien puede ejecutarse contra un archivo especifico:

```bash
npm run canary:report -- --input=logs/production.jsonl
```

Checklist legacy para eliminacion futura, sin borrar todavia:

- `conversation-router.js`: mover reglas deterministas validas al Unified Planner o al entity-extractor; mantenerlo para legacy hasta apagarlo.
- `decision-engine`: confirmar que `ExecutionPlan` cubre accion, handoff y persistencia.
- `commercial-reasoner`: migrar heuristicas utiles a Planner o catalog hints.
- `response-interpreter`: conservar solo parsers puros; no debe decidir estado ni servicio.
- `direct-catalog-matcher`: pasar patrones utiles al entity-extractor como candidatos; no debe ser autoridad.

Criterio Fase 7:

- `npm run unified:e2e`: 20/20 flujos OK.
- `npm run unified:validate`: suite unified completa OK.
- `fallbackToLegacyCount = 0` para la corrida evaluada.
- `totalEvents > 0`; si no hay eventos, `canProceedToLegacyCleanup=false` con `reason=no_canary_events_found`.
- `legacyServiceRevivedCount = 0`.
- Sin preguntas repetidas exactas en e2e.
- Asesor, catalogo, numeros y cambios de tema cubiertos por e2e.

## Fase 8: limpieza legacy controlada

Inventario completo:

```text
docs/conversation-engine-legacy-inventory.md
```

Primer corte aplicado:

- En canary exitoso, `conversation-engine.service.js` ya no normaliza ni emite logs de estado legacy (`ncie_conversation_state_loaded`, `ncie_state_before`) antes de invocar el Unified Planner.
- El rollback sigue intacto: si `runUnifiedPlannerCanary` falla y `UNIFIED_PLANNER_ROLLBACK_ON_ERROR=true`, el motor legacy carga su `plannerState` y continua como antes.
- `unified_canary_selected` registra solo estado canonico `datos_json.ncie.unified`, sin publicar `activeFlow`/`waitingField` legacy.
- Los modulos LegacyOnly que todavia deciden registran `legacy_decision_detected`.
- Aliases utiles de `direct-catalog-matcher` para `Promocionales con corte de vinil` se migraron a `entity-extractor`.

Validacion agregada:

- `unified-canary-mode.test.js` cubre que un canary exitoso con memoria legacy contaminada no emite logs de autoridad legacy antes del Unified Planner.
- `unified-canary-mode.test.js` cubre que el branch legacy si emite `legacy_decision_detected`.
- `entity-extractor.test.js` cubre el alias migrado de promocionales con corte de vinil.

Siguiente limpieza permitida solo con pruebas verdes y rollback observable:

- Retirar rutas de `conversation-router.js` del camino canary; mantenerlas solo para empresas fuera de canary y fallback tecnico.
- Migrar heuristicas utiles de `direct-catalog-matcher`, `response-interpreter` y `commercial-reasoner` hacia `entity-extractor`/Unified Planner antes de borrar codigo.
- Mantener `decision-engine` y `response-planner` solo como dependencias del motor legacy hasta apagarlo por empresa.
