/**
 * RestaPP AI — integration helpers for external CRM / POS.
 * Inbound: restaurant essentials, catalog, tables, branches.
 * Outbound consumers use GET orders/reservations (see OpenAPI).
 */
import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  createBranch,
  createCategory,
  createMenuItem,
  createTable,
  syncMenuItemPrice,
  updateBranch,
  updateMenuItem,
  updateTableStatus,
} from './crud';
import { hasPriceInPayload, normalizeProductMoneyFields, parseMoney } from './money';
import {
  ensureRestappTables,
  getRestappSettings,
  listRestappBranches,
  listRestappMenu,
  listRestappTables,
  logRestappActivity,
  updateRestappOrderStatus,
  upsertRestappSettings,
} from './db';

type Row = Record<string, any>;

function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const maybe = result as { rows?: Row[] } | null;
  return Array.isArray(maybe?.rows) ? maybe.rows : [];
}

function one(result: unknown): Row | null {
  return rows(result)[0] || null;
}

let schemaReady: Promise<void> | null = null;

/** Extra columns for external system IDs + CRM webhook. */
export async function ensureRestappIntegrationSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureRestappTables();
      const alters = [
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS external_id VARCHAR(120)`,
        `ALTER TABLE restapp_tables ADD COLUMN IF NOT EXISTS external_id VARCHAR(120)`,
        `ALTER TABLE restapp_branches ADD COLUMN IF NOT EXISTS external_id VARCHAR(120)`,
        `ALTER TABLE restapp_categories ADD COLUMN IF NOT EXISTS external_id VARCHAR(120)`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS external_id VARCHAR(120)`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS crm_webhook_url TEXT`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(40) DEFAULT 'crm'`,
        `CREATE UNIQUE INDEX IF NOT EXISTS restapp_menu_team_external_uidx ON restapp_menu_items (team_id, external_id) WHERE external_id IS NOT NULL AND external_id <> ''`,
        `CREATE UNIQUE INDEX IF NOT EXISTS restapp_tables_team_external_uidx ON restapp_tables (team_id, external_id) WHERE external_id IS NOT NULL AND external_id <> ''`,
        `CREATE UNIQUE INDEX IF NOT EXISTS restapp_branches_team_external_uidx ON restapp_branches (team_id, external_id) WHERE external_id IS NOT NULL AND external_id <> ''`,
      ];
      for (const q of alters) {
        await db.execute(sql.raw(q)).catch(() => null);
      }
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  await schemaReady;
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

/** Optional Google Geocoding (server key). Never required for basic delivery quote. */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; formatted: string } | null> {
  const key = String(
    process.env.GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_GEOCODING_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      ''
  ).trim();
  if (!key || !address.trim()) return null;
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', key);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const r = data?.results?.[0];
    if (!r?.geometry?.location) return null;
    return {
      lat: Number(r.geometry.location.lat),
      lng: Number(r.geometry.location.lng),
      formatted: String(r.formatted_address || address),
    };
  } catch {
    return null;
  }
}

/**
 * Delivery quote for AI + CRM.
 * Recommended model: AllSender estimates coverage/fee from branch rules (Haversine).
 * The restaurant CRM owns fleet / courier API and receives order payload with lat/lng/fee.
 */
