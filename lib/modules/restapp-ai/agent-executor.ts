import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  getRestappDashboard,
  getRestappSettings,
  listRestappBranches,
  listRestappCustomers,
  listRestappFaqs,
  listRestappMenu,
  listRestappOrders,
  listRestappPromotions,
  listRestappReservations,
  listRestappTables,
  listRestappTeam,
  logRestappActivity,
  updateRestappOrderStatus,
} from './db';
import { geocodeAddress, quoteDelivery } from './import-api';
import { runRestappTool, type RestappToolName } from './orchestrator';
import { getRestappAgentTool, type RestappAgentToolId } from './agent-tools';

export type RestappAgentRuntimeAdapters = {
  /** RAG already owned by AllSender / entrenamiento-ia. This module only consumes it. */
  ragSearch?: (input: { teamId: number; query: string; limit: number; namespace: 'restapp' }) => Promise<unknown>;
  sendMedia?: (input: { teamId: number; chatId?: number | null; kind: 'image' | 'location'; payload: unknown }) => Promise<unknown>;
  notify?: (input: { teamId: number; target: 'human' | 'staff' | 'kitchen' | 'manager' | 'customer'; payload: unknown }) => Promise<unknown>;
  invoke?: (input: { teamId: number; toolId: RestappAgentToolId; args: Record<string, unknown>; context: RestappAgentExecutionContext }) => Promise<unknown>;
};

export type RestappAgentExecutionContext = {
  chatId?: number | null;
  confirmed?: boolean;
  customerPhone?: string | null;
  internal?: boolean;
  state?: Record<string, any>;
  adapters?: RestappAgentRuntimeAdapters;
};

const LEGACY: Partial<Record<RestappAgentToolId, RestappToolName>> = {
  'restapp.menu.search': 'search_menu',
  'restapp.menu.get_categories': 'get_categories',
  'restapp.menu.get_item': 'get_menu_item',
  'restapp.menu.get_variants': 'get_product_variants',
  'restapp.menu.get_modifiers': 'get_product_modifiers',
  'restapp.menu.check_availability': 'check_item_availability',
  'restapp.menu.get_images': 'get_product_images',
  'restapp.menu.send_image': 'send_product_image',
  'restapp.menu.filter_by_preferences': 'search_products_by_preferences',
  'restapp.menu.get_bestsellers': 'get_popular_products',
  'restapp.recommend.personalized': 'recommend_products',
  'restapp.branch.resolve': 'resolve_branch',
  'restapp.branch.nearest': 'get_nearest_branch',
  'restapp.branch.location': 'get_branch_location',
  'restapp.branch.send_location': 'send_branch_location',
  'restapp.branch.schedule': 'get_branch_schedule',
  'restapp.branch.coverage': 'validate_delivery_area',
  'restapp.order.quote': 'calculate_order_quote',
  'restapp.order.confirm': 'confirm_order',
  'restapp.order.status': 'get_order_status',
  'restapp.order.cancel': 'cancel_order',
  'restapp.delivery.fee': 'calculate_delivery_fee',
  'restapp.delivery.coverage': 'validate_delivery_area',
  'restapp.table.check_availability': 'check_table_availability',
  'restapp.table.list_slots': 'list_available_slots',
  'restapp.reservation.create': 'create_reservation',
  'restapp.promo.list': 'get_promotions',
  'restapp.handoff.request_human': 'request_human_handoff',
};

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function s(v: unknown) { return String(v ?? '').trim(); }
function state(ctx: RestappAgentExecutionContext) { return (ctx.state ||= {}); }
function cart(ctx: RestappAgentExecutionContext) { const st = state(ctx); return (st.restappCart ||= { items: [], notes: null, modality: 'dine_in' }); }
function ok(data: Record<string, unknown> = {}) { return { ok: true, ...data }; }
function fail(error: string, extra: Record<string, unknown> = {}) { return { ok: false, error, ...extra }; }

