# RestaPP AI — agente autónomo (142 tools)

Este repositorio contiene **solo el módulo RestaPP AI**. El motor IA, canales, Entrenamiento IA/RAG y Automatizaciones pertenecen al equipo AllSender y se inyectan al módulo mediante adapters.

## Objetivo

Cada mensaje entrante activa un turno autónomo:

1. El router de AllSender determina que la conversación pertenece a RestaPP AI.
2. `runRestappAutonomousTurn()` recibe el mensaje y la fase conversacional.
3. `selectRestappAgentTools()` elige **máximo 12** de las 142 capacidades según intención + fase.
4. El proveedor LLM configurado para el equipo recibe solo esas tools.
5. El LLM llama una o varias funciones.
6. `executeRestappAgentTool()` ejecuta datos/acciones reales o delega al adapter AllSender correspondiente.
7. El resultado vuelve al LLM, que puede llamar otra tool hasta resolver el turno.

No hay cron ni polling temporal: el agente opera por eventos/conversación.

## Archivos

- `lib/modules/restapp-ai/agent-tools.ts`: catálogo ejecutable de 142 tools, nombres compatibles con function calling (`restapp__order__confirm`), selector contextual y límite de 12.
- `lib/modules/restapp-ai/agent-executor.ts`: dispatcher de ejecución, confirmación para mutaciones, carrito conversacional, consultas reales y adapters de runtime.
- `lib/modules/restapp-ai/autonomous-agent.ts`: loop autónomo multi-step y ejecución paralela de lecturas / secuencial de escrituras.
- `lib/modules/restapp-ai/orchestrator.ts`: compatibilidad con las 31 tools originales.

## RAG / Entrenamiento IA

RestaPP **no crea otro vector store ni otro proveedor**. El host conecta el RAG ya existente de `/modulo/entrenamiento-ia`:

```ts
execution: {
  adapters: {
    ragSearch: async ({ teamId, query, limit, namespace }) => {
      return searchTeamTraining({ teamId, query, limit, namespace });
    }
  }
}
```

Las tools FAQ/conocimiento usan ese adapter cuando está disponible y pueden usar las FAQ locales como fallback.

## Adaptadores del runtime

```ts
{
  ragSearch,   // Entrenamiento IA / RAG compartido del equipo
  sendMedia,   // canal actual: imagen / ubicación
  notify,      // humano, cocina, staff, manager, cliente
  invoke       // POS/CRM/pagos u otra capacidad que pertenece al runtime
}
```

El módulo nunca debe duplicar WhatsApp, Inbox, proveedor IA ni Automatizaciones.

## Ejemplo de integración

```ts
const result = await runRestappAutonomousTurn({
  teamId,
  message: inboundText,
  phase: conversationState.phase || 'exploring',
  llm: allsenderTeamLlmAdapter,
  execution: {
    chatId,
    customerPhone,
    confirmed: conversationState.customerConfirmed === true,
    state: conversationState,
    adapters: allsenderRestappAdapters,
  },
});
```

Persistir `result.state` dentro del estado de conversación existente de AllSender. No crear una segunda sesión paralela.

## Seguridad operacional

- Máximo 12 tools visibles por llamada al LLM.
- Máximo 3 lecturas independientes en paralelo.
- Escrituras siempre secuenciales.
- Toda tool write marcada como confirmable responde `confirmation_required` hasta que exista confirmación explícita.
- CRM/POS/reportes administrativos no se exponen al agente de cliente salvo `internal: true`.
- Si una integración externa no está conectada, el executor responde `runtime_adapter_required`; el LLM no debe inventar el resultado.

## Dominios (142)

- Menú: 16
- Recomendación: 10
- Sucursales: 9
- Pedidos: 20
- Delivery: 10
- Mesas/Reservas: 15
- Clientes/Lealtad: 13
- Pagos: 9
- Promociones: 8
- Handoff/Equipo: 7
- FAQ/RAG: 7
- CRM/POS: 12
- Reportes: 6

Total: **142 funciones**.
