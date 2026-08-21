import 'server-only';

export type RestappToolKind = 'read' | 'write';
export type RestappToolVisibility = 'llm' | 'internal' | 'admin';
export type RestappConversationPhase =
  | 'exploring'
  | 'ordering'
  | 'confirming'
  | 'delivery'
  | 'reservation'
  | 'payment'
  | 'support'
  | 'internal';

export type RestappAgentToolDefinition = {
  id: string;
  llmName: string;
  domain: string;
  kind: RestappToolKind;
  visibility: RestappToolVisibility;
  requiresConfirmation: boolean;
  description: string;
  parameters: Record<string, unknown>;
};

const IDS = [
  'restapp.menu.search','restapp.menu.get_categories','restapp.menu.get_item','restapp.menu.get_variants','restapp.menu.get_modifiers','restapp.menu.check_availability','restapp.menu.get_images','restapp.menu.send_image','restapp.menu.filter_by_preferences','restapp.menu.filter_by_budget','restapp.menu.filter_by_ingredient','restapp.menu.get_combo_details','restapp.menu.get_menu_by_category','restapp.menu.get_chef_suggestions','restapp.menu.get_bestsellers','restapp.menu.get_new_items',
  'restapp.recommend.personalized','restapp.recommend.by_occasion','restapp.recommend.pair_with','restapp.recommend.upsell','restapp.recommend.cross_sell','restapp.recommend.budget_meal','restapp.recommend.group_menu','restapp.recommend.allergen_safe','restapp.recommend.vegetarian_meal','restapp.recommend.daily_deal',
  'restapp.branch.resolve','restapp.branch.nearest','restapp.branch.location','restapp.branch.send_location','restapp.branch.schedule','restapp.branch.coverage','restapp.branch.handoff_hours','restapp.branch.list','restapp.branch.eta',
  'restapp.order.quote','restapp.order.create_draft','restapp.order.add_item','restapp.order.remove_item','restapp.order.update_item_qty','restapp.order.apply_customizations','restapp.order.confirm','restapp.order.status','restapp.order.cancel','restapp.order.reorder','restapp.order.history','restapp.order.track','restapp.order.modify','restapp.order.schedule','restapp.order.summary','restapp.order.verify_items','restapp.order.minimum_check','restapp.order.pickup_ready','restapp.order.completed','restapp.order.notes',
  'restapp.delivery.validate_address','restapp.delivery.geocode','restapp.delivery.fee','restapp.delivery.coverage','restapp.delivery.offer_pickup','restapp.delivery.eta','restapp.delivery.courier_handoff','restapp.delivery.update_contact','restapp.delivery.time_slot','restapp.delivery.tip',
  'restapp.table.check_availability','restapp.table.list_slots','restapp.table.by_party_size','restapp.table.by_zone','restapp.reservation.create','restapp.reservation.confirm','restapp.reservation.reschedule','restapp.reservation.cancel','restapp.reservation.status','restapp.reservation.party_size','restapp.reservation.special_requests','restapp.reservation.waitlist','restapp.reservation.join_waitlist','restapp.table.assign','restapp.table.release',
  'restapp.customer.identify','restapp.customer.register','restapp.customer.profile','restapp.customer.history','restapp.customer.preferences','restapp.customer.favorites','restapp.customer.loyalty_points','restapp.customer.redeem_points','restapp.customer.tier','restapp.customer.visit_count','restapp.customer.notes','restapp.customer.update_profile','restapp.customer.total_spent',
  'restapp.payment.methods','restapp.payment.select','restapp.payment.confirm_transfer','restapp.payment.read_proof','restapp.payment.status','restapp.payment.pending_notify','restapp.payment.split_bill','restapp.payment.tip_add','restapp.payment.refund',
  'restapp.promo.list','restapp.promo.apply','restapp.promo.coupon','restapp.promo.daily','restapp.promo.happy_hour','restapp.promo.combos','restapp.promo.validate','restapp.promo.expiring',
  'restapp.handoff.request_human','restapp.handoff.notify_kitchen','restapp.handoff.notify_staff','restapp.handoff.check_availability','restapp.handoff.schedule','restapp.staff.on_shift','restapp.staff.call_manager',
  'restapp.faq.search','restapp.faq.allergens','restapp.faq.hours','restapp.faq.policies','restapp.faq.contact','restapp.faq.parking','restapp.faq.services',
  'restapp.crm.sync_menu','restapp.crm.sync_prices','restapp.crm.sync_tables','restapp.crm.sync_branches','restapp.crm.webhook_notify','restapp.crm.external_id','restapp.crm.delivery_mode','restapp.crm.import_restaurant','restapp.crm.status_patch','restapp.crm.inventory','restapp.crm.pull_orders','restapp.crm.pos_receipt',
  'restapp.report.dashboard','restapp.report.sales_today','restapp.report.reservations_today','restapp.report.tables_status','restapp.report.out_of_stock','restapp.report.activity',
] as const;

