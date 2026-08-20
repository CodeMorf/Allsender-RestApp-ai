import 'server-only';
import {
  createRestappOrder,
  createRestappReservation,
  getRestappSettings,
  listRestappBranches,
  listRestappFaqs,
  listRestappMenu,
  listRestappModifiers,
  listRestappOrders,
  listRestappPromotions,
  listRestappTables,
  updateRestappOrderStatus,
} from './db';

export type RestappToolName =
  | 'search_menu'
  | 'get_categories'
  | 'get_menu_item'
  | 'search_products_by_preferences'
  | 'get_product_images'
  | 'get_product_variants'
  | 'get_product_modifiers'
  | 'check_item_availability'
  | 'get_promotions'
  | 'get_popular_products'
  | 'recommend_products'
  | 'resolve_branch'
  | 'get_nearest_branch'
  | 'get_branch_location'
  | 'send_branch_location'
  | 'validate_delivery_area'
  | 'calculate_delivery_fee'
  | 'calculate_order_quote'
  | 'create_order_draft'
  | 'confirm_order'
  | 'get_order_status'
  | 'cancel_order'
  | 'get_branch_schedule'
  | 'check_table_availability'
  | 'list_available_slots'
  | 'create_reservation'
  | 'get_reservation_status'
  | 'send_product_image'
  | 'send_location'
  | 'request_human_handoff'
  | 'get_faqs';

/**
 * Single RestaPP orchestrator helpers.
 * Chat runtime should call these tools only — no competing engines.
 */
