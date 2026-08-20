import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { ensureRestappTables, logRestappActivity } from './db';
import { hasPriceInPayload, normalizeProductMoneyFields, parseMoney, pickPrice } from './money';

type Row = Record<string, any>;
function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const maybe = result as { rows?: Row[] } | null;
  return Array.isArray(maybe?.rows) ? maybe.rows : [];
}
function one(result: unknown): Row | null {
  return rows(result)[0] || null;
}

export async function createBranch(teamId: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('name_required');
  const result = await db.execute(sql`
    INSERT INTO restapp_branches (
      team_id, name, code, phone, address, reference, lat, lng,
      coverage_km, delivery_fee, delivery_eta_min, schedule_json, is_active
    ) VALUES (
      ${teamId}, ${name}, ${data.code ? String(data.code) : null},
      ${data.phone ? String(data.phone) : null}, ${data.address ? String(data.address) : null},
      ${data.reference ? String(data.reference) : null},
      ${data.lat != null && data.lat !== '' ? Number(data.lat) : null},
      ${data.lng != null && data.lng !== '' ? Number(data.lng) : null},
      ${Number(data.coverage_km ?? 5)}, ${Number(data.delivery_fee ?? 0)},
      ${Number(data.delivery_eta_min ?? 40)},
      ${JSON.stringify(data.schedule_json || {})}::jsonb,
      ${data.is_active === false || data.is_active === 'false' ? false : true}
    ) RETURNING *
  `);
  const row = one(result);
  await logRestappActivity(teamId, 'branch', `Sucursal creada: ${name}`, { id: row?.id });
  return row;
}

export async function updateBranch(teamId: number, id: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  await db.execute(sql`
    UPDATE restapp_branches SET
      name = COALESCE(${data.name != null ? String(data.name) : null}, name),
      code = COALESCE(${data.code != null ? String(data.code) : null}, code),
      phone = COALESCE(${data.phone != null ? String(data.phone) : null}, phone),
      address = COALESCE(${data.address != null ? String(data.address) : null}, address),
      reference = COALESCE(${data.reference != null ? String(data.reference) : null}, reference),
      lat = COALESCE(${data.lat != null && data.lat !== '' ? Number(data.lat) : null}, lat),
      lng = COALESCE(${data.lng != null && data.lng !== '' ? Number(data.lng) : null}, lng),
      coverage_km = COALESCE(${data.coverage_km != null ? Number(data.coverage_km) : null}, coverage_km),
      delivery_fee = COALESCE(${data.delivery_fee != null ? Number(data.delivery_fee) : null}, delivery_fee),
      delivery_eta_min = COALESCE(${data.delivery_eta_min != null ? Number(data.delivery_eta_min) : null}, delivery_eta_min),
      is_active = COALESCE(${data.is_active != null ? data.is_active === true || data.is_active === 'true' || data.is_active === 'on' : null}, is_active)
    WHERE id = ${id} AND team_id = ${teamId}
  `);
  return one(await db.execute(sql`SELECT * FROM restapp_branches WHERE id = ${id} AND team_id = ${teamId}`));
}

export async function createTable(teamId: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  const code = String(data.code || data.name || '').trim();
  const name = String(data.name || code).trim();
  if (!code) throw new Error('code_required');
  const result = await db.execute(sql`
    INSERT INTO restapp_tables (
      team_id, branch_id, code, name, seats, zone, floor_label, status, combinable, accessible, is_active
    ) VALUES (
      ${teamId},
      ${data.branch_id ? Number(data.branch_id) : null},
      ${code}, ${name}, ${Math.max(1, Number(data.seats || 4))},
      ${String(data.zone || 'Salón')}, ${data.floor_label ? String(data.floor_label) : null},
      ${String(data.status || 'free')},
      ${data.combinable === true || data.combinable === 'on'},
      ${data.accessible === true || data.accessible === 'on'},
      true
    )
    ON CONFLICT (team_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      seats = EXCLUDED.seats,
      zone = EXCLUDED.zone,
      is_active = true
    RETURNING *
  `);
  return one(result);
}

export async function updateTableStatus(teamId: number, id: number, status: string) {
  await ensureRestappTables();
  const allowed = ['free', 'reserved', 'occupied', 'cleaning', 'out_of_service'];
  const st = allowed.includes(status) ? status : 'free';
  return one(await db.execute(sql`
    UPDATE restapp_tables SET status = ${st}
    WHERE id = ${id} AND team_id = ${teamId}
    RETURNING *
  `));
}