export type RestappAgentToolId = (typeof IDS)[number];

const WRITE_IDS = new Set<RestappAgentToolId>([
  'restapp.menu.send_image','restapp.branch.send_location','restapp.order.create_draft','restapp.order.add_item','restapp.order.remove_item','restapp.order.update_item_qty','restapp.order.apply_customizations','restapp.order.confirm','restapp.order.cancel','restapp.order.reorder','restapp.order.modify','restapp.order.schedule','restapp.order.completed','restapp.order.notes','restapp.delivery.courier_handoff','restapp.delivery.update_contact','restapp.delivery.time_slot','restapp.delivery.tip','restapp.reservation.create','restapp.reservation.confirm','restapp.reservation.reschedule','restapp.reservation.cancel','restapp.reservation.party_size','restapp.reservation.special_requests','restapp.reservation.join_waitlist','restapp.table.assign','restapp.table.release','restapp.customer.register','restapp.customer.redeem_points','restapp.customer.notes','restapp.customer.update_profile','restapp.payment.select','restapp.payment.confirm_transfer','restapp.payment.pending_notify','restapp.payment.split_bill','restapp.payment.tip_add','restapp.payment.refund','restapp.promo.apply','restapp.handoff.request_human','restapp.handoff.notify_kitchen','restapp.handoff.notify_staff','restapp.staff.call_manager','restapp.crm.sync_menu','restapp.crm.sync_prices','restapp.crm.sync_tables','restapp.crm.sync_branches','restapp.crm.webhook_notify','restapp.crm.external_id','restapp.crm.delivery_mode','restapp.crm.import_restaurant','restapp.crm.status_patch','restapp.crm.inventory',
]);

const ADMIN_DOMAINS = new Set(['crm','report']);
const HUMAN_LABELS: Record<string, string> = {
  menu: 'menú', recommend: 'recomendaciones', branch: 'sucursales', order: 'pedidos', delivery: 'delivery',
  table: 'mesas', reservation: 'reservas', customer: 'clientes', payment: 'pagos', promo: 'promociones',
  handoff: 'handoff humano', staff: 'equipo', faq: 'conocimiento/RAG', crm: 'CRM/POS', report: 'reportes',
};

function defaultSchema(domain: string): Record<string, unknown> {
  return {
    type: 'object',
    description: `Argumentos para una operación del dominio ${HUMAN_LABELS[domain] || domain}. Usa solo campos confirmados por el cliente o recuperados de datos del equipo.`,
    additionalProperties: true,
    properties: {
      q: { type: 'string' }, query: { type: 'string' }, product_id: { type: 'number' }, order_id: { type: 'number' }, order_number: { type: 'string' },
      reservation_id: { type: 'number' }, customer_id: { type: 'number' }, customer_phone: { type: 'string' }, branch_id: { type: 'number' }, table_code: { type: 'string' },
      party_size: { type: 'number' }, date: { type: 'string' }, reserved_at: { type: 'string' }, address: { type: 'string' }, lat: { type: 'number' }, lng: { type: 'number' },
      items: { type: 'array', items: { type: 'object', additionalProperties: true } }, limit: { type: 'number' }, confirmed: { type: 'boolean' }, reason: { type: 'string' },
    },
  };
}

