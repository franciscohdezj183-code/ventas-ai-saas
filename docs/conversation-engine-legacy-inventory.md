# Conversation Engine Legacy Inventory - Fase 8

Objetivo: retirar responsabilidades legacy solo cuando Unified Planner ya las cubre. No se elimina ningun archivo en Fase 8.

## Inventario

| Archivo | Responsabilidad actual | Quien decide | Quien ejecuta | Reemplazo Unified | Clasificacion |
| --- | --- | --- | --- | --- | --- |
| `conversation-engine.service.js` | Orquestador y branch legacy/canary | Unified Planner en canary; legacy branch fuera de canary o rollback | Orquestador | `entity-extractor` -> `unified-conversation-planner` -> `execution-plan.executor` | MIGRATE |
| `unified-conversation-planner.js` | Autoridad canonica de intent, servicio, estado, respuesta y handoff | Unified Planner | Executor | Ya es destino | KEEP |
| `entity-extractor.js` | Extraccion central de entidades y candidatos | No decide accion final | Unified Planner consume entidades | Ya reemplaza NLU/matcher para canary | KEEP |
| `execution-plan.executor.js` | Ejecuta instrucciones del `ExecutionPlan` | No decide estado/servicio | Executor | Ya es destino | KEEP |
| `conversation-contracts.js` | Contratos canonicos | No decide | Todos | Ya es destino | KEEP |
| `unified-canary.service.js` | Runner canary y persistencia `datos_json.ncie.unified` | Unified Planner | Canary runner | Ya es destino | KEEP |
| `unified-shadow.service.js` | Comparacion shadow | Unified Planner solo para comparar | Shadow runner | Temporal de observabilidad | DEPRECATE |
| `conversation-router.js` | Dispatcher y short-circuit legacy | LegacyOnly | Legacy branch | Reemplazado por Unified Planner | DEPRECATE |
| `decision-engine.js` | Seleccion de accion legacy | LegacyOnly | Legacy branch | `ExecutionPlan.actions`, `handoffPlan`, `persistencePlan` | DEPRECATE |
| `commercial-reasoner.js` | Heuristicas comerciales legacy | LegacyOnly | Legacy branch | Reglas internas de Unified Planner | DEPRECATE |
| `direct-catalog-matcher.js` | Seleccion directa servicio/categoria legacy | LegacyOnly | Legacy branch | `entity-extractor` candidates + Unified Planner | DEPRECATE |
| `planner/response-interpreter.js` | Parser contextual por `waitingField` | LegacyOnly cuando se invoca con `waitingField` | Legacy branch/planner viejo | `entity-extractor` + `ConversationState.currentState` | MIGRATE |
| `response-planner.js` | Plan de respuesta legacy | LegacyOnly | Legacy branch | `ExecutionPlan.responsePlan` | DEPRECATE |
| `response-generator.js` | Render de respuesta legacy | LegacyOnly render | Legacy branch | `execution-plan.executor` render unified | MIGRATE |
| `conversation-state.manager.js` | Lectura/persistencia con compatibilidad legacy | Legacy guard solo fuera de canary | Legacy branch/canary reader | `datos_json.ncie.unified` | MIGRATE |
| `retrieval.service.js` | Carga catalogo y evidencia | No debe decidir seleccion final | Retrieval adapter | `retrievalPlan` del ExecutionPlan | KEEP |
| `advisor-notification.js` | Construye payload asesor | Unified o legacy segun plan recibido | Notification builder | `handoffPlan` decide | KEEP |
| `nlu.interpreter.js` | NLU legacy | LegacyOnly | Legacy branch | `entity-extractor` | REMOVE in Fase 9 |
| `planner/commercial-conversation-planner.js` | Planner anterior NCIE | LegacyOnly/shadow viejo | Legacy branch | `unified-conversation-planner.js` | REMOVE in Fase 9 |
| `planner/commercial-state.schema.js` | Estado legacy `activeFlow`/`waitingField` | Legacy helpers | Legacy branch | `ConversationState.currentState` | MIGRATE |
| `planner/missing-information.detector.js` | Parsers puros de diseno/instalacion | No decide estado | Extractor/planners | Reutilizable como parser | KEEP |
| `planner/dimensions.parser.js` | Parser de medidas | No decide estado | Extractor/interpreter | Reutilizable como parser | KEEP |

## Migrado En Fase 8

- Aliases utiles de `direct-catalog-matcher` para `Promocionales con corte de vinil` pasaron al `entity-extractor`.
- `conversation-engine.service.js` evita normalizar/loguear estado legacy antes del canary exitoso.
- Modulos legacy que todavia deciden emiten `legacy_decision_detected`.
- Modulos legacy quedan marcados como `@deprecated LegacyOnly` sin borrar archivos.

## Responsabilidades Temporales

- El branch legacy sigue respondiendo para empresas fuera de canary.
- Rollback sigue cayendo al motor legacy si `UNIFIED_PLANNER_ROLLBACK_ON_ERROR=true`.
- `activeFlow` y `waitingField` pueden existir solo dentro del branch legacy y datos historicos.
- `response-interpreter` puede parsear respuestas legacy, pero no debe entrar al camino canary exitoso.

## Candidatos Para Eliminar En Fase 9

- `conversation-router.js`
- `decision-engine.js`
- `commercial-reasoner.js`
- `direct-catalog-matcher.js`
- `nlu.interpreter.js`
- `planner/commercial-conversation-planner.js`
- Partes de `response-planner.js` y `response-generator.js` que solo renderizan planes legacy
- Campos persistidos legacy `active_service_*`, `planner_state.activeFlowId`, `waitingField`, cuando ya no haya rollback a legacy
