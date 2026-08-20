# AllSender — RestApp AI

**Versión:** 1.0.0 · **Estado:** Motor de datos y API en producción · **Agente de conversación:** pendiente de activar (ver `PRODUCCION.md`)

Módulo de **restaurantes** de la plataforma AllSender (auth.allsender.tech). Un agente autónomo que atiende a clientes del restaurante por WhatsApp y otros canales: muestra el menú, recomienda, toma pedidos (delivery / pickup / dine-in), gestiona **mesas y reservas**, cotiza fletes, confirma pagos y coordina con el CRM/POS del restaurante — todo dentro de la conversación.

> Este repositorio contiene el **código fuente del módulo tal como corre en producción** (`lib/modules/restapp-ai/*`, `lib/restapp-connect/*`, `app/api/restapp-ai/*`, `app/api/restapp-connect/*`), más la documentación de cómo llevarlo a producción como agente activo para clientes SaaS. Es un submódulo de la aplicación Next.js de AllSender (imports con alias `@/...`). No es standalone: se integra en `/www/wwwroot/auth.allsender.tech`.

---

## Qué es RestApp AI

**Para restaurantes: mesas, menú, pedidos, reservas y entregas.** El cliente final es el restaurante (SaaS RestApp en `restapp.allsender.tech`); el que conversa con la IA es el cliente del restaurante.

| Área | Qué hace |
|---|---|
| 🍽️ **Menú y catálogo** | Productos, categorías, variantes, modificadores, precios (RD$), stock, alergenos, imágenes |
| 🛎️ **Mesas** | Estado por mesa (libre / reservada / ocupada / limpieza), capacidad, zona (salón/terraza) |
| 📅 **Reservas** | Disponibilidad, franjas horarias, tamaño del grupo, reprogramar, cancelar, lista de espera |
| 🛒 **Pedidos** | Cotización, borrador, agregar/quitar ítems, confirmar, estado, cancelar, repetir, historial |
| 🛵 **Delivery** | Cobertura por sucursal (Haversine), flete, ETA, geocodificación opcional (Google), recogida si está fuera de cobertura |
| 💳 **Pagos** | Métodos (efectivo, transferencia), confirmación, comprobante, propina, dividir cuenta |
| 🎁 **Promociones** | Combos, ofertas, cupones, happy hour |
| 👥 **Clientes** | Identificación por teléfono, historial, preferencias, puntos de lealtad, favoritos |
| 🤝 **Handoff** | Pasar a persona cuando el cliente lo pida o fuera de horario |
| 🔌 **CRM/POS** | Import de menú/mesas/sucursales, webhook de eventos (`order.created`, `reservation.created`), PATCH de estados |

## Cómo funciona el proceso (estado real en producción)

Flujo del dato (lo que ya corre en producción):

```
RestApp SaaS (POS/CRM del restaurante)
        │  POST /api/restapp-ai/v1/import   (menú, mesas, sucursales, categorías, precios)
        │  POST /api/restapp-ai/v1/products · /tables · /branches · /restaurant
        ▼
auth.allsender.tech  →  lib/modules/restapp-ai/
        │   restapp_settings · restapp_menu_items · restapp_tables · restapp_branches
        │   restapp_orders · restapp_reservations · restapp_customers · restapp_activity
        │
        ▼  (eventos)  POST crm_webhook_url   ← order.created / order.updated / reservation.created
RestApp SaaS recibe pedidos/reservas creados por la IA y ejecuta cocina/entrega en su plataforma
```

- **Entrada de datos (inbound):** el POS/CRM del restaurante envía catálogo, mesas y sucursales por la API v1 con Bearer key (reutiliza las API keys de `/settings/developers`). `import-api.ts` hace upsert idempotente por `external_id` o nombre, y re-sincronización de precios segura (nunca borra precios con 0 por omisión).
- **Salida de operaciones (outbound):** el CRM consulta `GET /api/restapp-ai/v1/orders|reservations` o recibe webhooks en `crm_webhook_url` y actualiza estados con `PATCH /orders`.
- **Cotización de delivery:** AllSender estima cobertura y tarifa (Haversine + geocoding opcional); la entrega real la ejecuta la flota/CRM del restaurante (`delivery_mode: 'crm'`).
- **Números de orden:** `RP-{teamId}-{timestamp}` con estados `draft → pending_confirmation → confirmed → accepted → preparing → ready → in_transit → completed` (+ `cancelled` / `rejected`).

### Estado actual (verificado en producción, 2026-08-20)

- ✅ Tablas, CRUD, API v1 (17+ recursos), auth Bearer, import bulk, webhooks CRM, handoff de conexión RestApp, UI del módulo (`/modulo/restapp-ai/*`) y 31 tools del orquestador (`orchestrator.ts` → `RestappToolName`).
- ✅ Conexión RestApp: `lib/restapp-connect/` (código de un solo uso `rc_…` con 15 min de expiración → exchange por API key; handoff HMAC `RESTAPP_CONNECT_SECRET` que auto-registra usuario+team).
- ✅ 4 equipos con `restapp_settings` (76 "Tipicon RD" — 4 órdenes RP-76 y 7 mesas, 83 EcoMarket — activo sin setup, 84 "Caffe ecuador", 86 "El mejor Domplin"); 39 ítems de menú.
- ⛔ **El agente de conversación NO está activo:** `processRestappAiAutomationRouting` en `lib/automation/engine.ts` está **retirado** (devuelve `false`; el motor externo RestaPP/Intelligence se jubiló). El módulo no está en `allsender_channel_modules` ni tiene entitlements por plan. **Ese es exactamente el trabajo de `PRODUCCION.md`: reactivarlo como agente igual que Venta AI.**