function descriptionFor(id: string, domain: string, action: string) {
  const readable = action.replaceAll('_', ' ');
  return `RestaPP ${HUMAN_LABELS[domain] || domain}: ${readable}. Ejecuta esta capacidad con datos reales del equipo; no inventes resultados.`;
}

// Guía de uso por tool crítica: el LLM elige mejor cuando la descripción dice
// CUÁNDO usar la herramienta y qué requiere, en vez de solo el nombre.
const DESCRIPTION_OVERRIDES: Partial<Record<RestappAgentToolId, string>> = {
  'restapp.reservation.create':
    'RestaPP reservas: crear una reserva para el cliente. Requiere reserved_at (fecha/hora futura en formato ISO YYYY-MM-DDTHH:mm:ss) y party_size. Interpreta "hoy/esta noche/mañana" usando la fecha y hora real actual.',
  'restapp.reservation.status':
    'RestaPP reservas: consultar el estado y los datos de una reserva existente por reservation_id. No la confundas con crear, confirmar o cancelar reservas.',
  'restapp.reservation.special_requests':
    'RestaPP reservas: registrar solicitudes especiales del cliente en una reserva existente (mesa cerca de la ventana, silla para bebé, cumpleaños, alergias, etc.). Requiere reservation_id y el texto de la solicitud en el parámetro requests (o note). Úsala cuando el cliente pida un detalle especial para su reserva; no la sustituyas por confirm o create.',
  'restapp.reservation.reschedule':
    'RestaPP reservas: reprogramar una reserva existente a otra fecha/hora. Requiere reservation_id y reserved_at (fecha/hora futura ISO). Interpreta fechas relativas con la fecha real actual.',
  'restapp.order.confirm':
    'RestaPP pedidos: confirmar el pedido del cliente. Requiere items=[{product_id, name, qty, unit_price}] con el contenido real del draft (de restapp.order.add_item) y customer_name + customer_phone del cliente.',
  'restapp.order.status':
    'RestaPP pedidos: consultar el estado de un pedido existente por order_id u order_number.',
  'restapp.order.add_item':
    'RestaPP pedidos: agregar un producto al carrito del pedido. Requiere product_id numérico válido del menú (consúltalo antes si no lo tienes); no inventes ids.',
  'restapp.order.create_draft':
    'RestaPP pedidos: crear o consultar el borrador de un PEDIDO de comida en curso (productos del menú). Úsala SOLO cuando el cliente esté armando o consultando un pedido de comida; NUNCA para confirmar una reserva, reprogramar, ni gestionar pagos.',
  'restapp.payment.select':
    'RestaPP pagos: registrar el método de pago elegido por el cliente (efectivo/transferencia/tarjeta) sobre un pedido existente. Acepta order_id (numérico) u order_number, y method o payment_method.',
  'restapp.payment.status':
    'RestaPP pagos: consultar el método y estado de pago de un pedido existente por order_id u order_number.',
  'restapp.faq.search':
    'RestaPP conocimiento: buscar en preguntas frecuentes/RAG del restaurante con una consulta (q). Úsala para horarios, políticas, alergias, contacto y dudas generales.',
};

export const RESTAPP_AGENT_TOOLS: readonly RestappAgentToolDefinition[] = IDS.map((id) => {
  const [, domain, ...rest] = id.split('.');
  const action = rest.join('_');
  const kind: RestappToolKind = WRITE_IDS.has(id) ? 'write' : 'read';
  return {
    id,
    llmName: id.replaceAll('.', '__'),
    domain,
    kind,
    visibility: ADMIN_DOMAINS.has(domain) ? 'admin' : 'llm',
    requiresConfirmation: kind === 'write' && !id.startsWith('restapp.handoff.'),
    description: DESCRIPTION_OVERRIDES[id] || descriptionFor(id, domain, action),
    parameters: defaultSchema(domain),
  };
});

const BY_ID = new Map(RESTAPP_AGENT_TOOLS.map((tool) => [tool.id, tool]));
const BY_LLM_NAME = new Map(RESTAPP_AGENT_TOOLS.map((tool) => [tool.llmName, tool]));

export function getRestappAgentTool(idOrLlmName: string) {
  return BY_ID.get(idOrLlmName) || BY_LLM_NAME.get(idOrLlmName) || null;
}

