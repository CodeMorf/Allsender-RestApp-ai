# Catálogo de funciones — RestApp AI (142 funciones)

> **Regla fundamental: NUNCA se llaman todas las funciones a la vez.** El runtime expone como máximo **12 funciones por llamada al LLM**, elegidas por dominio + fase de conversación. Las funciones de escritura (confirmar pedido, crear reserva, canjear puntos…) solo se ejecutan tras confirmación explícita del cliente. Las funciones de solo lectura e independientes pueden correr en paralelo (máx. 3); las de escritura siempre en secuencia.

## Cómo se elige qué funciones se exponen

1. **Intención** → `intent-router` clasifica el mensaje (patrones de restaurante ya en `ai-flow-router.ts`).
2. **Dominios activos:** 1-2 dominios según intención + el **dominio base** siempre presente (menú.buscar, pedido.resumen, faq, handoff).
3. **Fase de conversación** (estado persistente) recorta más: en fase `confirmando` solo se exponen funciones de pedidos+pagos; en fase `reserva` solo mesas+reservas+clientes.
4. **Reglas de seguridad:** escritura requiere confirmación; nunca se exponen funciones de otro dominio fuera de contexto; `when_not_to_use` es instrucción directa para el LLM.

### Tabla de dominios → máx. tools por llamada

| Dominio | # funciones | Exposición típica |
|---|---|---|
| A. menú | 16 | siempre que aplique intención de comida (base) |
| B. recomendación | 10 | al inicio de conversación / venta cruzada |
| C. sucursales | 9 | pedido con delivery o pregunta de ubicación |
| D. pedidos | 20 | fase carrito/confirmación (base: pedido.resumen) |
| E. delivery | 10 | solo si modalidad delivery |
| F. mesas y reservas | 15 | intención "mesa/reserva" |
| G. clientes | 13 | identificación (teléfono) al inicio |
| H. pagos | 9 | fase confirmación/pos-pedido |
| I. promociones | 8 | intención promo/cupón o fase explorando |
| J. handoff y equipo | 7 | siempre (base, para escalar) |
| K. faq y soporte | 7 | siempre (base) |
| L. crm/pos | 12 | solo runtime interno / super-admin |
| M. reportes | 6 | solo panel / super-admin |

---

## A. MENÚ (16)

| # | id | descripción (para el LLM) | params clave | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 1 | `restapp.menu.search` | Busca productos por texto (nombre, descripción, categoría, ingredientes, tags). Devuelve hasta `limit` ítems con precio, categoría, imágenes, flags (picante, vegano…). | `q`, `limit`(≤5) | El cliente pregunta por un plato o cosa de comer | El cliente ya eligió producto | read |
| 2 | `restapp.menu.get_categories` | Lista categorías del menú (Entradas, Platos, Postres, Bebidas…). | — | El cliente pregunta "¿qué tienen?" | El cliente pide algo específico | read |
| 3 | `restapp.menu.get_item` | Detalle completo de un producto por `product_id` o `name`. | `product_id` o `name` | El cliente pide detalle/precio de un plato | — | read |
| 4 | `restapp.menu.get_variants` | Variantes del producto (tamaño, presentación, combo). | `product_id` | Hay que preguntar "¿tamaño?" | El producto no tiene variantes | read |
| 5 | `restapp.menu.get_modifiers` | Modificadores disponibles (ingredientes extra, temperatura, agregados). | — | Personalizar un ítem del pedido | — | read |
| 6 | `restapp.menu.check_availability` | Stock/disponibilidad de un producto. | `product_id` | Confirmar que un plato se puede pedir | — | read |
| 7 | `restapp.menu.get_images` | Imágenes de productos (hasta 5). | `product_id`, `q`, `limit` | Mostrar fotos del menú | — | read |
| 8 | `restapp.menu.send_image` | Envía imagen del producto al chat del cliente. | `product_id`, `q` | El cliente pide ver el plato | Sin imagen disponible | write |
| 9 | `restapp.menu.filter_by_preferences` | Filtra menú por preferencias: `no_spicy`, `vegetarian`, `vegan`. | flags | Cliente con restricción alimentaria | — | read |
| 10 | `restapp.menu.filter_by_budget` | Filtra por presupuesto (`budget_min`/`budget_max`). | rangos | Cliente da un presupuesto | — | read |
| 11 | `restapp.menu.filter_by_ingredient` | Busca por ingrediente (pollo, queso, camarones…). | `ingredient` | Cliente pide "algo con X" | — | read |
| 12 | `restapp.menu.get_combo_details` | Detalle de combos (qué incluye, precio, ahorro). | `product_id` | Promover o explicar un combo | — | read |
| 13 | `restapp.menu.get_menu_by_category` | Menú completo de una categoría. | `category` | Navegación por categorías | — | read |
| 14 | `restapp.menu.get_chef_suggestions` | Sugerencias del chef (si el restaurante las marca). | — | Cliente sin idea de qué pedir | — | read |
| 15 | `restapp.menu.get_bestsellers` | Productos más vendidos / recomendados del restaurante. | `limit` | Recomendar al inicio | — | read |
| 16 | `restapp.menu.get_new_items` | Novedades del menú. | `limit` | Cliente pregunta "¿qué hay nuevo?" | — | read |