export async function quoteDelivery(
  teamId: number,
  input: {
    lat?: number | null;
    lng?: number | null;
    address?: string | null;
    branch_id?: number | null;
  }
) {
  await ensureRestappIntegrationSchema();
  let lat = input.lat != null ? Number(input.lat) : NaN;
  let lng = input.lng != null ? Number(input.lng) : NaN;
  let geocoded: { lat: number; lng: number; formatted: string } | null = null;

  if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && input.address) {
    geocoded = await geocodeAddress(String(input.address));
    if (geocoded) {
      lat = geocoded.lat;
      lng = geocoded.lng;
    }
  }

  const branches = (await listRestappBranches(teamId)).filter((b) => b.is_active !== false);
  if (!branches.length) {
    return {
      ok: false,
      error: 'no_branches',
      message: 'Configura al menos una sucursal con lat/lng y cobertura.',
      delivery_owner: 'crm',
    };
  }

  let best = branches[0];
  let bestD = Infinity;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    for (const b of branches) {
      if (input.branch_id && Number(b.id) !== Number(input.branch_id)) continue;
      if (b.lat == null || b.lng == null) continue;
      const d = haversineKm(lat, lng, Number(b.lat), Number(b.lng));
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
  } else if (input.branch_id) {
    best = branches.find((b) => Number(b.id) === Number(input.branch_id)) || best;
    bestD = NaN;
  }

  const coverage = Number(best.coverage_km || 5);
  const inCoverage = Number.isFinite(bestD) ? bestD <= coverage : true;
  const settings = await getRestappSettings(teamId);

  return {
    ok: true,
    delivery_owner: String(settings?.delivery_mode || 'crm'),
    note:
      'AllSender estima cobertura y tarifa. El CRM del restaurante ejecuta la entrega real con su flota o API de delivery.',
    in_coverage: inCoverage,
    distance_km: Number.isFinite(bestD) ? Number(bestD.toFixed(2)) : null,
    delivery_fee: inCoverage ? Number(best.delivery_fee || 0) : null,
    eta_minutes: inCoverage ? Number(best.delivery_eta_min || 40) : null,
    currency: settings?.currency || 'DOP',
    customer: {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      address: geocoded?.formatted || input.address || null,
      geocoded: Boolean(geocoded),
    },
    branch: {
      id: best.id,
      name: best.name,
      address: best.address,
      lat: best.lat,
      lng: best.lng,
      coverage_km: coverage,
      phone: best.phone,
    },
    offer_pickup: !inCoverage,
  };
}

export async function importRestaurantEssentials(teamId: number, body: Record<string, unknown>) {
  await ensureRestappIntegrationSchema();
  const patch: Record<string, unknown> = {
    agent_provider: 'inherit',
    setup_completed: true,
  };
  if (body.restaurant_name != null || body.name != null) {
    patch.restaurant_name = String(body.restaurant_name || body.name || '');
  }
  if (body.legal_name != null) patch.legal_name = String(body.legal_name);
  if (body.tagline != null) patch.tagline = String(body.tagline);
  if (body.phone != null) patch.phone = String(body.phone);
  if (body.email != null) patch.email = String(body.email);
  if (body.address != null) patch.address = String(body.address);
  if (body.lat != null) patch.lat = Number(body.lat);
  if (body.lng != null) patch.lng = Number(body.lng);
  if (body.country != null) patch.country = String(body.country);
  if (body.currency != null) patch.currency = String(body.currency);
  if (body.language != null) patch.language = String(body.language);
  if (body.timezone != null) patch.timezone = String(body.timezone);
  if (body.tax_rate != null) patch.tax_rate = Number(body.tax_rate);
  if (body.service_fee != null) patch.service_fee = Number(body.service_fee);
  if (body.modes != null) patch.modes = body.modes;
  if (body.payment_methods != null) patch.payment_methods = body.payment_methods;
  if (body.is_active != null) patch.is_active = Boolean(body.is_active);
  if (body.agent_enabled != null) patch.agent_enabled = Boolean(body.agent_enabled);
  if (body.crm_webhook_url != null) patch.crm_webhook_url = String(body.crm_webhook_url);
  if (body.delivery_mode != null) patch.delivery_mode = String(body.delivery_mode);

  // Geocode address if no coords
  if ((patch.lat == null || patch.lng == null) && patch.address) {
    const g = await geocodeAddress(String(patch.address));
    if (g) {
      patch.lat = g.lat;
      patch.lng = g.lng;
      if (!patch.address) patch.address = g.formatted;
    }
  }

  const row = await upsertRestappSettings(teamId, patch);
  // Integration columns (crm webhook + delivery ownership) updated separately
  if (patch.crm_webhook_url != null || patch.delivery_mode != null) {
    await db
      .execute(sql`
        UPDATE restapp_settings SET
          crm_webhook_url = COALESCE(${patch.crm_webhook_url != null ? String(patch.crm_webhook_url) : null}, crm_webhook_url),
          delivery_mode = COALESCE(${patch.delivery_mode != null ? String(patch.delivery_mode) : null}, delivery_mode),
          updated_at = NOW()
        WHERE team_id = ${teamId}
      `)
      .catch(() => null);
  }
  await logRestappActivity(teamId, 'import', 'Datos esenciales del restaurante importados vía API', {
    source: 'restapp-api',
  });
  return getRestappSettings(teamId);
}

