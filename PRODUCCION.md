# Plan de producción — RestApp AI como agente activo (patrón Venta AI)

> Objetivo: que RestApp AI converse por los **mismos canales que Venta AI**, con el **motor CodeMorf**, para los clientes SaaS de RestApp. Hoy el módulo tiene datos + API + conexión en producción, pero el agente de conversación está retirado. Este plan replica exactamente el patrón que ya funciona para Venta AI (EcoMarket, team 83).

## Contexto (verificado en producción 2026-08-20)

- `lib/modules/restapp-ai/` corre en producción (10 archivos: db, crud, orchestrator con 31 tools, import-api, access, api-auth, money, shell, types, index).
- `lib/restapp-connect/` (codes + handoff) y `app/api/restapp-connect/exchange` funcionan.
- `app/api/restapp-ai/v1/[resource]/route.ts` sirve la API v1 completa.
- **Retirado:** `processRestappAiAutomationRouting` en `lib/automation/engine.ts` devuelve `false` (motor externo RestaPP/Intelligence jubilado). No hay dispatcher de agente en `lib/plugins/ai-chat/service.ts` para `restapp_ai`.
- **Faltante en DB:** no existe fila `restapp_ai` en `allsender_channel_modules` ni entitlements en `plan_module_entitlements`.
- Venta AI (modelo a replicar): `tryHandleSalesAiMessage` se llama desde `service.ts` (~línea 1213) dentro de `processAIMessage`, con `exclusive-mode-lock`, `module-access` y state machine persistente.

## Paso 1 — Dispatcher del agente (`tryHandleRestappAiMessage`)

Crear en `lib/modules/restapp-ai/orchestrator.ts` un dispatcher con la misma firma que el de ventas:

```ts
export async function tryHandleRestappAiMessage(input: {
  teamId: number;
  chatId: number;
  text: string;
  intent?: string | null;          // del ai-flow-router / intent router
  state?: RestappConversationState | null;
  hasImage?: boolean;
  imageUrl?: string | null;
  hasLocation?: boolean;
  locationLat?: number | null;
  locationLng?: number | null;
}): Promise<{ handled: boolean; responseText?: string; action?: string; reason?: string }>
```

Comportamiento:
1. **Gate:** `getRestappAccess(teamId)` → `runtimeActive` (team activo + módulo on + setup completo + agente habilitado + motor AI ready). Si no, `{ handled: false }` y el flujo cae al chatbot genérico.
2. **Intención:** si `intent` no llega, clasificar con el mismo `intent-router` (patrones de restaurante ya existen en `ai-flow-router.ts`: menú, mesa, pedido, reserva…).
3. **Dominio(s) activo(s):** seleccionar 1-2 dominios del catálogo de 142 funciones según intención + fase de conversación (ver `CATALOGO_FUNCIONES.md` §Invocación selectiva).
4. **Motor:** llamar al runtime de CodeMorf con las tools del dominio activo (máx. 12) y el system prompt del restaurante (persona, idioma, reglas: confirmar antes de pedir/reservar, no inventar descuentos, no agotados).
5. **Ejecución:** `runRestappTool(teamId, tool, args, { chatId })` — ya existe y es determinista; **el LLM nunca calcula precios/totales**: `calculate_order_quote`, `createRestappOrder` y `createRestappReservation` son ejecutores deterministas.
6. **Respuesta:** devolver texto limpio; si `handled`, `service.ts` guarda historial (patrón sales-ai) y responde al canal.

## Paso 2 — Cablear en `lib/plugins/ai-chat/service.ts`

En `processAIMessage`, junto al bloque de ventas (~línea 1213), insertar:

```ts
const restappResult = await tryHandleRestappAiMessage({ teamId, chatId, text, intent, state, hasImage, imageUrl, hasLocation, locationLat, locationLng })
  .catch((error) => { console.error('[RestAppAI] handler failed:', error?.message || error); return null; });

if (restappResult?.handled) {
  const restappText = cleanAiText(restappResult.responseText || '');
  // guardar historial en ai_sessions (mismo patrón sales-ai) y devolver restappText
}
```