/** Fecha/hora futura válida en formato ISO; rechaza pasados y años fuera de rango. */
function validReservedAt(v: string): boolean {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getTime() < Date.now() - 10 * 60 * 1000) return false;
  const y = d.getFullYear();
  return y >= new Date().getFullYear() - 1 && y <= new Date().getFullYear() + 2;
}

/** Resuelve el id numérico de un pedido desde order_id u order_number. */
async function resolveOrderId(teamId: number, args: Record<string, unknown>): Promise<number> {
  const id = n(args.order_id);
  if (id) return id;
  const num = s(args.order_number || args.orderNo);
  if (!num) return 0;
  const orders = await listRestappOrders(teamId, 100);
  const o = orders.find((x) => String(x.order_number || '') === num);
  return o ? Number(o.id) : 0;
}

async function rag(teamId: number, args: Record<string, unknown>, ctx: RestappAgentExecutionContext) {
  const q = s(args.q || args.query || args.question);
  if (ctx.adapters?.ragSearch && q) {
    return ok({ source: 'training_rag', results: await ctx.adapters.ragSearch({ teamId, query: q, limit: Math.min(8, Math.max(1, n(args.limit, 5))), namespace: 'restapp' }) });
  }
  const faqs = (await listRestappFaqs(teamId)).filter((x) => x.is_active !== false);
  if (!q) return ok({ source: 'restapp_faq', results: faqs.slice(0, 30) });
  const low = q.toLowerCase();
  return ok({ source: 'restapp_faq', results: faqs.filter((x) => `${x.question} ${x.answer} ${x.category}`.toLowerCase().includes(low)).slice(0, 8) });
}