## B. RECOMENDACIÓN (10)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 17 | `restapp.recommend.personalized` | Recomienda según historial del cliente + preferencias + hora del día. | `customer_phone` | Cliente habitual pide sugerencia | — | read |
| 18 | `restapp.recommend.by_occasion` | Sugiere menú para ocasión (cumpleaños, cita, negocio). | `occasion`, `party_size` | Cliente menciona ocasión | — | read |
| 19 | `restapp.recommend.pair_with` | Qué combina con un producto (bebida, postre, acompañamiento). | `product_id` | Venta cruzada suave | Cliente ya confirmó todo | read |
| 20 | `restapp.recommend.upsell` | Ofrece upgrade (combo, tamaño grande) sin presionar. | `product_id`, `context` | Ítem en carrito | Cliente rechazó ya el upgrade | read |
| 21 | `restapp.recommend.cross_sell` | Acompañamientos del pedido (papas, bebidas, salsas). | `items` | Pedido casi completo | — | read |
| 22 | `restapp.recommend.budget_meal` | Menú completo dentro de presupuesto. | `budget_max`, `party_size` | Cliente da presupuesto total | — | read |
| 23 | `restapp.recommend.group_menu` | Menú sugerido para grupo/mesa. | `party_size` | Reserva o dine-in de grupo | — | read |
| 24 | `restapp.recommend.allergen_safe` | Opciones sin alergenos (maní, gluten, lácteos, mariscos). | `allergen` | Cliente con alergia | — | read |
| 25 | `restapp.recommend.vegetarian_meal` | Opciones vegetarianas/veganas. | `type` | Cliente vegetariano/vegano | — | read |
| 26 | `restapp.recommend.daily_deal` | Oferta del día / especial. | — | Promover el especial | — | read |

## C. SUCURSALES (9)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 27 | `restapp.branch.resolve` | Resuelve la sucursal del pedido (por id o la activa). | `branch_id` | Multi-sucursal | Una sola sucursal | read |
| 28 | `restapp.branch.nearest` | Sucursal más cercana a lat/lng. | `lat`, `lng` | Cliente pide la más cercana | — | read |
| 29 | `restapp.branch.location` | Ubicación (dirección, teléfono, maps_url). | `branch_id` | Cliente pide dirección | — | read |
| 30 | `restapp.branch.send_location` | Envía la ubicación (maps) al chat. | `branch_id` | Cliente pide cómo llegar | — | write |
| 31 | `restapp.branch.schedule` | Horario de la sucursal. | `branch_id` | Pregunta de horario | — | read |
| 32 | `restapp.branch.coverage` | Valida si una ubicación está en cobertura de entrega. | `lat`, `lng` | Antes de cotizar delivery | — | read |
| 33 | `restapp.branch.handoff_hours` | Horario de atención humana (handoff). | — | Fuera de horario / cliente pide persona | — | read |
| 34 | `restapp.branch.list` | Lista sucursales activas. | — | Cliente pregunta cuáles hay | — | read |
| 35 | `restapp.branch.eta` | Tiempo estimado de entrega desde la sucursal. | `branch_id`, `lat`, `lng` | Cliente pregunta cuánto tarda | — | read |