export async function createCategory(teamId: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('name_required');
  return one(await db.execute(sql`
    INSERT INTO restapp_categories (team_id, name, description, image_url, sort_order, is_active)
    VALUES (
      ${teamId}, ${name}, ${data.description ? String(data.description) : null},
      ${data.image_url ? String(data.image_url) : null},
      ${Number(data.sort_order || 0)}, true
    ) RETURNING *
  `));
}

export async function createMenuItem(teamId: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  const normalized = normalizeProductMoneyFields(data);
  const name = String(normalized.name || '').trim();
  if (!name) throw new Error('name_required');
  const category = String(normalized.category || 'General');
  // NUMERIC via string avoids float/NaN binding issues across drizzle/postgres drivers
  const price = hasPriceInPayload(data) || normalized.__pricePresent ? pickPrice(normalized as any, 0) : pickPrice(data, 0);
  const priceSql = Number(price || 0).toFixed(2);
  const currency = String(normalized.currency || data.currency || 'DOP').slice(0, 8) || 'DOP';
  return one(await db.execute(sql`
    INSERT INTO restapp_menu_items (
      team_id, category_id, category, name, description, price, currency, image_url,
      ingredients, allergens, tags, is_spicy, is_vegetarian, is_vegan,
      is_recommended, is_bestseller, is_promo, prep_minutes, stock, is_available, sort_order, variants_json
    ) VALUES (
      ${teamId},
      ${normalized.category_id ? Number(normalized.category_id) : null},
      ${category}, ${name}, ${normalized.description ? String(normalized.description) : null},
      ${priceSql}, ${currency},
      ${normalized.image_url ? String(normalized.image_url) : null},
      ${normalized.ingredients ? String(normalized.ingredients) : null},
      ${normalized.allergens ? String(normalized.allergens) : null},
      ${JSON.stringify(typeof normalized.tags === 'string' ? String(normalized.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : normalized.tags || [])}::jsonb,
      ${normalized.is_spicy === true || normalized.is_spicy === 'on'},
      ${normalized.is_vegetarian === true || normalized.is_vegetarian === 'on'},
      ${normalized.is_vegan === true || normalized.is_vegan === 'on'},
      ${normalized.is_recommended === true || normalized.is_recommended === 'on'},
      ${normalized.is_bestseller === true || normalized.is_bestseller === 'on'},
      ${normalized.is_promo === true || normalized.is_promo === 'on'},
      ${normalized.prep_minutes != null && normalized.prep_minutes !== '' ? Number(normalized.prep_minutes) : 15},
      ${normalized.stock !== '' && normalized.stock != null ? Number(normalized.stock) : null},
      ${normalized.is_available === false || normalized.is_available === 'false' ? false : true},
      ${Number(normalized.sort_order || 0)},
      ${JSON.stringify(normalized.variants_json || [])}::jsonb
    ) RETURNING *
  `));
}

export async function updateMenuItem(teamId: number, id: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  // Only touch price when the payload intentionally includes it (re-sync safe)
  const hasPriceField =
    data.__pricePresent === true ||
    data.__pricePresent === 'true' ||
    hasPriceInPayload(data);
  const priceParsed = hasPriceField ? pickPrice(data, 0) : null;
  const priceSql = priceParsed != null && Number.isFinite(priceParsed) ? priceParsed.toFixed(2) : null;

  if (priceSql != null) {
    // Force update even when previous was 0.00 (COALESCE would still work with string)
    await db.execute(sql`
      UPDATE restapp_menu_items SET
        name = COALESCE(${data.name != null ? String(data.name) : null}, name),
        description = COALESCE(${data.description != null ? String(data.description) : null}, description),
        category = COALESCE(${data.category != null ? String(data.category) : null}, category),
        price = ${priceSql},
        currency = COALESCE(${data.currency != null ? String(data.currency).slice(0, 8) : null}, currency),
        image_url = COALESCE(${data.image_url != null ? String(data.image_url) : null}, image_url),
        ingredients = COALESCE(${data.ingredients != null ? String(data.ingredients) : null}, ingredients),
        allergens = COALESCE(${data.allergens != null ? String(data.allergens) : null}, allergens),
        is_spicy = COALESCE(${data.is_spicy != null ? data.is_spicy === true || data.is_spicy === 'on' : null}, is_spicy),
        is_vegetarian = COALESCE(${data.is_vegetarian != null ? data.is_vegetarian === true || data.is_vegetarian === 'on' : null}, is_vegetarian),
        is_vegan = COALESCE(${data.is_vegan != null ? data.is_vegan === true || data.is_vegan === 'on' : null}, is_vegan),
        is_available = COALESCE(${data.is_available != null ? !(data.is_available === false || data.is_available === 'false') : null}, is_available),
        stock = COALESCE(${data.stock !== '' && data.stock != null ? Number(data.stock) : null}, stock)
      WHERE id = ${id} AND team_id = ${teamId}
    `);
  } else {
    await db.execute(sql`
      UPDATE restapp_menu_items SET
        name = COALESCE(${data.name != null ? String(data.name) : null}, name),
        description = COALESCE(${data.description != null ? String(data.description) : null}, description),
        category = COALESCE(${data.category != null ? String(data.category) : null}, category),
        image_url = COALESCE(${data.image_url != null ? String(data.image_url) : null}, image_url),
        ingredients = COALESCE(${data.ingredients != null ? String(data.ingredients) : null}, ingredients),
        allergens = COALESCE(${data.allergens != null ? String(data.allergens) : null}, allergens),
        is_spicy = COALESCE(${data.is_spicy != null ? data.is_spicy === true || data.is_spicy === 'on' : null}, is_spicy),
        is_vegetarian = COALESCE(${data.is_vegetarian != null ? data.is_vegetarian === true || data.is_vegetarian === 'on' : null}, is_vegetarian),
        is_vegan = COALESCE(${data.is_vegan != null ? data.is_vegan === true || data.is_vegan === 'on' : null}, is_vegan),
        is_available = COALESCE(${data.is_available != null ? !(data.is_available === false || data.is_available === 'false') : null}, is_available),
        stock = COALESCE(${data.stock !== '' && data.stock != null ? Number(data.stock) : null}, stock)
      WHERE id = ${id} AND team_id = ${teamId}
    `);
  }
  return one(await db.execute(sql`SELECT * FROM restapp_menu_items WHERE id = ${id} AND team_id = ${teamId}`));
}