export async function upsertProduct(teamId: number, data: Record<string, unknown>) {
  await ensureRestappIntegrationSchema();
  // Normalize price aliases (precio, unit_price, RD$…) before create/update
  const payload = normalizeProductMoneyFields(data || {});
  const externalId = payload.external_id != null ? String(payload.external_id).slice(0, 120) : null;
  const name = String(payload.name || '').trim();
  if (!name && !externalId) throw new Error('name_or_external_id_required');

  if (externalId) {
    const existing = one(
      await db.execute(sql`
        SELECT id FROM restapp_menu_items
        WHERE team_id = ${teamId} AND external_id = ${externalId}
        LIMIT 1
      `)
    );
    if (existing?.id) {
      const updated = await updateMenuItem(teamId, Number(existing.id), payload);
      await db
        .execute(sql`
          UPDATE restapp_menu_items SET external_id = ${externalId}
          WHERE id = ${Number(existing.id)} AND team_id = ${teamId}
        `)
        .catch(() => null);
      return { action: 'updated', item: updated };
    }
  }

  // match by name if no external
  if (!externalId && name) {
    const existing = one(
      await db.execute(sql`
        SELECT id FROM restapp_menu_items
        WHERE team_id = ${teamId} AND lower(name) = ${name.toLowerCase()}
        LIMIT 1
      `)
    );
    if (existing?.id) {
      return { action: 'updated', item: await updateMenuItem(teamId, Number(existing.id), payload) };
    }
  }

  const created = await createMenuItem(teamId, payload);
  if (externalId && created?.id) {
    await db
      .execute(sql`
        UPDATE restapp_menu_items SET external_id = ${externalId}
        WHERE id = ${Number(created.id)} AND team_id = ${teamId}
      `)
      .catch(() => null);
    created.external_id = externalId;
  }
  return { action: 'created', item: created };
}

/**
 * Re-sync prices only (safe re-import).
 * Match by: id | external_id | name (case-insensitive).
 * Body: { products: [{ name|external_id|id, price|precio }] } or plain array.
 * Skips rows without a parseable price — never wipes existing prices with 0 by omission.
 */
export async function syncProductPrices(teamId: number, body: unknown) {
  await ensureRestappIntegrationSchema();
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const list: any[] = Array.isArray(body)
    ? body
    : Array.isArray(raw.products)
      ? raw.products
      : Array.isArray(raw.prices)
        ? raw.prices
        : Array.isArray(raw.menu)
          ? raw.menu
          : Array.isArray(raw.items)
            ? raw.items
            : Array.isArray(raw.catalog)
              ? raw.catalog
              : [];

  const updated: any[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (!hasPriceInPayload(r) && r.price == null && r.precio == null) {
      skipped.push(String(r.name || r.external_id || r.id || '?'));
      continue;
    }
    const price = parseMoney(r.price ?? r.precio ?? r.unit_price ?? r.unitPrice ?? r.amount, Number.NaN);
    if (!Number.isFinite(price)) {
      skipped.push(String(r.name || r.external_id || r.id || '?'));
      continue;
    }
    try {
      const item = await syncMenuItemPrice(
        teamId,
        {
          id: r.id != null && r.id !== '' ? Number(r.id) : undefined,
          external_id: r.external_id != null ? String(r.external_id) : null,
          name: r.name != null ? String(r.name) : r.nombre != null ? String(r.nombre) : null,
        },
        price,
        r.currency != null ? String(r.currency) : r.moneda != null ? String(r.moneda) : null
      );
      updated.push({ id: item.id, name: item.name, price: item.price, action: 'price_updated' });
    } catch (e: any) {
      errors.push(`${r.name || r.external_id || r.id}: ${e?.message || e}`);
    }
  }

  await logRestappActivity(teamId, 'import', 'Sincronización de precios de menú', {
    updated: updated.length,
    skipped: skipped.length,
    errors: errors.length,
  });

  return {
    ok: errors.length === 0,
    updated: updated.length,
    skipped: skipped.length,
    errors,
    items: updated,
  };
}

