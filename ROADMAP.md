# Roadmap — RestApp AI

## ✅ Hecho (producción, v1.0.0)

- [x] Tablas `restapp_*` con auto-migración: settings, menu_items, categories, modifiers, tables, branches, orders, reservations, customers, activity, promotions, faqs, team
- [x] CRUD completo (`crud.ts`) + consultas (`db.ts`): menú, mesas, sucursales, pedidos, reservas, clientes
- [x] API v1 (`/api/restapp-ai/v1`): 17+ recursos, auth Bearer (reutiliza API keys de developers), import bulk idempotente por `external_id`, re-sync de precios seguro
- [x] Cotización de delivery: cobertura por sucursal (Haversine), flete, ETA, geocoding opcional, `delivery_mode: 'crm'`
- [x] Webhooks al CRM del restaurante: `order.created`, `order.updated`, `reservation.created` + PATCH de estados desde CRM
- [x] Conexión RestApp: código de un solo uso `rc_…` → exchange por API key; handoff HMAC con auto-registro de usuario+team
- [x] UI del módulo: `/modulo/restapp-ai/*` (Dashboard, Pedidos, Reservas, Mesas, Menú, Productos, Sucursales, Clientes, Equipo, FAQ, Parámetros, Configuración, API)
- [x] 31 tools del orquestador (`RestappToolName` en `orchestrator.ts`) — base real del catálogo de funciones
- [x] `ai-flow-router` reconoce intención de restaurante (menú, mesa, reserva, comida…) y template de automatización `restapp_ai`
- [x] 4 equipos con settings (76, 83, 84, 86) · 39 ítems de menú · 7 mesas · 4 órdenes RP-76 (verificados en DB)

## 🔄 Para llevar a producción como Venta AI (plan detallado en `PRODUCCION.md`)

- [ ] **Dispatcher del agente:** `tryHandleRestappAiMessage` en `orchestrator.ts` (análogo a `tryHandleSalesAiMessage`) y su llamada en `lib/plugins/ai-chat/service.ts` dentro de `processAIMessage`
- [ ] **Registro de módulo:** fila `restapp_ai` en `allsender_channel_modules` (catálogo de módulos self-serve) con descripción y precio
- [ ] **Entitlements por plan:** `plan_module_entitlements` → `restapp_ai` en los planes publicados (Gratis, Básico, Emprendedor, Profesional, Empresa Full)
- [ ] **Gating de runtime:** `getRestappAccess` (ya existe) + `exclusive-mode-lock` (un módulo por canal) + `hasModuleAccess(['restapp_ai'])`
- [ ] **Motor CodeMorf:** forzar `agent_provider: 'inherit'` → gateway codemorf; eliminar opciones openai/gemini del panel RestApp
- [ ] **Catálogo de 142 funciones** (`CATALOGO_FUNCIONES.md`) con invocación selectiva: máx. 12 tools por llamada, por dominio/fase, nunca todas a la vez
- [ ] **Retirar el routing retirado:** eliminar/marcar `processRestappAiAutomationRouting` (hoy devuelve `false`) para que el nuevo dispatcher sea el único camino
- [ ] **Estado de conversación:** persistir carrito/reserva por chat (patrón `conversation-state` de sales-ai)
- [ ] **Verificación E2E en vivo** (como Venta AI): pedido + reserva de mesa + agregar ítem en la conversación, por canal Evolution
- [ ] **Docs API actualizadas** en `/admin/settings/docs/api/v2` (o página RestApp existente)

## 🔜 Próximo (backlog)

- [ ] Pedidos programados y franjas de entrega por hora
- [ ] Dividir cuenta / pago en línea dentro de la conversación
- [ ] Lista de espera con notificación automática cuando se libere mesa
- [ ] Puntos de lealtad canjeables desde el chat
- [ ] Integración TikTok DM / Email como canal (requiere activación comercial)
- [ ] Dashboard de métricas del agente (conversión, ticket promedio, reservas)
- [ ] Pruebas automatizadas E2E del pipeline (webhook → IA → orden/reserva → CRM)

## Regla de oro

> **Un solo módulo activo por canal, no se combinan en la misma conversación.**
> **CodeMorf es el ÚNICO proveedor oficial** — ningún otro proveedor se ofrece a clientes.