## D. PEDIDOS (20)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 36 | `restapp.order.quote` | Cotiza el pedido actual (subtotal, impuesto, flete, total). **Siempre calcula el ejecutor, nunca el LLM.** | `items`, `delivery_fee`, `discount` | Antes de confirmar | — | read |
| 37 | `restapp.order.create_draft` | Crea borrador de pedido (carrito). | `modality`, `branch_id` | Primer ítem agregado | — | write |
| 38 | `restapp.order.add_item` | Agrega ítem al pedido. | `product_id`, `qty`, `modifiers`, `customizations` | Cliente pide un plato | — | write |
| 39 | `restapp.order.remove_item` | Quita ítem del pedido. | `product_id` o `item_index` | Cliente se arrepiente | — | write |
| 40 | `restapp.order.update_item_qty` | Cambia cantidad de un ítem. | `product_id`, `qty` | Corregir cantidad | — | write |
| 41 | `restapp.order.apply_customizations` | Personalizaciones por ítem (sin cebolla, extra queso…). | `product_id`, `customizations[]` | Cliente personaliza | — | write |
| 42 | `restapp.order.confirm` | **Confirma el pedido** → crea `restapp_orders` con nº `RP-{team}-{ts}` y notifica webhook `order.created`. | `customer_name`, `customer_phone`, `modality`, `items`, `payment_method` | **Solo tras confirmación explícita del cliente** | El cliente aún no confirmó | write |
| 43 | `restapp.order.status` | Estado actual del pedido por `order_number`. | `order_number` | Cliente pregunta por su pedido | — | read |
| 44 | `restapp.order.cancel` | Cancela pedido (libera mesa si era dine-in). | `order_id` | Cliente pide cancelar | Pedido ya completado | write |
| 45 | `restapp.order.reorder` | Repite un pedido anterior del cliente. | `customer_phone` | Cliente habitual | — | write |
| 46 | `restapp.order.history` | Historial de pedidos del cliente. | `customer_phone`, `limit` | Cliente pregunta qué pidió antes | — | read |
| 47 | `restapp.order.track` | Seguimiento/ETA del pedido. | `order_number` | Cliente pregunta dónde está su pedido | — | read |
| 48 | `restapp.order.modify` | Modifica pedido en preparación (si el restaurante lo permite). | `order_id`, `changes` | Cliente quiere cambiar algo ya confirmado | Pedido completado | write |
| 49 | `restapp.order.schedule` | Pedido programado (día/hora futura). | `reserved_at`, `items` | Cliente agenda su pedido | — | write |
| 50 | `restapp.order.summary` | **Resumen del carrito actual** (ítems, cantidades, total). | — | **Dominio base: siempre disponible** | — | read |
| 51 | `restapp.order.verify_items` | Verifica ítems y precios del pedido antes de confirmar. | — | Paso previo a confirmación | — | read |
| 52 | `restapp.order.minimum_check` | Valida monto mínimo de pedido. | `items` | Pedido pequeño | — | read |
| 53 | `restapp.order.pickup_ready` | Avisa que el pedido está listo para recoger (dine-in/pickup). | `order_id` | Estado del restaurante | — | read |
| 54 | `restapp.order.completed` | Marca pedido completado/recibido. | `order_id` | Cliente confirma recepción | — | write |
| 55 | `restapp.order.notes` | Agrega nota al pedido (instrucciones). | `order_id`, `note` | Cliente da instrucciones | — | write |