export async function upsertTable(teamId: number, data: Record<string, unknown>) {
  await ensureRestappIntegrationSchema();
  const externalId = data.external_id != null ? String(data.external_id).slice(0, 120) : null;
  const code = String(data.code || data.name || '').trim();
  if (!code && !externalId) throw new Error('code_or_external_id_required');

  if (externalId) {
    const existing = one(
      await db.execute(sql`
        SELECT id FROM restapp_tables
        WHERE team_id = ${teamId} AND external_id = ${externalId}
        LIMIT 1
      `)
    );
    if (existing?.id) {
      if (data.status) await updateTableStatus(teamId, Number(existing.id), String(data.status));
      await db.execute(sql`
        UPDATE restapp_tables SET
          name = COALESCE(${data.name != null ? String(data.name) : null}, name),
          seats = COALESCE(${data.seats != null ? Number(data.seats) : null}, seats),
          zone = COALESCE(${data.zone != null ? String(data.zone) : null}, zone),
          branch_id = COALESCE(${data.branch_id != null ? Number(data.branch_id) : null}, branch_id),
          external_id = ${externalId}
        WHERE id = ${Number(existing.id)} AND team_id = ${teamId}
      `);
      return {
        action: 'updated',
        item: one(
          await db.execute(sql`SELECT * FROM restapp_tables WHERE id = ${Number(existing.id)} AND team_id = ${teamId}`)
        ),
      };
    }
  }

  const created = await createTable(teamId, { ...data, code: code || externalId });
  if (externalId && created?.id) {
    await db
      .execute(sql`
        UPDATE restapp_tables SET external_id = ${externalId}
        WHERE id = ${Number(created.id)} AND team_id = ${teamId}
      `)
      .catch(() => null);
    created.external_id = externalId;
  }
  return { action: 'created', item: created };
}

export async function upsertBranch(teamId: number, data: Record<string, unknown>) {
  await ensureRestappIntegrationSchema();
  const externalId = data.external_id != null ? String(data.external_id).slice(0, 120) : null;

  if ((data.lat == null || data.lng == null) && data.address) {
    const g = await geocodeAddress(String(data.address));
    if (g) {
      data.lat = g.lat;
      data.lng = g.lng;
    }
  }

  if (externalId) {
    const existing = one(
      await db.execute(sql`
        SELECT id FROM restapp_branches
        WHERE team_id = ${teamId} AND external_id = ${externalId}
        LIMIT 1
      `)
    );
    if (existing?.id) {
      const updated = await updateBranch(teamId, Number(existing.id), data);
      await db
        .execute(sql`
          UPDATE restapp_branches SET external_id = ${externalId}
          WHERE id = ${Number(existing.id)} AND team_id = ${teamId}
        `)
        .catch(() => null);
      return { action: 'updated', item: updated };
    }
  }

  const created = await createBranch(teamId, data);
  if (externalId && created?.id) {
    await db
      .execute(sql`
        UPDATE restapp_branches SET external_id = ${externalId}
        WHERE id = ${Number(created.id)} AND team_id = ${teamId}
      `)
      .catch(() => null);
    created.external_id = externalId;
  }
  return { action: 'created', item: created };
}