## Arquitectura (target: agente activo)

```
app/webhook/* (evolution, zernio, meta, facebook, instagram) + web chat + sms
        │  inbound (mensaje del cliente del restaurante)
        ▼
lib/plugins/ai-chat/service.ts → processAIMessage
        │   exclusive-mode-lock (un módulo activo por canal) + module access
        ▼
lib/modules/restapp-ai/orchestrator.ts → tryHandleRestappAiMessage   ← NUEVO (dispatcher)
        │   intent router (restaurante/menú/mesa/pedido) → dominio(s)
        │   catálogo de 142 funciones (ver CATALOGO_FUNCIONES.md) — invocación selectiva, máx. 12 por llamada
        ▼
lib/modules/restapp-ai/db.ts + import-api.ts (CRUD + CRM webhook + delivery quote)
        ▼
respuesta al canal + evento al CRM/POS del restaurante
```

**Motor LLM:** **CodeMorf es el ÚNICO proveedor oficial** (gateway `https://codemorf.tech/gateway/v1`, modelo `morf-ai-auto`). `agent_provider: 'inherit'` hereda el motor global de la plataforma; **no** se usan keys de openai/gemini/openrouter para clientes.

## Canales (mismos que Venta AI)

- **Auto-activación por prueba (costo cero):** `web_chat`, `sms`, `whatsapp_evolution`, `instagram_dm`, `facebook_messenger`.
- **Activación comercial (solo super-admin):** `zernio_*`, `whatsapp_business_api_pro`, `email`, `tiktok_dm`.
- Cada cliente activa su propio módulo desde su panel. Nada se activa sin autorización.
- Regla de oro: **un solo módulo activo por canal, no se combinan en la misma conversación.**

## Conexión del cliente (RestApp → AllSender, ya existente)

1. El cliente inicia en RestApp SaaS (`restapp.allsender.tech`) y pulsa "Conectar AllSender AI".
2. RestApp genera un token handoff (HMAC con `RESTAPP_CONNECT_SECRET`) → `connectRestappAction` emite código de un solo uso `rc_…` (15 min) → redirige de vuelta a RestApp con `allsender_code`.
3. RestApp llama `POST /api/restapp-connect/exchange` → recibe `api_key` (Bearer), `team_id` y `plan_name`.
4. El POS/CRM del restaurante importa menú/mesas/sucursales con `POST /api/restapp-ai/v1/import` usando la api_key.
5. El cliente activa el módulo RestApp AI en su panel y conecta el canal (WhatsApp Evolution, Meta, etc.).

## API v1 (resumen)

Base: `https://auth.allsender.tech/api/restapp-ai/v1` · Auth: `Authorization: Bearer sk_live_…`

| Método | Recurso | Uso |
|---|---|---|
| `GET` | `menu`, `products`, `categories`, `modifiers`, `tables`, `branches`, `customers`, `promotions`, `orders`, `reservations`, `activity`, `dashboard` | Consulta del CRM / panel |
| `GET` | `delivery-quote?lat=&lng=&address=&branch_id=` | Cotización de entrega |
| `POST` | `import` | Import bulk: restaurant, branches, categories, products, tables |
| `POST` | `products`, `tables`, `branches`, `restaurant` | Upsert individual |
| `POST` | `prices` | Re-sync de precios (`sync_prices: true`) |
| `PATCH` | `orders` | `{ id, status, external_id }` — estados desde CRM |
| `GET` | `openapi.json` | OpenAPI vivo |

Eventos webhook al CRM: `order.created`, `order.updated`, `reservation.created` (cabecera `X-AllSender-Event`).

## Configuración (variables de entorno)

| Variable | Uso |
|---|---|
| `RESTAPP_CONNECT_SECRET` | Firma HMAC del handoff RestApp (intercambio de código + exchange) |
| `MORF_AI_CODEMORF_API_KEY` | **Única** clave LLM oficial (gateway codemorf). OpenRouter/OpenAI/Gemini = legacy deshabilitado, **no** se usan para clientes |
| `GOOGLE_MAPS_API_KEY` (opcional) | Geocodificación de direcciones para cotizar delivery |
| `ALLSENDER_INTELLIGENCE_*` | Motor IA externo (api.allsender.tech) — solo si se usa el puente externo |

## Documentación relacionada

- `ROADMAP.md` — qué está hecho, qué falta para producción como Venta AI, backlog.
- `PRODUCCION.md` — plan técnico paso a paso para activar el agente (patrón Venta AI).
- `CATALOGO_FUNCIONES.md` — catálogo de **142 funciones** con invocación selectiva (nunca todas a la vez).

## Licencia

© CodeMorf. Ver `LICENSE`.