export async function runRestappTool(
  teamId: number,
  tool: RestappToolName,
  args: Record<string, unknown> = {},
  ctx: { chatId?: number | null } = {}
) {
  switch (tool) {
    case 'search_menu':
    case 'search_products_by_preferences':
    case 'get_popular_products':
    case 'recommend_products': {
      const q = String(args.q || args.query || '').toLowerCase();
      const menu = await listRestappMenu(teamId);
      let list = menu.filter((m) => m.is_available !== false);
      if (q) {
        list = list.filter(
          (m) =>
            String(m.name || '').toLowerCase().includes(q) ||
            String(m.description || '').toLowerCase().includes(q) ||
            String(m.category || '').toLowerCase().includes(q) ||
            String(m.ingredients || '').toLowerCase().includes(q) ||
            String(m.tags || '').toLowerCase().includes(q)
        );
      }
      if (args.no_spicy) list = list.filter((m) => !m.is_spicy);
      if (args.vegetarian) list = list.filter((m) => m.is_vegetarian || m.is_vegan);
      if (args.vegan) list = list.filter((m) => m.is_vegan);
      if (args.with_chicken) {
        list = list.filter((m) => /pollo|chicken/i.test(String(m.name || '') + String(m.ingredients || '')));
      }
      if (args.budget_max != null) {
        list = list.filter((m) => Number(m.price || 0) <= Number(args.budget_max));
      }
      if (args.budget_min != null) {
        list = list.filter((m) => Number(m.price || 0) >= Number(args.budget_min));
      }
      if (tool === 'get_popular_products') {
        list = list.filter((m) => m.is_bestseller || m.is_recommended).concat(list);
        // dedupe by id
        const seen = new Set<number>();
        list = list.filter((m) => {
          const id = Number(m.id);
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }
      const max = Math.min(5, Number(args.limit || 4) || 4);
      return {
        ok: true,
        items: list.slice(0, max).map((m) => ({
          id: m.id,
          name: m.name,
          price: m.price,
          category: m.category,
          description: m.description,
          image_url: m.image_url,
          is_spicy: m.is_spicy,
          is_vegetarian: m.is_vegetarian,
          is_vegan: m.is_vegan,
        })),
      };
    }
    case 'get_product_images':
    case 'send_product_image': {
      const menu = await listRestappMenu(teamId);
      const id = Number(args.product_id || args.id || 0);
      const name = String(args.name || args.q || '').toLowerCase();
      const items = menu
        .filter(
          (m) =>
            m.is_available !== false &&
            m.image_url &&
            (Number(m.id) === id ||
              !name ||
              String(m.name || '').toLowerCase().includes(name) ||
              String(m.category || '').toLowerCase().includes(name))
        )
        .slice(0, Math.min(5, Number(args.limit || 3) || 3));
      return {
        ok: true,
        images: items.map((m) => ({ product_id: m.id, name: m.name, price: m.price, image_url: m.image_url })),
      };
    }
    case 'get_product_variants': {
      const menu = await listRestappMenu(teamId);
      const id = Number(args.product_id || 0);
      const item = menu.find((m) => Number(m.id) === id);
      if (!item) return { ok: false, error: 'not_found' };
      return { ok: true, variants: item.variants_json || [] };
    }
    case 'get_product_modifiers': {
      const mods = await listRestappModifiers(teamId);
      return { ok: true, modifiers: mods.filter((m) => m.is_active !== false) };
    }
    case 'get_categories': {
      const menu = await listRestappMenu(teamId);
      const cats = Array.from(new Set(menu.map((m) => String(m.category || 'General'))));
      return { ok: true, categories: cats };
    }
    case 'get_menu_item': {
      const menu = await listRestappMenu(teamId);
      const id = Number(args.product_id || args.id || 0);
      const name = String(args.name || '').toLowerCase();
      const item = menu.find((m) => Number(m.id) === id || String(m.name || '').toLowerCase() === name);
      return item ? { ok: true, item } : { ok: false, error: 'not_found' };
    }
    case 'check_item_availability': {
      const menu = await listRestappMenu(teamId);
      const id = Number(args.product_id || 0);
      const item = menu.find((m) => Number(m.id) === id);
      if (!item) return { ok: false, available: false, error: 'not_found' };
      const available = item.is_available !== false && (item.stock == null || Number(item.stock) > 0);
      return { ok: true, available, item };
    }
    case 'resolve_branch':
    case 'get_nearest_branch':
    case 'validate_delivery_area':
    case 'calculate_delivery_fee': {
      const branches = await listRestappBranches(teamId);
      const active = branches.filter((b) => b.is_active !== false);
      if (!active.length) return { ok: false, error: 'no_branches' };
      const lat = Number(args.lat);
      const lng = Number(args.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        let best = active[0];
        let bestD = Infinity;
        for (const b of active) {
          if (b.lat == null || b.lng == null) continue;
          const d = haversineKm(lat, lng, Number(b.lat), Number(b.lng));
          if (d < bestD) {
            bestD = d;
            best = b;
          }
        }
        const coverage = Number(best.coverage_km || 5);
        const inCoverage = bestD <= coverage;
        return {
          ok: true,
          branch: best,
          distance_km: Number.isFinite(bestD) ? Number(bestD.toFixed(2)) : null,
          in_coverage: inCoverage,
          delivery_fee: inCoverage ? best.delivery_fee : null,
          eta_minutes: inCoverage ? best.delivery_eta_min : null,
          offer_pickup: !inCoverage,
          message: inCoverage
            ? null
            : 'Fuera de cobertura de entrega. Se puede ofrecer recogida o transferir a una persona.',
        };
      }
      return { ok: true, branch: active[0], distance_km: null, in_coverage: true };
    }
    case 'get_branch_location':
    case 'send_branch_location':
    case 'send_location': {
      const branches = await listRestappBranches(teamId);
      const id = Number(args.branch_id || 0);
      const b = branches.find((x) => Number(x.id) === id) || branches.find((x) => x.is_active !== false) || branches[0];
      if (!b) return { ok: false, error: 'no_branches' };
      const settings = await getRestappSettings(teamId);
      return {
        ok: true,
        location: {
          name: b.name,
          address: b.address || settings?.address,
          reference: b.reference,
          phone: b.phone || settings?.phone,
          lat: b.lat ?? settings?.lat,
          lng: b.lng ?? settings?.lng,
          maps_url:
            b.lat != null && b.lng != null
              ? `https://maps.google.com/?q=${b.lat},${b.lng}`
              : null,
        },
      };
    }
    case 'get_branch_schedule': {
      const branches = await listRestappBranches(teamId);
      const id = Number(args.branch_id || 0);
      const b = branches.find((x) => Number(x.id) === id) || branches[0];
      return { ok: true, schedule: b?.schedule_json || {}, handoff_hours: (await getRestappSettings(teamId))?.handoff_hours };
    }
    case 'calculate_order_quote': {
      const items = Array.isArray(args.items) ? args.items : [];
      const subtotal = items.reduce(
        (s: number, i: any) => s + Number(i.unit_price || i.price || 0) * Number(i.qty || i.quantity || 1),
        0
      );
      const settings = await getRestappSettings(teamId);
      const delivery = Number(args.delivery_fee || 0);
      const tax = subtotal * Number(settings?.tax_rate || 0);
      const total = subtotal + delivery + tax + Number(settings?.service_fee || 0);
      return { ok: true, subtotal, tax, delivery_fee: delivery, total, currency: settings?.currency || 'DOP' };
    }
    case 'create_order_draft':
    case 'confirm_order': {
      const order = await createRestappOrder({
        teamId,
        chatId: ctx.chatId || null,
        branchId: args.branch_id != null ? Number(args.branch_id) : null,
        modality: String(args.modality || 'dine_in'),
        tableCode: (args.table_code as string) || null,
        customerName: String(args.customer_name || ''),
        customerPhone: String(args.customer_phone || ''),
        customerAddress: (args.address as string) || (args.customer_address as string) || null,
        customerLat: args.lat != null ? Number(args.lat) : null,
        customerLng: args.lng != null ? Number(args.lng) : null,
        paymentMethod: String(args.payment_method || 'cod'),
        items: Array.isArray(args.items) ? (args.items as any) : [],
        notes: (args.notes as string) || null,
        deliveryFee: Number(args.delivery_fee || 0),
        discount: Number(args.discount || 0),
      });
      return { ok: true, order, order_number: order?.order_number };
    }
    case 'get_order_status': {
      const orders = await listRestappOrders(teamId, 50);
      const num = String(args.order_number || '');
      const id = Number(args.order_id || 0);
      const order = orders.find((o) => Number(o.id) === id || String(o.order_number) === num);
      return order ? { ok: true, order } : { ok: false, error: 'not_found' };
    }
    case 'cancel_order': {
      const id = Number(args.order_id || 0);
      if (!id) return { ok: false, error: 'order_id_required' };
      const order = await updateRestappOrderStatus(teamId, id, 'cancelled');
      return order ? { ok: true, order } : { ok: false, error: 'not_found' };
    }
    case 'check_table_availability':
    case 'list_available_slots': {
      const tables = await listRestappTables(teamId);
      const seats = Number(args.party_size || args.seats || 0);
      let free = tables.filter((t) => t.status === 'free');
      if (seats > 0) free = free.filter((t) => Number(t.seats || 0) >= seats);
      return { ok: true, free_count: free.length, tables: free.slice(0, 20) };
    }
    case 'create_reservation': {
      const row = await createRestappReservation({
        teamId,
        chatId: ctx.chatId || null,
        branchId: args.branch_id != null ? Number(args.branch_id) : null,
        customerName: String(args.customer_name || ''),
        customerPhone: String(args.customer_phone || ''),
        partySize: Number(args.party_size || 2),
        reservedAt: String(args.reserved_at || new Date().toISOString()),
        tableCode: (args.table_code as string) || null,
        notes: (args.notes as string) || null,
      });
      return { ok: true, reservation: row };
    }
    case 'get_reservation_status': {
      return { ok: true, note: 'Use list via panel; status in reservation row.' };
    }
    case 'get_faqs': {
      const faqs = await listRestappFaqs(teamId);
      return { ok: true, faqs: faqs.filter((f) => f.is_active !== false).slice(0, 30) };
    }
    case 'get_promotions': {
      const promos = await listRestappPromotions(teamId);
      return { ok: true, promotions: promos.filter((p) => p.is_active !== false) };
    }
    case 'request_human_handoff':
      return {
        ok: true,
        handoff: true,
        instruction: 'Pausar IA, no enviar respuesta automática, notificar al equipo humano y registrar handoff.',
      };
    default:
      return { ok: false, error: 'unknown_tool' };
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