## E. DELIVERY (10)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 56 | `restapp.delivery.validate_address` | Valida dirección del cliente. | `address` | Modalidad delivery | Modalidad pickup/dine-in | read |
| 57 | `restapp.delivery.geocode` | Geocodifica dirección (lat/lng) — opcional. | `address` | Sin lat/lng y se necesita cobertura | — | read |
| 58 | `restapp.delivery.fee` | Calcula flete según sucursal y distancia. | `branch_id`, `lat`, `lng` | Cotización de delivery | — | read |
| 59 | `restapp.delivery.coverage` | Dentro/fuera de cobertura con mensaje. | `lat`, `lng`, `branch_id` | Antes de confirmar entrega | — | read |
| 60 | `restapp.delivery.offer_pickup` | Ofrece recogida si está fuera de cobertura. | `branch_id` | Fuera de cobertura | Dentro de cobertura | read |
| 61 | `restapp.delivery.eta` | Tiempo estimado de entrega. | `branch_id`, `lat`, `lng` | Cliente pregunta cuánto tarda | — | read |
| 62 | `restapp.delivery.courier_handoff` | Transfiere el pedido a la flota/CRM (delivery_mode: crm). | `order_id` | Pedido confirmado con entrega | — | write |
| 63 | `restapp.delivery.update_contact` | Actualiza teléfono/dirección de entrega. | `order_id`, `phone`, `address` | Cliente corrige datos | — | write |
| 64 | `restapp.delivery.time_slot` | Franja horaria de entrega. | `order_id`, `slot` | Cliente elige franja | — | write |
| 65 | `restapp.delivery.tip` | Agrega propina al pedido. | `order_id`, `amount` | Cliente quiere propinar | — | write |

## F. MESAS Y RESERVAS (15)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 66 | `restapp.table.check_availability` | Mesas libres ahora (con capacidad). | `party_size`, `zone` | Cliente pide mesa | — | read |
| 67 | `restapp.table.list_slots` | Franjas disponibles para hoy/fecha. | `date`, `party_size` | Cliente quiere reservar | — | read |
| 68 | `restapp.table.by_party_size` | Mesas por tamaño de grupo. | `party_size` | Grupo grande/pequeño | — | read |
| 69 | `restapp.table.by_zone` | Mesas por zona (salón, terraza, VIP). | `zone` | Cliente prefiere zona | — | read |
| 70 | `restapp.reservation.create` | **Crea reserva** → `restapp_reservations` + mesa `reserved` + webhook `reservation.created`. | `customer_name`, `customer_phone`, `party_size`, `reserved_at`, `table_code` | **Solo tras confirmación explícita** | Cliente aún no confirma | write |
| 71 | `restapp.reservation.confirm` | Confirma reserva pendiente. | `reservation_id` | Reserva pendiente de confirmación | — | write |
| 72 | `restapp.reservation.reschedule` | Reprograma reserva a otra fecha/hora. | `reservation_id`, `reserved_at` | Cliente cambia fecha | — | write |
| 73 | `restapp.reservation.cancel` | Cancela reserva (libera mesa). | `reservation_id` | Cliente cancela | Reserva ya pasó | write |
| 74 | `restapp.reservation.status` | Estado de la reserva. | `reservation_id` | Cliente pregunta por su reserva | — | read |
| 75 | `restapp.reservation.party_size` | Actualiza número de personas. | `reservation_id`, `party_size` | Grupo cambia de tamaño | — | write |
| 76 | `restapp.reservation.special_requests` | Solicitudes especiales (pastel, decoración, silla bebé). | `reservation_id`, `requests` | Cliente pide algo especial | — | write |
| 77 | `restapp.reservation.waitlist` | Consulta lista de espera de una fecha/hora. | `date`, `party_size` | Sin mesas disponibles | — | read |
| 78 | `restapp.reservation.join_waitlist` | Une al cliente a la lista de espera. | `customer_name`, `customer_phone`, `party_size`, `date` | Sin disponibilidad | — | write |
| 79 | `restapp.table.assign` | Asigna mesa al llegar (dine-in). | `table_code`, `reservation_id` | Cliente llega al restaurante | — | write |
| 80 | `restapp.table.release` | Libera mesa (cuenta cerrada). | `table_code` | Cliente se va | — | write |