/** Bulk import from external POS/CRM. */
export async function bulkImport(teamId: number, body: Record<string, unknown>) {
  await ensureRestappIntegrationSchema();
  const summary: Record<string, unknown> = {
    restaurant: null,
    branches: [] as any[],
    categories: [] as any[],
    products: [] as any[],
    tables: [] as any[],
    errors: [] as string[],
  };

  try {
    if (body.restaurant && typeof body.restaurant === 'object') {
      summary.restaurant = await importRestaurantEssentials(teamId, body.restaurant as any);
    } else if (body.restaurant_name || body.name) {
      summary.restaurant = await importRestaurantEssentials(teamId, body);
    }
  } catch (e: any) {
    (summary.errors as string[]).push(`restaurant: ${e?.message || e}`);
  }

  const branches = Array.isArray(body.branches) ? body.branches : [];
  for (const b of branches) {
    try {
      (summary.branches as any[]).push(await upsertBranch(teamId, b || {}));
    } catch (e: any) {
      (summary.errors as string[]).push(`branch: ${e?.message || e}`);
    }
  }

  const categories = Array.isArray(body.categories) ? body.categories : [];
  for (const c of categories) {
    try {
      const cat = await createCategory(teamId, c || {});
      const ext = c?.external_id != null ? String(c.external_id) : null;
      if (ext && cat?.id) {
        await db
          .execute(sql`UPDATE restapp_categories SET external_id = ${ext} WHERE id = ${cat.id} AND team_id = ${teamId}`)
          .catch(() => null);
      }
      (summary.categories as any[]).push({ action: 'created', item: cat });
    } catch (e: any) {
      (summary.errors as string[]).push(`category: ${e?.message || e}`);
    }
  }

  const products = Array.isArray(body.products)
    ? body.products
    : Array.isArray(body.menu)
      ? body.menu
      : Array.isArray(body.catalog)
        ? body.catalog
        : [];

  // prices-only re-sync: POST /import { sync_prices: true, products: [...] }
  const pricesOnly =
    body.sync_prices === true ||
    body.sync_prices === 'true' ||
    body.prices_only === true ||
    body.mode === 'prices' ||
    body.mode === 'sync_prices';

  if (pricesOnly && products.length) {
    const priceResult = await syncProductPrices(teamId, { products });
    summary.products = priceResult.items;
    (summary.errors as string[]).push(...priceResult.errors);
    await logRestappActivity(teamId, 'import', 'Importación bulk (solo precios)', {
      updated: priceResult.updated,
      errors: priceResult.errors.length,
    });
    return {
      ok: priceResult.ok,
      mode: 'sync_prices',
      summary: {
        ...summary,
        counts: {
          products: priceResult.updated,
          tables: 0,
          branches: 0,
          categories: 0,
          errors: priceResult.errors.length,
          skipped: priceResult.skipped,
        },
      },
      snapshot: {
        menu_count: (await listRestappMenu(teamId)).length,
        tables_count: (await listRestappTables(teamId)).length,
        branches_count: (await listRestappBranches(teamId)).length,
      },
    };
  }

  for (const p of products) {
    try {
      (summary.products as any[]).push(await upsertProduct(teamId, p || {}));
    } catch (e: any) {
      (summary.errors as string[]).push(`product: ${e?.message || e}`);
    }
  }

  const tables = Array.isArray(body.tables) ? body.tables : [];
  for (const t of tables) {
    try {
      (summary.tables as any[]).push(await upsertTable(teamId, t || {}));
    } catch (e: any) {
      (summary.errors as string[]).push(`table: ${e?.message || e}`);
    }
  }

  await logRestappActivity(teamId, 'import', 'Importación bulk vía API', {
    products: (summary.products as any[]).length,
    tables: (summary.tables as any[]).length,
    branches: (summary.branches as any[]).length,
    errors: (summary.errors as string[]).length,
  });

  return {
    ok: (summary.errors as string[]).length === 0,
    summary: {
      ...summary,
      counts: {
        products: (summary.products as any[]).length,
        tables: (summary.tables as any[]).length,
        branches: (summary.branches as any[]).length,
        categories: (summary.categories as any[]).length,
        errors: (summary.errors as string[]).length,
      },
    },
    snapshot: {
      menu_count: (await listRestappMenu(teamId)).length,
      tables_count: (await listRestappTables(teamId)).length,
      branches_count: (await listRestappBranches(teamId)).length,
    },
  };
}

export async function patchOrderForCrm(
  teamId: number,
  orderId: number,
  body: Record<string, unknown>
) {
  await ensureRestappIntegrationSchema();
  if (body.status) {
    const order = await updateRestappOrderStatus(teamId, orderId, String(body.status));
    if (body.external_id != null && order?.id) {
      await db
        .execute(sql`
          UPDATE restapp_orders SET external_id = ${String(body.external_id).slice(0, 120)}
          WHERE id = ${orderId} AND team_id = ${teamId}
        `)
        .catch(() => null);
    }
    return order;
  }
  if (body.external_id != null) {
    return one(
      await db.execute(sql`
        UPDATE restapp_orders SET external_id = ${String(body.external_id).slice(0, 120)}, updated_at = NOW()
        WHERE id = ${orderId} AND team_id = ${teamId}
        RETURNING *
      `)
    );
  }
  throw new Error('status_or_external_id_required');
}

/** Notify CRM webhook if configured (non-blocking best effort). */
export async function notifyCrmWebhook(teamId: number, event: string, payload: Record<string, unknown>) {
  try {
    await ensureRestappIntegrationSchema();
    const s = await getRestappSettings(teamId);
    const url = String((s as any)?.crm_webhook_url || '').trim();
    if (!url.startsWith('http')) return { sent: false, reason: 'no_webhook' };
    const body = {
      event,
      team_id: teamId,
      source: 'allsender_restapp_ai',
      timestamp: new Date().toISOString(),
      data: payload,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AllSender-Event': event },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    return { sent: Boolean(res?.ok), status: res?.status };
  } catch {
    return { sent: false, reason: 'error' };
  }
}