async function executeLocal(teamId: number, toolId: RestappAgentToolId, args: Record<string, unknown>, ctx: RestappAgentExecutionContext): Promise<unknown | undefined> {
  switch (toolId) {
    case 'restapp.menu.filter_by_budget':
      return runRestappTool(teamId, 'search_products_by_preferences', { ...args, budget_min: args.budget_min, budget_max: args.budget_max }, { chatId: ctx.chatId });
    case 'restapp.menu.filter_by_ingredient':
      return runRestappTool(teamId, 'search_menu', { q: args.ingredient || args.q, limit: args.limit }, { chatId: ctx.chatId });
    case 'restapp.menu.get_menu_by_category':
      return runRestappTool(teamId, 'search_menu', { q: args.category, limit: args.limit || 5 }, { chatId: ctx.chatId });
    case 'restapp.menu.get_chef_suggestions':
      return runRestappTool(teamId, 'recommend_products', { q: 'recomendado', limit: args.limit || 4 }, { chatId: ctx.chatId });
    case 'restapp.menu.get_new_items': {
      const items = (await listRestappMenu(teamId)).filter((x) => x.is_available !== false).slice().sort((a,b) => Number(b.id)-Number(a.id));
      return ok({ items: items.slice(0, Math.min(8, n(args.limit, 4))) });
    }
    case 'restapp.menu.get_combo_details': {
      const menu = await listRestappMenu(teamId); const id = n(args.product_id); const item = menu.find((x) => Number(x.id) === id);
      return item ? ok({ item, variants: item.variants_json || [], note: 'Los componentes del combo provienen del producto/variantes guardados.' }) : fail('not_found');
    }

    case 'restapp.recommend.by_occasion':
    case 'restapp.recommend.cross_sell':
    case 'restapp.recommend.group_menu':
      return runRestappTool(teamId, 'recommend_products', { q: args.occasion || args.q || '', limit: 4 }, { chatId: ctx.chatId });
    case 'restapp.recommend.pair_with':
    case 'restapp.recommend.upsell': {
      const menu = await listRestappMenu(teamId); const source = menu.find((x) => Number(x.id) === n(args.product_id));
      if (!source) return fail('product_not_found');
      const candidates = menu.filter((x) => x.is_available !== false && Number(x.id) !== Number(source.id));
      return ok({ source, recommendations: candidates.filter((x) => x.is_recommended || x.is_bestseller || x.category !== source.category).slice(0, 4) });
    }
    case 'restapp.recommend.budget_meal':
      return runRestappTool(teamId, 'search_products_by_preferences', { budget_max: args.budget_max, limit: 5 }, { chatId: ctx.chatId });
    case 'restapp.recommend.allergen_safe': {
      const allergen = s(args.allergen).toLowerCase(); const menu = await listRestappMenu(teamId);
      return ok({ items: menu.filter((x) => x.is_available !== false && !String(x.allergens || '').toLowerCase().includes(allergen)).slice(0, 8), warning: 'Confirmar alérgenos críticos con el restaurante; evitar garantías médicas.' });
    }
    case 'restapp.recommend.vegetarian_meal':
      return runRestappTool(teamId, 'search_products_by_preferences', { vegetarian: true, vegan: s(args.type).toLowerCase() === 'vegan', limit: 5 }, { chatId: ctx.chatId });
    case 'restapp.recommend.daily_deal':
      return ok({ promotions: (await listRestappPromotions(teamId)).filter((x) => x.is_active !== false).slice(0, 4) });

    case 'restapp.branch.list': return ok({ branches: (await listRestappBranches(teamId)).filter((x) => x.is_active !== false) });
    case 'restapp.branch.handoff_hours': return ok({ handoff_hours: (await getRestappSettings(teamId))?.handoff_hours || null });
    case 'restapp.branch.eta': return quoteDelivery(teamId, { branch_id: n(args.branch_id) || null, lat: args.lat == null ? null : n(args.lat), lng: args.lng == null ? null : n(args.lng), address: s(args.address) || null });

    case 'restapp.order.create_draft': { const c = cart(ctx); c.modality = s(args.modality) || c.modality; c.branch_id = args.branch_id ?? c.branch_id; return ok({ draft: c }); }
    case 'restapp.order.add_item': { const c = cart(ctx); const menu = await listRestappMenu(teamId); const item = menu.find((x) => Number(x.id) === n(args.product_id)); if (!item) return fail('product_not_found'); c.items.push({ product_id: item.id, name: item.name, qty: Math.max(1,n(args.qty,1)), unit_price: Number(item.price || 0), modifiers: args.modifiers || [], customizations: args.customizations || [] }); return ok({ draft: c }); }
    case 'restapp.order.remove_item': { const c = cart(ctx); const id = n(args.product_id); const idx = args.item_index == null ? c.items.findIndex((x:any) => Number(x.product_id)===id) : n(args.item_index,-1); if (idx < 0 || idx >= c.items.length) return fail('item_not_found'); c.items.splice(idx,1); return ok({ draft:c }); }
    case 'restapp.order.update_item_qty': { const c = cart(ctx); const item = c.items.find((x:any)=>Number(x.product_id)===n(args.product_id)); if(!item) return fail('item_not_found'); item.qty=Math.max(1,n(args.qty,1)); return ok({draft:c}); }
    case 'restapp.order.apply_customizations': { const c=cart(ctx); const item=c.items.find((x:any)=>Number(x.product_id)===n(args.product_id)); if(!item)return fail('item_not_found'); item.customizations=args.customizations||[]; return ok({draft:c}); }
    case 'restapp.order.summary': return ok({ draft: cart(ctx) });
    case 'restapp.order.verify_items': { const c=cart(ctx); const menu=await listRestappMenu(teamId); const verified=c.items.map((i:any)=>{const p=menu.find((x)=>Number(x.id)===Number(i.product_id)); return {...i, exists:Boolean(p), available:Boolean(p&&p.is_available!==false&&(p.stock==null||Number(p.stock)>0)), canonical_price:p?Number(p.price||0):null};}); return ok({items:verified, valid:verified.every((x:any)=>x.exists&&x.available)}); }
    case 'restapp.order.minimum_check': { const settings=await getRestappSettings(teamId); const items=Array.isArray(args.items)?args.items:cart(ctx).items; const subtotal=items.reduce((a:number,i:any)=>a+n(i.unit_price||i.price)*Math.max(1,n(i.qty||i.quantity,1)),0); const minimum=n(settings?.min_order_amount,0); return ok({subtotal,minimum,meets_minimum:subtotal>=minimum}); }
    case 'restapp.order.history': { const phone=s(args.customer_phone||ctx.customerPhone); const orders=await listRestappOrders(teamId,Math.min(50,n(args.limit,10))); return ok({orders:phone?orders.filter((x)=>String(x.customer_phone||'')===phone):orders}); }
    case 'restapp.order.track': return runRestappTool(teamId,'get_order_status',{order_number:args.order_number,order_id:args.order_id},{chatId:ctx.chatId});
    case 'restapp.order.pickup_ready': { const orders=await listRestappOrders(teamId,100); const o=orders.find((x)=>Number(x.id)===n(args.order_id)); return o?ok({ready:['ready','completed'].includes(String(o.status)),order:o}):fail('not_found'); }
    case 'restapp.order.completed': return ok({ order: await updateRestappOrderStatus(teamId,n(args.order_id),'completed') });
    case 'restapp.order.notes': { const id=n(args.order_id); const note=s(args.note); if(!id||!note)return fail('order_id_and_note_required'); const r=await db.execute(sql`UPDATE restapp_orders SET notes = CONCAT_WS(E'\n', notes, ${note}), updated_at=NOW() WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }

    case 'restapp.delivery.validate_address': { const address=s(args.address); return ok({valid:address.length>=6,address}); }
    case 'restapp.delivery.geocode': { const address=s(args.address); if(!address)return fail('address_required'); const result=await geocodeAddress(address); return result?ok({location:result}):fail('geocoding_unavailable'); }
    case 'restapp.delivery.offer_pickup': return ok({offer_pickup:true,branch_id:args.branch_id||null});
    case 'restapp.delivery.eta': return quoteDelivery(teamId,{branch_id:n(args.branch_id)||null,lat:args.lat==null?null:n(args.lat),lng:args.lng==null?null:n(args.lng),address:s(args.address)||null});

    case 'restapp.table.by_party_size': { const seats=n(args.party_size||args.seats); return ok({tables:(await listRestappTables(teamId,n(args.branch_id)||null)).filter((x)=>x.status==='free'&&Number(x.seats||0)>=seats)}); }
    case 'restapp.table.by_zone': { const zone=s(args.zone).toLowerCase(); return ok({tables:(await listRestappTables(teamId,n(args.branch_id)||null)).filter((x)=>!zone||String(x.zone||'').toLowerCase().includes(zone))}); }
    case 'restapp.table.assign': { const code=s(args.table_code); if(!code)return fail('table_code_required'); const r=await db.execute(sql`UPDATE restapp_tables SET status='occupied' WHERE team_id=${teamId} AND code=${code} RETURNING *`); return ok({result:r}); }
    case 'restapp.table.release': { const code=s(args.table_code); if(!code)return fail('table_code_required'); const r=await db.execute(sql`UPDATE restapp_tables SET status='free' WHERE team_id=${teamId} AND code=${code} RETURNING *`); return ok({result:r}); }
    case 'restapp.reservation.status': { const rows=await listRestappReservations(teamId,100); const row=rows.find((x)=>Number(x.id)===n(args.reservation_id)); return row?ok({reservation:row}):fail('not_found'); }
    case 'restapp.reservation.confirm':
    case 'restapp.reservation.cancel': { const status=toolId.endsWith('confirm')?'confirmed':'cancelled'; const id=n(args.reservation_id); const r=await db.execute(sql`UPDATE restapp_reservations SET status=${status} WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }
    case 'restapp.reservation.reschedule': { const id=n(args.reservation_id), at=s(args.reserved_at); if(!id||!at)return fail('reservation_id_and_reserved_at_required'); if(!validReservedAt(at))return fail('invalid_reserved_at',{message:'reserved_at debe ser una fecha/hora futura válida en formato ISO (YYYY-MM-DDTHH:mm:ss). Usa la fecha real actual (hoy) para fechas relativas.'}); const r=await db.execute(sql`UPDATE restapp_reservations SET reserved_at=${at} WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }
    case 'restapp.reservation.party_size': { const id=n(args.reservation_id), size=Math.max(1,n(args.party_size,1)); const r=await db.execute(sql`UPDATE restapp_reservations SET party_size=${size} WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }
    case 'restapp.reservation.special_requests': { const id=n(args.reservation_id), note=s(args.requests||args.note||args.notes||args.special_request||args.details||args.text||args.message); if(!id||!note)return fail('reservation_id_and_note_required',{message:'Pasa reservation_id y el texto de la solicitud en el parámetro requests (o note).'}); const r=await db.execute(sql`UPDATE restapp_reservations SET notes=CONCAT_WS(E'\n',notes,${note}) WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }
    case 'restapp.reservation.waitlist': return ok({enabled:Boolean((await getRestappSettings(teamId))?.waitlist_enabled), note:'La lista de espera persistente puede ser provista por el runtime/adaptador.'});

    case 'restapp.customer.identify': { const phone=s(args.phone||args.customer_phone||ctx.customerPhone); const customers=await listRestappCustomers(teamId,200); const customer=customers.find((x)=>String(x.phone||'')===phone); return customer?ok({customer}):fail('not_found'); }
    case 'restapp.customer.profile': { const customers=await listRestappCustomers(teamId,200); const customer=customers.find((x)=>Number(x.id)===n(args.customer_id)); return customer?ok({customer}):fail('not_found'); }
    case 'restapp.customer.history': { const customers=await listRestappCustomers(teamId,200); const customer=customers.find((x)=>Number(x.id)===n(args.customer_id)); if(!customer)return fail('not_found'); const orders=(await listRestappOrders(teamId,100)).filter((x)=>String(x.customer_phone||'')===String(customer.phone||'')); return ok({customer,orders:orders.slice(0,Math.min(30,n(args.limit,10)))}); }
    case 'restapp.customer.preferences':
    case 'restapp.customer.favorites': return ok({customer_id:args.customer_id, preferences: state(ctx).customerPreferences || {}, source:'conversation_state_or_training'});
    case 'restapp.customer.loyalty_points': return ok({customer_id:args.customer_id, points:null, adapter_required:true});
    case 'restapp.customer.tier': { const customers=await listRestappCustomers(teamId,200); const c=customers.find((x)=>Number(x.id)===n(args.customer_id)); return c?ok({tier:Number(c.total_spent||0)>=10000?'vip':'regular',customer:c}):fail('not_found'); }
    case 'restapp.customer.visit_count': { const customers=await listRestappCustomers(teamId,200); const c=customers.find((x)=>Number(x.id)===n(args.customer_id)); return c?ok({visit_count:Number(c.total_orders||0),customer:c}):fail('not_found'); }
    case 'restapp.customer.total_spent': { const customers=await listRestappCustomers(teamId,200); const c=customers.find((x)=>Number(x.id)===n(args.customer_id)); return c?ok({total_spent:Number(c.total_spent||0),customer:c}):fail('not_found'); }
    case 'restapp.customer.register': { const name=s(args.name||args.customer_name), phone=s(args.phone||args.customer_phone); if(!phone)return fail('phone_required'); const r=await db.execute(sql`INSERT INTO restapp_customers(team_id,name,phone,created_at,updated_at) VALUES(${teamId},${name||null},${phone},NOW(),NOW()) RETURNING *`); return ok({result:r}); }
    case 'restapp.customer.notes': { const id=n(args.customer_id), note=s(args.note); const r=await db.execute(sql`UPDATE restapp_customers SET notes=CONCAT_WS(E'\n',notes,${note}),updated_at=NOW() WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }
    case 'restapp.customer.update_profile': { const id=n(args.customer_id); const name=s(args.name)||null, phone=s(args.phone)||null, email=s(args.email)||null; const r=await db.execute(sql`UPDATE restapp_customers SET name=COALESCE(${name},name),phone=COALESCE(${phone},phone),email=COALESCE(${email},email),updated_at=NOW() WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }

    case 'restapp.payment.methods': return ok({methods:(await getRestappSettings(teamId))?.payment_methods || ['cod']});
    case 'restapp.payment.status': { const id=await resolveOrderId(teamId,args); if(!id)return fail('order_id_or_number_required'); const orders=await listRestappOrders(teamId,100); const o=orders.find((x)=>Number(x.id)===id); return o?ok({order_id:o.id,payment_method:o.payment_method,payment_status:o.payment_status,total:o.total}):fail('not_found'); }
    case 'restapp.payment.select': { const id=await resolveOrderId(teamId,args), method=s(args.method||args.payment_method); if(!id||!method)return fail('order_id_or_number_and_method_required'); const r=await db.execute(sql`UPDATE restapp_orders SET payment_method=${method},updated_at=NOW() WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }
    case 'restapp.payment.confirm_transfer': { const id=await resolveOrderId(teamId,args), reference=s(args.reference); if(!id)return fail('order_id_or_number_required'); const r=await db.execute(sql`UPDATE restapp_orders SET payment_status='paid',notes=CONCAT_WS(E'\n',notes,${reference?`Transferencia: ${reference}`:'Transferencia confirmada'}),updated_at=NOW() WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }
    case 'restapp.payment.tip_add':
    case 'restapp.delivery.tip': { const id=await resolveOrderId(teamId,args), amount=Math.max(0,n(args.amount)); if(!id)return fail('order_id_or_number_required'); const r=await db.execute(sql`UPDATE restapp_orders SET tip=${amount},total=total-${sql.raw('COALESCE(tip,0)')}+${amount},updated_at=NOW() WHERE team_id=${teamId} AND id=${id} RETURNING *`); return ok({result:r}); }

    case 'restapp.promo.daily':
    case 'restapp.promo.happy_hour':
    case 'restapp.promo.combos':
    case 'restapp.promo.expiring': return ok({promotions:(await listRestappPromotions(teamId)).filter((x)=>x.is_active!==false).slice(0,10)});
    case 'restapp.promo.coupon': return ok({code:s(args.code), valid:false, adapter_required:true, note:'No se inventa un cupón si el runtime/POS no lo valida.'});
    case 'restapp.promo.validate': { const promos=await listRestappPromotions(teamId); const promo=promos.find((x)=>Number(x.id)===n(args.promo_id)); return promo?ok({valid:promo.is_active!==false,promotion:promo}):fail('not_found'); }

    case 'restapp.handoff.check_availability': return ok({enabled:Boolean((await getRestappSettings(teamId))?.handoff_enabled), hours:(await getRestappSettings(teamId))?.handoff_hours||null});
    case 'restapp.handoff.schedule': return ok({hours:(await getRestappSettings(teamId))?.handoff_hours||null});
    case 'restapp.staff.on_shift': return ok({staff:(await listRestappTeam(teamId)).filter((x)=>x.is_active!==false)});

    case 'restapp.faq.search': return rag(teamId,args,ctx);
    case 'restapp.faq.allergens': return rag(teamId,{q:args.q||'alérgenos alergias ingredientes'},ctx);
    case 'restapp.faq.hours': return rag(teamId,{q:args.q||'horarios apertura cierre'},ctx);
    case 'restapp.faq.policies': return rag(teamId,{q:args.q||'políticas cancelación devolución demoras'},ctx);
    case 'restapp.faq.contact': { const st=await getRestappSettings(teamId); return ok({phone:st?.phone,email:st?.email,address:st?.address}); }
    case 'restapp.faq.parking': return rag(teamId,{q:args.q||'estacionamiento parqueo parking'},ctx);
    case 'restapp.faq.services': return rag(teamId,{q:args.q||'servicios wifi accesibilidad mascotas pet friendly'},ctx);

    case 'restapp.report.dashboard': return ok({dashboard:await getRestappDashboard(teamId,n(args.branch_id)||null)});
    case 'restapp.report.sales_today': { const d=await getRestappDashboard(teamId); return ok({orders_today:d.stats.orders_today,sales_today:d.stats.sales_today,ticket_avg:d.stats.ticket_avg}); }
    case 'restapp.report.reservations_today': { const d=await getRestappDashboard(teamId); return ok({reservations_today:d.stats.reservations_today,reservations_pending:d.stats.reservations_pending}); }
    case 'restapp.report.tables_status': return ok({tables:await listRestappTables(teamId,n(args.branch_id)||null)});
    case 'restapp.report.out_of_stock': { const d=await getRestappDashboard(teamId); return ok({items:d.outOfStock.slice(0,Math.min(50,n(args.limit,10)))}); }
    case 'restapp.report.activity': { const d=await getRestappDashboard(teamId); return ok({activity:d.activity.slice(0,Math.min(50,n(args.limit,20)))}); }
  }
  return undefined;
}

export async function executeRestappAgentTool(
  teamId: number,
  idOrLlmName: string,
  args: Record<string, unknown> = {},
  ctx: RestappAgentExecutionContext = {}
) {
  const definition = getRestappAgentTool(idOrLlmName);
  if (!definition) return fail('unknown_tool', { tool: idOrLlmName });
  const toolId = definition.id as RestappAgentToolId;
  if (definition.visibility !== 'llm' && !ctx.internal) return fail('tool_not_exposed_to_customer_agent', { tool: toolId });
  if (definition.requiresConfirmation && !(ctx.confirmed || args.confirmed === true)) {
    return fail('confirmation_required', { tool: toolId, message: 'Solicita confirmación explícita del cliente antes de ejecutar esta acción.' });
  }

  const legacy = LEGACY[toolId];
  if (legacy) {
    const result = await runRestappTool(teamId, legacy, args, { chatId: ctx.chatId });
    // Media/handoff can be finalized by the host runtime without coupling this module to channel code.
    if (toolId === 'restapp.menu.send_image' && (result as any)?.images?.[0] && ctx.adapters?.sendMedia) {
      await ctx.adapters.sendMedia({ teamId, chatId: ctx.chatId, kind: 'image', payload: (result as any).images[0] });
    }
    if (toolId === 'restapp.branch.send_location' && (result as any)?.location && ctx.adapters?.sendMedia) {
      await ctx.adapters.sendMedia({ teamId, chatId: ctx.chatId, kind: 'location', payload: (result as any).location });
    }
    if (toolId === 'restapp.handoff.request_human' && ctx.adapters?.notify) {
      await ctx.adapters.notify({ teamId, target: 'human', payload: { reason: args.reason || 'requested', chatId: ctx.chatId } });
    }
    return result;
  }

  const local = await executeLocal(teamId, toolId, args, ctx);
  if (local !== undefined) return local;

  // Capabilities owned by AllSender runtime/POS/training are delegated, never reimplemented here.
  if (ctx.adapters?.invoke) return ctx.adapters.invoke({ teamId, toolId, args, context: ctx });

  await logRestappActivity(teamId, 'agent_tool', `Tool ${toolId} requiere adaptador del runtime`, { tool: toolId });
  return fail('runtime_adapter_required', { tool: toolId, message: 'La función existe y está registrada, pero su efecto pertenece al runtime AllSender/POS/RAG y debe resolverse mediante adapter.' });
}