## G. CLIENTES Y LEALTAD (13)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 81 | `restapp.customer.identify` | Identifica cliente por teléfono. | `phone` | Al inicio de conversación | — | read |
| 82 | `restapp.customer.register` | Registra nuevo cliente. | `name`, `phone` | Cliente nuevo | Cliente ya existe | write |
| 83 | `restapp.customer.profile` | Perfil (nombre, teléfono, dirección, preferencias). | `customer_id` | Personalizar atención | — | read |
| 84 | `restapp.customer.history` | Historial de pedidos del cliente. | `customer_id`, `limit` | Cliente habitual | — | read |
| 85 | `restapp.customer.preferences` | Preferencias guardadas (sabor, pedidos típicos). | `customer_id` | Recomendar | — | read |
| 86 | `restapp.customer.favorites` | Favoritos del cliente. | `customer_id` | Sugerir rápido | — | read |
| 87 | `restapp.customer.loyalty_points` | Puntos de lealtad del cliente. | `customer_id` | Cliente pregunta por puntos | — | read |
| 88 | `restapp.customer.redeem_points` | Canjea puntos por descuento/producto. | `customer_id`, `points` | **Tras confirmación** | — | write |
| 89 | `restapp.customer.tier` | Nivel del cliente (regular, VIP). | `customer_id` | Cliente VIP | — | read |
| 90 | `restapp.customer.visit_count` | Número de visitas. | `customer_id` | Cliente habitual | — | read |
| 91 | `restapp.customer.notes` | Notas internas (alergias, preferencias). | `customer_id` | Registrar contexto | — | write |
| 92 | `restapp.customer.update_profile` | Actualiza datos del cliente. | `customer_id`, campos | Cliente corrige datos | — | write |
| 93 | `restapp.customer.total_spent` | Total gastado históricamente. | `customer_id` | Cliente VIP / lealtad | — | read |

## H. PAGOS (9)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 94 | `restapp.payment.methods` | Métodos disponibles (efectivo, transferencia, tarjeta). | — | Antes de confirmar pedido | — | read |
| 95 | `restapp.payment.select` | Selecciona método de pago. | `method` | Cliente elige cómo paga | — | write |
| 96 | `restapp.payment.confirm_transfer` | Confirma transferencia bancaria. | `order_id`, `reference` | Cliente transfirió | — | write |
| 97 | `restapp.payment.read_proof` | Lee y valida comprobante de pago (imagen). | `image_url` | Cliente envía foto del comprobante | — | read |
| 98 | `restapp.payment.status` | Estado del pago del pedido. | `order_id` | Cliente pregunta si llegó el pago | — | read |
| 99 | `restapp.payment.pending_notify` | Notifica pago pendiente al cliente. | `order_id` | Pago no llegó | — | write |
| 100 | `restapp.payment.split_bill` | Divide cuenta entre personas. | `order_id`, `parts` | Grupo pide dividir | — | write |
| 101 | `restapp.payment.tip_add` | Agrega propina al total. | `order_id`, `amount` | Cliente propina | — | write |
| 102 | `restapp.payment.refund` | Reembolso (solo super-admin). | `order_id`, `amount` | Reclamo validado | — | write |