- El gate de exclusividad (`exclusive-mode-lock`) garantiza que si el canal ya está en modo ventas/reservas, restapp no se ejecuta en la misma conversación.
- El orden de intentos debe ser consistente con el negocio del team: si el team es restaurante (`getRestappAccess(...).opsReady`), probar restapp **antes** que ventas genéricas cuando la intención es restaurante; si no, ventas primero.

## Paso 3 — Registrar módulo en el catálogo

En `allsender_channel_modules` insertar la fila `restapp_ai` (mismo formato que `ventas_ia`):

```
module_key: 'restapp_ai'
name: 'RestApp AI · Restaurante'
description: 'Agente de restaurante: menú, pedidos, mesas, reservas, delivery'
channel_type: 'ai_module'
provider: 'codemorf'
is_enabled: true
```

En `plan_module_entitlements` agregar `module_code: 'restapp_ai'` a los planes publicados (31, 32, 33, 34, 36) con `is_allowed: true` — igual que se hizo con `ventas_ia`.

> **Nunca activar el módulo para ningún team sin autorización.** La activación la hace cada cliente desde su panel (self-serve), o super-admin para canales comerciales.

## Paso 4 — Motor CodeMorf (obligatorio)

- `restapp_settings.agent_provider` acepta hoy `'openai' | 'gemini' | 'inherit'` → **forzar `'inherit'`** (hereda el motor global CodeMorf). Eliminar las opciones openai/gemini de la UI de configuración del restaurante.
- El runtime de generación debe resolver `inherit` → `morf_ai_providers` (codemorf, `is_primary`) → `MORF_AI_CODEMORF_API_KEY`. **Nunca** caer a la key global de OpenRouter (sin créditos) ni a keys de openai/gemini.
- `getRestappCatalogForIntelligence` (menú con precio > 0, ordenado) es la fuente de verdad del catálogo para el prompt del agente.

## Paso 5 — Estado de conversación persistente

Replicar el patrón de `sales-ai/conversation-state` para restapp:
- Tabla `restapp_conversation_state` (o `ai_sessions` con `module: 'restapp_ai'`): carrito actual (ítems, cantidades, modificadores), modalidad (delivery/pickup/dine_in), sucursal elegida, dirección, método de pago, fase (explorando → carrito → confirmando → pagando → entregando/reserva → handoff).
- El carrito vive en el estado, **no** en el LLM: cada turno re-hidrata el estado y el ejecutor calcula el total.

## Paso 6 — Retirar el routing viejo

- `processRestappAiAutomationRouting` (devuelve `false` desde que se jubiló el motor externo) debe quedar como no-op documentado o eliminarse; el nuevo camino es el dispatcher del Paso 1-2.
- Revisar `lib/automation/engine.ts` líneas ~623-734: los checks `isRestappAiAutomation` deben seguir silenciando nodos del template conductor (la plantilla `restapp_ai` es solo UI) para que el texto del agente nunca se duplique.

## Paso 7 — Verificación E2E (igual que Venta AI)

1. Team de prueba con `restapp_settings` completo (nombre, setup, agente on) + canal Evolution conectado + menú importado.
2. Flujo 1: "Hola, ¿qué tienen?" → menú por categoría → agregar 2 ítems → cotizar → confirmar → orden `RP-{team}-…` en `restapp_orders` + evento `order.created` al webhook del CRM.
3. Flujo 2: "¿hay mesa para 4 esta noche?" → franjas → reserva creada en `restapp_reservations` + mesa marcada `reserved`.
4. Flujo 3: fuera de cobertura → ofrece recogida; cliente pide persona → handoff.
5. Verificar: un solo módulo activo por canal (no se mezcla con ventas), respuesta solo por CodeMorf, precios calculados por el ejecutor determinista.

## Criterios de aceptación

- [ ] Cliente SaaS de RestApp conecta (handoff → code → api_key), importa su menú, activa módulo y canal, y su agente conversa por los mismos canales que Venta AI.
- [ ] Cero cambios de comportamiento en Venta AI / EcoMarket (team 83) ni en otros teams.
- [ ] Ninguna llamada a proveedores que no sean CodeMorf.
- [ ] Nunca se exponen más de 12 funciones por llamada y nunca se ejecutan todas a la vez.
