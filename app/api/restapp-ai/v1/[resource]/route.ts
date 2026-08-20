import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRestappRequest,
  isNextResponse,
  jsonError,
} from '@/lib/modules/restapp-ai/api-auth';
import {
  getRestappSettings,
  listRestappBranches,
  listRestappCategories,
  listRestappMenu,
  listRestappModifiers,
  listRestappOrders,
  listRestappReservations,
  listRestappTables,
  listRestappCustomers,
  listRestappActivity,
  listRestappPromotions,
  createRestappOrder,
  createRestappReservation,
  getRestappDashboard,
  updateRestappOrderStatus,
} from '@/lib/modules/restapp-ai/db';
import {
  bulkImport,
  importRestaurantEssentials,
  syncProductPrices,
  notifyCrmWebhook,
  patchOrderForCrm,
  quoteDelivery,
  upsertBranch,
  upsertProduct,
  upsertTable,
} from '@/lib/modules/restapp-ai/import-api';
import { createCategory, createModifier } from '@/lib/modules/restapp-ai/crud';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ resource: string }> | { resource: string } };

async function resourceName(ctx: Ctx) {
  const p = ctx.params && 'then' in ctx.params ? await ctx.params : ctx.params;
  return String(p.resource || '').toLowerCase();
}

export async function GET(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await authenticateRestappRequest(request);
    if (isNextResponse(auth)) return auth;
    const resource = await resourceName(ctx);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 100);
    const status = searchParams.get('status');
    const since = searchParams.get('since'); // ISO for CRM polling

    switch (resource) {
      case 'restaurant':
      case 'restaurants': {
        const s = await getRestappSettings(auth.teamId);
        return NextResponse.json({ ok: true, data: s });
      }
      case 'branches':
      case 'sucursales':
        return NextResponse.json({ ok: true, data: await listRestappBranches(auth.teamId) });
      case 'menu':
      case 'products':
      case 'productos':
      case 'catalog':
      case 'catalogo':
        return NextResponse.json({ ok: true, data: await listRestappMenu(auth.teamId) });
      case 'categories':
      case 'categorias':
        return NextResponse.json({ ok: true, data: await listRestappCategories(auth.teamId) });
      case 'modifiers':
      case 'modificadores':
        return NextResponse.json({ ok: true, data: await listRestappModifiers(auth.teamId) });
      case 'orders':
      case 'pedidos': {
        // CRM sync: list AI-created + all orders for the restaurant team
        let orders = await listRestappOrders(auth.teamId, limit, status);
        if (since) {
          const ts = Date.parse(since);
          if (!Number.isNaN(ts)) {
            orders = orders.filter((o: any) => {
              const created = Date.parse(String(o.created_at || o.updated_at || 0));
              return !Number.isNaN(created) && created >= ts;
            });
          }
        }
        return NextResponse.json({
          ok: true,
          data: orders,
          meta: {
            purpose: 'crm_sync',
            note: 'Pedidos creados por la IA de RestaPP y/o API. Gestiona estados en tu CRM y PATCH status aquí si deseas.',
            count: orders.length,
          },
        });
      }
      case 'reservations':
      case 'reservas':
        return NextResponse.json({
          ok: true,
          data: await listRestappReservations(auth.teamId, limit),
          meta: { purpose: 'crm_sync' },
        });
      case 'tables':
      case 'mesas':
        return NextResponse.json({ ok: true, data: await listRestappTables(auth.teamId) });
      case 'customers':
      case 'clientes':
        return NextResponse.json({ ok: true, data: await listRestappCustomers(auth.teamId, limit) });
      case 'promotions':
      case 'promociones':
        return NextResponse.json({ ok: true, data: await listRestappPromotions(auth.teamId) });
      case 'activity':
      case 'conversations':
      case 'conversaciones':
        return NextResponse.json({ ok: true, data: await listRestappActivity(auth.teamId, limit) });
      case 'dashboard':
        return NextResponse.json({ ok: true, data: await getRestappDashboard(auth.teamId) });
      case 'delivery-quote':
      case 'delivery_quote':
      case 'cotizacion-delivery': {
        const quote = await quoteDelivery(auth.teamId, {
          lat: searchParams.get('lat') != null ? Number(searchParams.get('lat')) : null,
          lng: searchParams.get('lng') != null ? Number(searchParams.get('lng')) : null,
          address: searchParams.get('address'),
          branch_id: searchParams.get('branch_id') != null ? Number(searchParams.get('branch_id')) : null,
        });
        return NextResponse.json(quote, { status: quote.ok ? 200 : 400 });
      }
      case 'openapi':
      case 'openapi.json':
        return NextResponse.redirect(new URL('/restapp-ai.openapi.json', request.url));
      case 'webhooks':
        return NextResponse.json({
          ok: true,
          data: {
            architecture: {
              inbound:
                'Tu POS/CRM envía catálogo, mesas, nombre, dirección y sucursales (POST import / products / tables / restaurant).',
              outbound:
                'Tu CRM consulta GET /orders y /reservations (lo que la IA creó) o recibe POST en crm_webhook_url.',
              delivery:
                'AllSender estima cobertura/tarifa (Haversine + opcional Google Geocoding). La entrega la ejecuta tu CRM/flota.',
            },
            events: ['order.created', 'order.updated', 'reservation.created'],
            configure_crm_webhook: 'POST /restaurant { "crm_webhook_url": "https://tu-crm.com/hooks/allsender" }',
            openapi: 'https://auth.allsender.tech/restapp-ai.openapi.json',
          },
        });
      default:
        return jsonError(`Unknown resource: ${resource}`, 404, {
          available: [
            'restaurant',
            'branches',
            'menu',
            'products',
            'categories',
            'modifiers',
            'orders',
            'reservations',
            'tables',
            'customers',
            'promotions',
            'activity',
            'dashboard',
            'delivery-quote',
            'import',
            'webhooks',
            'openapi',
          ],
          openapi: 'https://auth.allsender.tech/restapp-ai.openapi.json',
        });
    }
  } catch (e: any) {
    console.error('[restapp-ai/v1] GET', e);
    return jsonError('RestaPP API error', 500, { message: e?.message || String(e) });
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await authenticateRestappRequest(request);
    if (isNextResponse(auth)) return auth;
    const resource = await resourceName(ctx);
    const body = await request.json().catch(() => ({}));
    const idempotency = request.headers.get('idempotency-key') || body.idempotency_key || null;

    // ---- INBOUND: master data from external system ----
    if (resource === 'import' || resource === 'sync' || resource === 'bulk') {
      const result = await bulkImport(auth.teamId, body);
      return NextResponse.json(result, { status: result.ok ? 200 : 207 });
    }

    // Re-sync prices only (POS/CRM or dashboard)
    if (resource === 'prices' || resource === 'precios' || resource === 'sync-prices' || resource === 'sync_prices') {
      const result = await syncProductPrices(auth.teamId, body);
      return NextResponse.json(result, { status: result.ok ? 200 : 207 });
    }

    if (resource === 'restaurant' || resource === 'restaurants') {
      const data = await importRestaurantEssentials(auth.teamId, body);
      return NextResponse.json({ ok: true, data }, { status: 200 });
    }

    if (resource === 'products' || resource === 'productos' || resource === 'menu' || resource === 'catalog') {
      // POST products { sync_prices: true, products: [...] }
      if (body.sync_prices === true || body.sync_prices === 'true' || body.prices_only === true) {
        const result = await syncProductPrices(auth.teamId, body);
        return NextResponse.json(result, { status: result.ok ? 200 : 207 });
      }
      if (Array.isArray(body.items) || Array.isArray(body.products) || Array.isArray(body.menu)) {
        const list = body.items || body.products || body.menu;
        const out = [];
        for (const p of list) out.push(await upsertProduct(auth.teamId, p || {}));
        return NextResponse.json({ ok: true, data: out }, { status: 201 });
      }
      const row = await upsertProduct(auth.teamId, body);
      return NextResponse.json({ ok: true, data: row }, { status: 201 });
    }

    if (resource === 'tables' || resource === 'mesas') {
      if (Array.isArray(body.items) || Array.isArray(body.tables)) {
        const list = body.items || body.tables;
        const out = [];
        for (const t of list) out.push(await upsertTable(auth.teamId, t || {}));
        return NextResponse.json({ ok: true, data: out }, { status: 201 });
      }
      const row = await upsertTable(auth.teamId, body);
      return NextResponse.json({ ok: true, data: row }, { status: 201 });
    }

    if (resource === 'branches' || resource === 'sucursales') {
      if (Array.isArray(body.items) || Array.isArray(body.branches)) {
        const list = body.items || body.branches;
        const out = [];
        for (const b of list) out.push(await upsertBranch(auth.teamId, b || {}));
        return NextResponse.json({ ok: true, data: out }, { status: 201 });
      }
      const row = await upsertBranch(auth.teamId, body);
      return NextResponse.json({ ok: true, data: row }, { status: 201 });
    }

    if (resource === 'categories' || resource === 'categorias') {
      const row = await createCategory(auth.teamId, body);
      return NextResponse.json({ ok: true, data: row }, { status: 201 });
    }

    if (resource === 'modifiers' || resource === 'modificadores') {
      const row = await createModifier(auth.teamId, body);
      return NextResponse.json({ ok: true, data: row }, { status: 201 });
    }

    if (resource === 'delivery-quote' || resource === 'delivery_quote' || resource === 'cotizacion-delivery') {
      const quote = await quoteDelivery(auth.teamId, {
        lat: body.lat != null ? Number(body.lat) : null,
        lng: body.lng != null ? Number(body.lng) : null,
        address: body.address ?? body.customer_address ?? null,
        branch_id: body.branch_id != null ? Number(body.branch_id) : null,
      });
      return NextResponse.json(quote, { status: quote.ok ? 200 : 400 });
    }

    // ---- Orders / reservations (AI or external) ----
    if (resource === 'orders' || resource === 'pedidos') {
      const items = Array.isArray(body.items) ? body.items : [];
      const order = await createRestappOrder({
        teamId: auth.teamId,
        branchId: body.branch_id ?? null,
        chatId: body.chat_id ?? null,
        modality: String(body.modality || 'dine_in'),
        tableCode: body.table_code ?? null,
        customerName: String(body.customer_name || ''),
        customerPhone: String(body.customer_phone || ''),
        customerAddress: body.customer_address ?? null,
        customerLat: body.customer_lat != null ? Number(body.customer_lat) : null,
        customerLng: body.customer_lng != null ? Number(body.customer_lng) : null,
        paymentMethod: String(body.payment_method || 'cod'),
        items: items.map((i: any) => ({
          name: String(i.name || ''),
          qty: Number(i.qty || i.quantity || 1),
          unit_price: Number(i.unit_price ?? i.price ?? 0),
          product_id: i.product_id ?? null,
          customizations: i.customizations || i.notes_item || [],
        })),
        notes: body.notes
          ? `${body.notes}${idempotency ? ` [idem:${idempotency}]` : ''}`
          : idempotency
            ? `idem:${idempotency}`
            : null,
        deliveryFee: body.delivery_fee != null ? Number(body.delivery_fee) : 0,
        discount: body.discount != null ? Number(body.discount) : 0,
      });
      // Notify restaurant CRM so they manage fulfillment
      await notifyCrmWebhook(auth.teamId, 'order.created', { order }).catch(() => null);
      return NextResponse.json({ ok: true, data: order }, { status: 201 });
    }

    if (resource === 'reservations' || resource === 'reservas') {
      const row = await createRestappReservation({
        teamId: auth.teamId,
        branchId: body.branch_id ?? null,
        chatId: body.chat_id ?? null,
        customerName: String(body.customer_name || ''),
        customerPhone: String(body.customer_phone || ''),
        partySize: Number(body.party_size || 2),
        reservedAt: body.reserved_at || new Date().toISOString(),
        tableCode: body.table_code ?? null,
        notes: body.notes ?? null,
      });
      await notifyCrmWebhook(auth.teamId, 'reservation.created', { reservation: row }).catch(() => null);
      return NextResponse.json({ ok: true, data: row }, { status: 201 });
    }

    return jsonError(`POST not supported for resource: ${resource}`, 405, {
      supported: [
        'import',
        'restaurant',
        'products',
        'tables',
        'branches',
        'categories',
        'modifiers',
        'orders',
        'reservations',
        'delivery-quote',
      ],
      openapi: 'https://auth.allsender.tech/restapp-ai.openapi.json',
    });
  } catch (e: any) {
    console.error('[restapp-ai/v1] POST', e);
    return jsonError(e?.message || 'RestaPP API error', 500);
  }
}

/** CRM updates order status / external_id after managing delivery in their platform. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const auth = await authenticateRestappRequest(request);
    if (isNextResponse(auth)) return auth;
    const resource = await resourceName(ctx);
    const body = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const id = Number(body.id || body.order_id || searchParams.get('id') || 0);

    if (resource === 'orders' || resource === 'pedidos') {
      if (!id) return jsonError('id required', 400);
      const order = await patchOrderForCrm(auth.teamId, id, body);
      if (!order) return jsonError('order_not_found', 404);
      await notifyCrmWebhook(auth.teamId, 'order.updated', { order }).catch(() => null);
      return NextResponse.json({ ok: true, data: order });
    }

    if (resource === 'orders-status' || resource === 'order-status') {
      if (!id || !body.status) return jsonError('id and status required', 400);
      const order = await updateRestappOrderStatus(auth.teamId, id, String(body.status));
      return NextResponse.json({ ok: true, data: order });
    }

    return jsonError(`PATCH not supported for: ${resource}`, 405, { supported: ['orders'] });
  } catch (e: any) {
    console.error('[restapp-ai/v1] PATCH', e);
    return jsonError(e?.message || 'RestaPP API error', 500);
  }
}