/** Force-update prices only (by id / external_id / name). Used by UI re-sync and API /prices. */
export async function syncMenuItemPrice(
  teamId: number,
  match: { id?: number; external_id?: string | null; name?: string | null },
  priceRaw: unknown,
  currency?: string | null
) {
  await ensureRestappTables();
  const price = parseMoney(priceRaw, Number.NaN);
  if (!Number.isFinite(price) || price < 0) throw new Error('invalid_price');
  const priceSql = price.toFixed(2);
  const cur = currency ? String(currency).slice(0, 8) : null;

  let row: Row | null = null;
  if (match.id) {
    row = one(
      await db.execute(sql`
        UPDATE restapp_menu_items SET
          price = ${priceSql},
          currency = COALESCE(${cur}, currency)
        WHERE id = ${Number(match.id)} AND team_id = ${teamId}
        RETURNING *
      `)
    );
  } else if (match.external_id) {
    const ext = String(match.external_id).slice(0, 120);
    row = one(
      await db.execute(sql`
        UPDATE restapp_menu_items SET
          price = ${priceSql},
          currency = COALESCE(${cur}, currency)
        WHERE team_id = ${teamId} AND external_id = ${ext}
        RETURNING *
      `)
    );
  } else if (match.name) {
    const n = String(match.name).trim().toLowerCase();
    row = one(
      await db.execute(sql`
        UPDATE restapp_menu_items SET
          price = ${priceSql},
          currency = COALESCE(${cur}, currency)
        WHERE team_id = ${teamId} AND lower(name) = ${n}
        RETURNING *
      `)
    );
  }
  if (!row) throw new Error('product_not_found');
  return row;
}

export async function toggleMenuAvailability(teamId: number, id: number, available: boolean) {
  await ensureRestappTables();
  return one(await db.execute(sql`
    UPDATE restapp_menu_items SET is_available = ${available}
    WHERE id = ${id} AND team_id = ${teamId} RETURNING *
  `));
}

export async function createModifier(teamId: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('name_required');
  return one(await db.execute(sql`
    INSERT INTO restapp_modifiers (
      team_id, name, group_name, price_extra, required, multi_select, min_qty, max_qty, is_active
    ) VALUES (
      ${teamId}, ${name}, ${String(data.group_name || 'Extras')},
      ${parseMoney(data.price_extra ?? data.precio_extra ?? data.extra, 0).toFixed(2)},
      ${data.required === true || data.required === 'on'},
      ${data.multi_select === false || data.multi_select === 'false' ? false : true},
      ${Number(data.min_qty || 0)}, ${Number(data.max_qty || 5)}, true
    ) RETURNING *
  `));
}

export async function createFaq(teamId: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  const question = String(data.question || '').trim();
  const answer = String(data.answer || '').trim();
  if (!question || !answer) throw new Error('faq_required');
  return one(await db.execute(sql`
    INSERT INTO restapp_faqs (team_id, branch_id, category, question, answer, sort_order, is_active)
    VALUES (
      ${teamId},
      ${data.branch_id ? Number(data.branch_id) : null},
      ${String(data.category || 'General')},
      ${question}, ${answer}, ${Number(data.sort_order || 0)}, true
    ) RETURNING *
  `));
}