export function toLlmFunctionTool(tool: RestappAgentToolDefinition) {
  return {
    type: 'function' as const,
    function: {
      name: tool.llmName,
      description: `${tool.description}${tool.requiresConfirmation ? ' Requiere confirmación explícita antes de ejecutar.' : ''}`,
      parameters: tool.parameters,
    },
  };
}

const DOMAIN_KEYWORDS: Array<[string, RegExp]> = [
  ['reservation', /reserv|mesa|cumple|personas|terraza|sal[oó]n/i],
  ['delivery', /delivery|entrega|direcci[oó]n|domicilio|ubicaci[oó]n|llegar|env[ií]o/i],
  ['payment', /pago|pagar|tarjeta|transfer|efectivo|comprobante|propina|reembolso/i],
  ['promo', /promo|oferta|descuento|cup[oó]n|happy hour|combo/i],
  ['customer', /mi pedido anterior|favorito|puntos|cliente|historial|siempre pido/i],
  ['faq', /horario|parqueo|wifi|mascota|pet|alerg|pol[ií]tica|contacto|tel[eé]fono/i],
  ['branch', /sucursal|cerca|ubicaci[oó]n|direcci[oó]n|horario/i],
  ['order', /pedido|orden|quiero|agrega|quita|cantidad|carrito|cancel/i],
  ['recommend', /recom|sugier|qu[eé] me|no s[eé]|opci[oó]n|presupuesto|veget|vegano/i],
  ['menu', /men[uú]|plato|comida|precio|ingrediente|bebida|postre|foto|picante/i],
  ['handoff', /humano|persona|agente|encargado|gerente|queja|reclamo/i],
];

const PHASE_DOMAINS: Record<RestappConversationPhase, string[]> = {
  exploring: ['menu','recommend','promo','faq'], ordering: ['menu','order','recommend','customer'], confirming: ['order','payment','delivery','customer'],
  delivery: ['delivery','branch','order'], reservation: ['reservation','table','customer','branch'], payment: ['payment','order','customer'],
  support: ['faq','handoff','order'], internal: ['crm','report','staff','handoff'],
};

export function selectRestappAgentTools(input: {
  message: string;
  phase?: RestappConversationPhase;
  maxTools?: number;
  includeAdmin?: boolean;
}) {
  const phase = input.phase || 'exploring';
  const maxTools = Math.min(12, Math.max(4, input.maxTools || 12));
  const scores = new Map<string, number>();
  for (const d of PHASE_DOMAINS[phase]) scores.set(d, (scores.get(d) || 0) + 4);
  for (const [domain, pattern] of DOMAIN_KEYWORDS) if (pattern.test(input.message || '')) scores.set(domain, (scores.get(domain) || 0) + 8);
  // Base domains make the agent resilient without exposing the whole catalog.
  for (const d of ['menu','order','faq','handoff']) scores.set(d, (scores.get(d) || 0) + 1);

  // Desempate por prioridad de dominio en la fase: evita que un dominio con
  // keywords ambiguas (p. ej. "cerca" → branch) desplace tools del dominio
  // principal de la fase (p. ej. special_requests de reservas) por orden de índice.
  const phaseDomains = PHASE_DOMAINS[phase];
  const domainRank = (d: string) => {
    const i = phaseDomains.indexOf(d);
    return i === -1 ? phaseDomains.length : i;
  };

  const tools = RESTAPP_AGENT_TOOLS
    .filter((t) => input.includeAdmin || t.visibility === 'llm')
    .map((tool, index) => ({ tool, score: scores.get(tool.domain) || 0, rank: domainRank(tool.domain), index }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.rank - b.rank || a.index - b.index)
    .slice(0, maxTools)
    .map((x) => x.tool);

  return tools;
}

export function buildRestappLlmTools(input: { message: string; phase?: RestappConversationPhase; maxTools?: number; includeAdmin?: boolean }) {
  return selectRestappAgentTools(input).map(toLlmFunctionTool);
}

export const RESTAPP_AGENT_TOOL_COUNT = RESTAPP_AGENT_TOOLS.length;