## I. PROMOCIONES (8)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 103 | `restapp.promo.list` | Promociones activas. | — | Cliente pregunta por ofertas | — | read |
| 104 | `restapp.promo.apply` | Aplica promoción al pedido. | `promo_id`, `order_id` | Promo aplicable | **Sin confirmar** | write |
| 105 | `restapp.promo.coupon` | Valida cupón de descuento. | `code` | Cliente tiene cupón | — | read |
| 106 | `restapp.promo.daily` | Oferta del día. | — | Promover especial | — | read |
| 107 | `restapp.promo.happy_hour` | Horario y ofertas de happy hour. | — | Pregunta de happy hour | — | read |
| 108 | `restapp.promo.combos` | Combos en promoción. | — | Promover combos | — | read |
| 109 | `restapp.promo.validate` | Valida si un ítem aplica a una promo. | `product_id`, `promo_id` | Antes de aplicar | — | read |
| 110 | `restapp.promo.expiring` | Promos por vencer hoy. | — | Impulso de cierre | — | read |

## J. HANDOFF Y EQUIPO (7)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 111 | `restapp.handoff.request_human` | **Pausa la IA y pasa a persona** (notifica al equipo, registra handoff). | `reason` | Cliente pide persona / queja / fuera de horario | — | write |
| 112 | `restapp.handoff.notify_kitchen` | Notifica a cocina (pedido especial, urgencia). | `order_id`, `note` | Pedido requiere acción de cocina | — | write |
| 113 | `restapp.handoff.notify_staff` | Notifica a personal (mesero) en dine-in. | `table_code`, `note` | Cliente en sala pide algo | — | write |
| 114 | `restapp.handoff.check_availability` | ¿Hay humano disponible ahora? | — | Antes de ofrecer handoff | — | read |
| 115 | `restapp.handoff.schedule` | Horario de atención humana. | — | Cliente pregunta cuándo hay persona | — | read |
| 116 | `restapp.staff.on_shift` | Personal en turno (meseros, cocina). | — | Coordinación interna | — | read |
| 117 | `restapp.staff.call_manager` | Escala a gerente. | `reason` | Reclamo/incidente | — | write |

## K. FAQ Y SOPORTE (7)

| # | id | descripción | params | usar cuando | NO usar cuando | tipo |
|---|---|---|---|---|---|---|
| 118 | `restapp.faq.search` | Busca FAQ del restaurante. | `q` | Preguntas comunes | — | read |
| 119 | `restapp.faq.allergens` | Política de alergenos e ingredientes. | — | Cliente pregunta por alergias | — | read |
| 120 | `restapp.faq.hours` | Horarios de apertura/cierre. | — | Pregunta de horario | — | read |
| 121 | `restapp.faq.policies` | Políticas (devoluciones, demoras, cancelaciones). | — | Pregunta de políticas | — | read |
| 122 | `restapp.faq.contact` | Datos de contacto (teléfono, email, redes). | — | Cliente pide contacto | — | read |
| 123 | `restapp.faq.parking` | Estacionamiento. | — | Pregunta de estacionamiento | — | read |
| 124 | `restapp.faq.services` | Otros servicios (wifi, pet-friendly, accesibilidad). | — | Pregunta de servicios | — | read |

## L. CRM/POS — INTEGRACIÓN (12) — solo runtime interno / super-admin