export async function updateFaq(teamId: number, id: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  await db.execute(sql`
    UPDATE restapp_faqs SET
      category = COALESCE(${data.category != null ? String(data.category) : null}, category),
      question = COALESCE(${data.question != null ? String(data.question) : null}, question),
      answer = COALESCE(${data.answer != null ? String(data.answer) : null}, answer),
      is_active = COALESCE(${data.is_active != null ? data.is_active === true || data.is_active === 'on' || data.is_active === 'true' : null}, is_active),
      sort_order = COALESCE(${data.sort_order != null ? Number(data.sort_order) : null}, sort_order)
    WHERE id = ${id} AND team_id = ${teamId}
  `);
  return one(await db.execute(sql`SELECT * FROM restapp_faqs WHERE id = ${id} AND team_id = ${teamId}`));
}

export async function deleteFaq(teamId: number, id: number) {
  await ensureRestappTables();
  await db.execute(sql`DELETE FROM restapp_faqs WHERE id = ${id} AND team_id = ${teamId}`);
}

export async function createTeamMember(teamId: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  const name = String(data.name || '').trim();
  if (!name) throw new Error('name_required');
  const role = String(data.role || 'staff');
  const perms = Array.isArray(data.permissions)
    ? data.permissions
    : String(data.permissions || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
  return one(await db.execute(sql`
    INSERT INTO restapp_team_members (team_id, user_id, name, email, role, permissions, is_active)
    VALUES (
      ${teamId},
      ${data.user_id ? Number(data.user_id) : null},
      ${name}, ${data.email ? String(data.email) : null},
      ${role}, ${JSON.stringify(perms)}::jsonb, true
    ) RETURNING *
  `));
}

export async function createPromotion(teamId: number, data: Record<string, unknown>) {
  await ensureRestappTables();
  const title = String(data.title || '').trim();
  if (!title) throw new Error('title_required');
  return one(await db.execute(sql`
    INSERT INTO restapp_promotions (
      team_id, branch_id, title, description, discount_type, discount_value, starts_at, ends_at, is_active
    ) VALUES (
      ${teamId},
      ${data.branch_id ? Number(data.branch_id) : null},
      ${title}, ${data.description ? String(data.description) : null},
      ${String(data.discount_type || 'percent')},
      ${Number(data.discount_value || 0)},
      ${data.starts_at ? String(data.starts_at) : null},
      ${data.ends_at ? String(data.ends_at) : null},
      true
    ) RETURNING *
  `));
}

export async function createManualOrder(teamId: number, data: Record<string, unknown>) {
  const { createRestappOrder, listRestappMenu } = await import('./db');
  const itemName = String(data.item_name || '').trim();
  const qty = Math.max(1, Number(data.qty || 1));
  if (!itemName) throw new Error('item_required');
  let unitPrice = pickPrice(data, 0);
  let productId = data.product_id ? Number(data.product_id) : null;
  if (!unitPrice || !productId) {
    const menu = await listRestappMenu(teamId);
    const found = menu.find((m) => String(m.name) === itemName || Number(m.id) === productId);
    if (found) {
      if (!unitPrice) unitPrice = Number(found.price || 0);
      if (!productId) productId = Number(found.id);
    }
  }
  if (!String(data.customer_phone || '').trim()) throw new Error('customer_phone_required');
  return createRestappOrder({
    teamId,
    branchId: data.branch_id ? Number(data.branch_id) : null,
    modality: String(data.modality || 'dine_in'),
    tableCode: data.table_code ? String(data.table_code) : null,
    customerName: String(data.customer_name || 'Cliente'),
    customerPhone: String(data.customer_phone || ''),
    customerAddress: data.customer_address ? String(data.customer_address) : null,
    paymentMethod: String(data.payment_method || 'cod'),
    items: [{ name: itemName, qty, unit_price: unitPrice, product_id: productId }],
    notes: data.notes ? String(data.notes) : null,
    deliveryFee: data.delivery_fee != null ? Number(data.delivery_fee) : 0,
  });
}

export async function createManualReservation(teamId: number, data: Record<string, unknown>) {
  const { createRestappReservation } = await import('./db');
  return createRestappReservation({
    teamId,
    branchId: data.branch_id ? Number(data.branch_id) : null,
    customerName: String(data.customer_name || ''),
    customerPhone: String(data.customer_phone || ''),
    partySize: Number(data.party_size || 2),
    reservedAt: String(data.reserved_at || new Date().toISOString()),
    tableCode: data.table_code ? String(data.table_code) : null,
    notes: data.notes ? String(data.notes) : null,
  });
}
