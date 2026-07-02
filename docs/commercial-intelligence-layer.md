# Commercial Intelligence Layer

## Arquitectura

La Commercial Intelligence Layer vive dentro del Unified Planner. No es un motor independiente y no toma autoridad fuera del planner.

Flujo:

Cliente -> Entity Extractor -> Unified Planner -> ExecutionPlan -> Executor

Responsabilidades:

- Entity Extractor: extrae entidades como servicio, presupuesto, objetivo y giro.
- Unified Planner: decide intencion, estado, handoff, preguntas, recomendaciones y memoria util.
- Executor: ejecuta el `ExecutionPlan`, renderiza la respuesta indicada y persiste lo que el planner ordeno.

## Commercial Intelligence

El Unified Planner usa estrategias internas para:

- detectar `businessType` cuando el cliente menciona su giro;
- detectar `businessGoal` desde el objetivo comercial;
- preguntar en modo consultivo cuando falta contexto;
- priorizar servicios disponibles;
- explicar por que cada recomendacion ayuda;
- limitar la salida a maximo tres opciones.

La memoria util guarda solo:

- `businessType`
- `businessGoal`
- `preferredCategory`
- `preferredServices`
- `budgetRange`
- `lastRecommendation`

La memoria no revive servicios ni cambia el estado por si sola.

## Scoring

El priorizador suma senales:

- ajuste con la matriz por giro;
- ajuste con el objetivo comercial;
- compatibilidad con presupuesto;
- disponibilidad en catalogo;
- contexto ya conocido por el planner.

El presupuesto penaliza opciones premium cuando el monto es inicial, por ejemplo `1000` pesos, y permite alternativas mas completas con presupuestos altos, por ejemplo `10000` pesos.

## Configuracion Por Empresa

Cada empresa puede sobreescribir la matriz en `companyConfig.commercialIntelligence.recommendationMatrix` o `companyConfig.ncie.commercialIntelligence.recommendationMatrix`.

Ejemplo:

```json
{
  "commercialIntelligence": {
    "recommendationMatrix": {
      "papeleria": ["lona", "vinil", "promocional", "tarjeta"],
      "restaurante": ["menu", "senal", "branding", "pagina web"]
    }
  }
}
```

## Ejemplos

Antes:

Cliente: "No se que necesito"

Bot: "Que producto tienes en mente?"

Ahora:

Bot: "Claro. Que tipo de negocio tienes?"

Antes:

Cliente: "Tengo una cafeteria y quiero atraer clientes con 1000 pesos"

Bot: "Te recomiendo una lona."

Ahora:

Bot: recomienda hasta tres opciones y explica el motivo, por ejemplo visibilidad desde calle y ajuste a presupuesto inicial.

Si el cliente ya sabe el servicio:

Cliente: "Quiero una lona para mi papeleria"

El planner inicia cotizacion de lona. No recomienda catalogo ni pregunta el giro otra vez.

## Metricas

Canary registra:

- `commercial_quality_score`
- `recommendation_generated`
- `recommendation_explained`
- `business_goal_detected`
- `business_type_detected`

Tambien se conservan las metricas existentes de Shadow, Canary, Rollback y Unified Validate.