| # | id | descripción | params | tipo |
|---|---|---|---|---|
| 125 | `restapp.crm.sync_menu` | Sincroniza menú desde el POS/CRM (bulk import idempotente). | `items[]` | write |
| 126 | `restapp.crm.sync_prices` | Re-sincroniza precios (nunca borra precios con 0 por omisión). | `products[]` | write |
| 127 | `restapp.crm.sync_tables` | Sincroniza mesas desde el POS. | `tables[]` | write |
| 128 | `restapp.crm.sync_branches` | Sincroniza sucursales. | `branches[]` | write |
| 129 | `restapp.crm.webhook_notify` | Envía evento al webhook del CRM (`order.created`, `reservation.created`). | `event`, `payload` | write |
| 130 | `restapp.crm.external_id` | Vincula ID externo a entidad (pedido/producto/mesa). | `entity`, `id`, `external_id` | write |
| 131 | `restapp.crm.delivery_mode` | Configura quién ejecuta la entrega (`crm` / flota). | `mode` | write |
| 132 | `restapp.crm.import_restaurant` | Importa datos esenciales del restaurante (nombre, dirección, moneda, impuestos). | `restaurant{}` | write |
| 133 | `restapp.crm.status_patch` | Actualiza estado de pedido desde el CRM. | `order_id`, `status`, `external_id` | write |
| 134 | `restapp.crm.inventory` | Stock real desde el POS. | `items[]` | write |
| 135 | `restapp.crm.pull_orders` | Trae pedidos creados en el CRM (para el panel AllSender). | `since` | read |
| 136 | `restapp.crm.pos_receipt` | Enlace a recibo del POS para el cliente. | `order_id` | read |

## M. REPORTES (6) — solo panel / super-admin

| # | id | descripción | params | tipo |
|---|---|---|---|---|
| 137 | `restapp.report.dashboard` | Resumen del día (ventas, pedidos, reservas, mesas, agotados). | — | read |
| 138 | `restapp.report.sales_today` | Ventas de hoy (total, ticket promedio). | — | read |
| 139 | `restapp.report.reservations_today` | Reservas de hoy (hechas y pendientes). | — | read |
| 140 | `restapp.report.tables_status` | Estado actual de todas las mesas. | — | read |
| 141 | `restapp.report.out_of_stock` | Productos agotados o sin stock. | `limit` | read |
| 142 | `restapp.report.activity` | Actividad reciente (pedidos, reservas, imports). | `limit` | read |

---

## Mapeo con las tools existentes (orchestrator.ts, 31 tools)

Las 31 tools actuales ya implementan la base de este catálogo; el resto son especializaciones para el agente conversacional:

| Tool actual | → Catálogo |
|---|---|
| `search_menu` / `search_products_by_preferences` / `get_popular_products` / `recommend_products` | #1, #9, #10, #11, #15, #17 |
| `get_categories` / `get_menu_item` / `get_product_variants` / `get_product_modifiers` | #2, #3, #4, #5 |
| `check_item_availability` / `get_product_images` / `send_product_image` | #6, #7, #8 |
| `get_promotions` | #103 |
| `resolve_branch` / `get_nearest_branch` / `get_branch_location` / `send_branch_location` / `get_branch_schedule` | #27, #28, #29, #30, #31 |
| `validate_delivery_area` / `calculate_delivery_fee` | #32, #58, #59 |
| `calculate_order_quote` / `create_order_draft` / `confirm_order` / `get_order_status` / `cancel_order` | #36, #37, #42, #43, #44 |
| `check_table_availability` / `list_available_slots` / `create_reservation` / `get_reservation_status` | #66, #67, #70, #74 |
| `get_faqs` / `request_human_handoff` | #118, #111 |

## Formato de implementación sugerido (registro de funciones)

```ts
type RestappFunction = {
  id: string;              // 'restapp.menu.search'
  domain: 'menu' | 'recommend' | 'branch' | 'order' | 'delivery' | 'table' | 'reservation'
        | 'customer' | 'payment' | 'promo' | 'handoff' | 'faq' | 'crm' | 'report';
  description: string;     // para el LLM
  params: Record<string, unknown>; // JSON schema
  when_to_use: string;     // instrucción al LLM
  when_not_to_use: string; // instrucción al LLM
  kind: 'read' | 'write';
  cost: 'cheap' | 'expensive'; // las caras (menú completo, dashboard) se cachean por turno
  phase: string[];         // fases de conversación donde aplica
};
```

El runtime selecciona: `functions.filter(f => f.domain ∈ dominiosActivos && f.phase.includes(faseActual))` → recorta a 12 → expone. Las `read` independientes pueden ir en paralelo (máx. 3); las `write` siempre secuenciales y tras confirmación explícita.
