import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import type { RestappAgentParams, RestappModality, RestappSettings } from './types';

type Row = Record<string, any>;
function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const maybe = result as { rows?: Row[] } | null;
  return Array.isArray(maybe?.rows) ? maybe.rows : [];
}
function one(result: unknown): Row | null {
  return rows(result)[0] || null;
}
function num(v: unknown, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

let ensured: Promise<void> | null = null;

export async function ensureRestappTables() {
  if (!ensured) {
    ensured = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_settings (
          team_id INTEGER PRIMARY KEY,
          is_active BOOLEAN NOT NULL DEFAULT false,
          setup_completed BOOLEAN NOT NULL DEFAULT false,
          beta_mode BOOLEAN NOT NULL DEFAULT true,
          restaurant_name VARCHAR(160) NOT NULL DEFAULT '',
          legal_name VARCHAR(200),
          tagline VARCHAR(240),
          logo_url TEXT,
          phone VARCHAR(40),
          email VARCHAR(160),
          country VARCHAR(8) NOT NULL DEFAULT 'DO',
          currency VARCHAR(8) NOT NULL DEFAULT 'DOP',
          language VARCHAR(8) NOT NULL DEFAULT 'es',
          timezone VARCHAR(64) NOT NULL DEFAULT 'America/Santo_Domingo',
          tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
          service_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
          tip_enabled BOOLEAN NOT NULL DEFAULT false,
          address TEXT,
          lat NUMERIC(11,7),
          lng NUMERIC(11,7),
          modes JSONB NOT NULL DEFAULT '["delivery","pickup","dine_in"]'::jsonb,
          payment_methods JSONB NOT NULL DEFAULT '["cod","transfer"]'::jsonb,
          min_order_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
          require_order_confirmation BOOLEAN NOT NULL DEFAULT true,
          auto_accept_orders BOOLEAN NOT NULL DEFAULT false,
          reservations_enabled BOOLEAN NOT NULL DEFAULT true,
          reservation_duration_min INTEGER NOT NULL DEFAULT 90,
          reservation_tolerance_min INTEGER NOT NULL DEFAULT 15,
          max_party_size INTEGER NOT NULL DEFAULT 12,
          waitlist_enabled BOOLEAN NOT NULL DEFAULT true,
          agent_enabled BOOLEAN NOT NULL DEFAULT false,
          agent_provider VARCHAR(20) NOT NULL DEFAULT 'inherit',
          agent_model VARCHAR(80),
          agent_persona VARCHAR(40) NOT NULL DEFAULT 'friendly',
          agent_tone TEXT,
          agent_formal BOOLEAN NOT NULL DEFAULT false,
          agent_instructions TEXT,
          agent_max_options INTEGER NOT NULL DEFAULT 4,
          agent_params JSONB NOT NULL DEFAULT '{}'::jsonb,
          handoff_enabled BOOLEAN NOT NULL DEFAULT true,
          handoff_hours TEXT,
          zernio_account_id VARCHAR(120),
          zernio_phone VARCHAR(40),
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      // evolve columns if table existed with old shape
      const alters = [
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT false`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS beta_mode BOOLEAN NOT NULL DEFAULT true`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS legal_name VARCHAR(200)`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS email VARCHAR(160)`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS country VARCHAR(8) DEFAULT 'DO'`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS language VARCHAR(8) DEFAULT 'es'`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) DEFAULT 'America/Santo_Domingo'`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(8,4) DEFAULT 0`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS service_fee NUMERIC(12,2) DEFAULT 0`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS tip_enabled BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS lat NUMERIC(11,7)`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS lng NUMERIC(11,7)`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS modes JSONB DEFAULT '["delivery","pickup","dine_in"]'::jsonb`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '["cod"]'::jsonb`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(12,2) DEFAULT 0`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS require_order_confirmation BOOLEAN DEFAULT true`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS auto_accept_orders BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS reservations_enabled BOOLEAN DEFAULT true`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS reservation_duration_min INTEGER DEFAULT 90`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS reservation_tolerance_min INTEGER DEFAULT 15`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS max_party_size INTEGER DEFAULT 12`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN DEFAULT true`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_provider VARCHAR(20) DEFAULT 'inherit'`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_model VARCHAR(80)`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_persona VARCHAR(40) DEFAULT 'friendly'`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_tone TEXT`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_formal BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_instructions TEXT`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_max_options INTEGER DEFAULT 4`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS agent_params JSONB DEFAULT '{}'::jsonb`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS handoff_enabled BOOLEAN DEFAULT true`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS handoff_hours TEXT`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS zernio_account_id VARCHAR(120)`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS zernio_phone VARCHAR(40)`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS logo_url TEXT`,
        `ALTER TABLE restapp_settings ADD COLUMN IF NOT EXISTS tagline VARCHAR(240)`,
      ];
      for (const q of alters) {
        await db.execute(sql.raw(q)).catch(() => null);
      }

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_branches (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          name VARCHAR(160) NOT NULL,
          code VARCHAR(40),
          phone VARCHAR(40),
          address TEXT,
          reference TEXT,
          lat NUMERIC(11,7),
          lng NUMERIC(11,7),
          coverage_km NUMERIC(8,2) DEFAULT 5,
          delivery_fee NUMERIC(12,2) DEFAULT 0,
          delivery_eta_min INTEGER DEFAULT 40,
          schedule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_tables (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          branch_id INTEGER,
          code VARCHAR(40) NOT NULL,
          name VARCHAR(80) NOT NULL,
          seats INTEGER NOT NULL DEFAULT 4,
          zone VARCHAR(80) DEFAULT 'Salón',
          floor_label VARCHAR(40),
          status VARCHAR(40) NOT NULL DEFAULT 'free',
          combinable BOOLEAN NOT NULL DEFAULT false,
          accessible BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(team_id, code)
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_categories (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          name VARCHAR(120) NOT NULL,
          description TEXT,
          image_url TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_menu_items (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          category_id INTEGER,
          category VARCHAR(80) NOT NULL DEFAULT 'General',
          name VARCHAR(160) NOT NULL,
          description TEXT,
          price NUMERIC(12,2) NOT NULL DEFAULT 0,
          currency VARCHAR(8) NOT NULL DEFAULT 'DOP',
          image_url TEXT,
          images_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          ingredients TEXT,
          allergens TEXT,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_spicy BOOLEAN NOT NULL DEFAULT false,
          is_vegetarian BOOLEAN NOT NULL DEFAULT false,
          is_vegan BOOLEAN NOT NULL DEFAULT false,
          is_recommended BOOLEAN NOT NULL DEFAULT false,
          is_bestseller BOOLEAN NOT NULL DEFAULT false,
          is_promo BOOLEAN NOT NULL DEFAULT false,
          prep_minutes INTEGER DEFAULT 15,
          stock INTEGER,
          is_available BOOLEAN NOT NULL DEFAULT true,
          sort_order INTEGER NOT NULL DEFAULT 0,
          variants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_modifiers (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          name VARCHAR(120) NOT NULL,
          group_name VARCHAR(120) DEFAULT 'Extras',
          price_extra NUMERIC(12,2) NOT NULL DEFAULT 0,
          required BOOLEAN NOT NULL DEFAULT false,
          multi_select BOOLEAN NOT NULL DEFAULT true,
          min_qty INTEGER NOT NULL DEFAULT 0,
          max_qty INTEGER NOT NULL DEFAULT 5,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_orders (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          branch_id INTEGER,
          chat_id INTEGER,
          order_number VARCHAR(80) NOT NULL UNIQUE,
          modality VARCHAR(40) NOT NULL DEFAULT 'dine_in',
          table_code VARCHAR(40),
          customer_name VARCHAR(160),
          customer_phone VARCHAR(60),
          customer_email VARCHAR(160),
          customer_address TEXT,
          customer_lat NUMERIC(11,7),
          customer_lng NUMERIC(11,7),
          status VARCHAR(40) NOT NULL DEFAULT 'confirmed',
          payment_method VARCHAR(40) DEFAULT 'cod',
          payment_status VARCHAR(40) DEFAULT 'pending',
          subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
          discount NUMERIC(12,2) NOT NULL DEFAULT 0,
          tax NUMERIC(12,2) NOT NULL DEFAULT 0,
          delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
          tip NUMERIC(12,2) NOT NULL DEFAULT 0,
          total NUMERIC(12,2) NOT NULL DEFAULT 0,
          currency VARCHAR(8) NOT NULL DEFAULT 'DOP',
          notes TEXT,
          eta_minutes INTEGER,
          items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          source JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_reservations (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          branch_id INTEGER,
          chat_id INTEGER,
          customer_name VARCHAR(160),
          customer_phone VARCHAR(60),
          party_size INTEGER NOT NULL DEFAULT 2,
          reserved_at TIMESTAMP NOT NULL,
          table_code VARCHAR(40),
          status VARCHAR(40) NOT NULL DEFAULT 'confirmed',
          notes TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_customers (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          name VARCHAR(160),
          phone VARCHAR(60),
          email VARCHAR(160),
          notes TEXT,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          total_orders INTEGER NOT NULL DEFAULT 0,
          total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_faqs (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          branch_id INTEGER,
          category VARCHAR(120) NOT NULL DEFAULT 'General',
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_team_members (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          user_id INTEGER,
          name VARCHAR(160),
          email VARCHAR(160),
          role VARCHAR(40) NOT NULL DEFAULT 'staff',
          permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_promotions (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          branch_id INTEGER,
          title VARCHAR(160) NOT NULL,
          description TEXT,
          discount_type VARCHAR(20) DEFAULT 'percent',
          discount_value NUMERIC(12,2) DEFAULT 0,
          starts_at TIMESTAMP,
          ends_at TIMESTAMP,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_activity (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          kind VARCHAR(40) NOT NULL,
          message TEXT NOT NULL,
          meta JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_api_keys (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          name VARCHAR(120) NOT NULL,
          key_prefix VARCHAR(16) NOT NULL,
          key_hash TEXT NOT NULL,
          scopes JSONB NOT NULL DEFAULT '["read","write"]'::jsonb,
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_used_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `).catch(() => null);

      // Evolve legacy MVP tables (CREATE IF NOT EXISTS does not add new columns)
      const evolve = [
        `ALTER TABLE restapp_tables ADD COLUMN IF NOT EXISTS branch_id INTEGER`,
        `ALTER TABLE restapp_tables ADD COLUMN IF NOT EXISTS floor_label VARCHAR(40)`,
        `ALTER TABLE restapp_tables ADD COLUMN IF NOT EXISTS combinable BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_tables ADD COLUMN IF NOT EXISTS accessible BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS category_id INTEGER`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS images_json JSONB DEFAULT '[]'::jsonb`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS ingredients TEXT`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS allergens TEXT`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS is_spicy BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS is_vegetarian BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS is_vegan BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS is_bestseller BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS is_promo BOOLEAN DEFAULT false`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS prep_minutes INTEGER DEFAULT 15`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS stock INTEGER`,
        `ALTER TABLE restapp_menu_items ADD COLUMN IF NOT EXISTS variants_json JSONB DEFAULT '[]'::jsonb`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS branch_id INTEGER`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS customer_email VARCHAR(160)`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS customer_lat NUMERIC(11,7)`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS customer_lng NUMERIC(11,7)`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) DEFAULT 'pending'`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) DEFAULT 0`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS tax NUMERIC(12,2) DEFAULT 0`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) DEFAULT 0`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS tip NUMERIC(12,2) DEFAULT 0`,
        `ALTER TABLE restapp_orders ADD COLUMN IF NOT EXISTS eta_minutes INTEGER`,
        `ALTER TABLE restapp_reservations ADD COLUMN IF NOT EXISTS branch_id INTEGER`,
      ];
      for (const q of evolve) {
        await db.execute(sql.raw(q)).catch(() => null);
      }
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  await ensured;
}

export async function getRestappSettings(teamId: number): Promise<Row | null> {
  await ensureRestappTables();
  return one(await db.execute(sql`SELECT * FROM restapp_settings WHERE team_id = ${teamId} LIMIT 1`));
}

export async function upsertRestappSettings(teamId: number, patch: Record<string, unknown>) {
  await ensureRestappTables();
  const cur = (await getRestappSettings(teamId)) || {};
  const next = {
    is_active: patch.is_active ?? cur.is_active ?? false,
    setup_completed: patch.setup_completed ?? cur.setup_completed ?? false,
    beta_mode: patch.beta_mode ?? cur.beta_mode ?? true,
    restaurant_name: String(patch.restaurant_name ?? cur.restaurant_name ?? '').slice(0, 160),
    legal_name: patch.legal_name != null ? String(patch.legal_name).slice(0, 200) : cur.legal_name ?? null,
    tagline: patch.tagline != null ? String(patch.tagline).slice(0, 240) : cur.tagline ?? null,
    logo_url: patch.logo_url != null ? String(patch.logo_url) : cur.logo_url ?? null,
    phone: patch.phone != null ? String(patch.phone).slice(0, 40) : cur.phone ?? null,
    email: patch.email != null ? String(patch.email).slice(0, 160) : cur.email ?? null,
    country: String(patch.country ?? cur.country ?? 'DO').slice(0, 8),
    currency: String(patch.currency ?? cur.currency ?? 'DOP').slice(0, 8),
    language: String(patch.language ?? cur.language ?? 'es').slice(0, 8),
    timezone: String(patch.timezone ?? cur.timezone ?? 'America/Santo_Domingo').slice(0, 64),
    tax_rate: num(patch.tax_rate ?? cur.tax_rate, 0),
    service_fee: num(patch.service_fee ?? cur.service_fee, 0),
    tip_enabled: Boolean(patch.tip_enabled ?? cur.tip_enabled ?? false),
    address: patch.address != null ? String(patch.address) : cur.address ?? null,
    lat: patch.lat != null ? num(patch.lat) : cur.lat != null ? num(cur.lat) : null,
    lng: patch.lng != null ? num(patch.lng) : cur.lng != null ? num(cur.lng) : null,
    modes: patch.modes ?? cur.modes ?? ['delivery', 'pickup', 'dine_in'],
    payment_methods: patch.payment_methods ?? cur.payment_methods ?? ['cod'],
    min_order_amount: num(patch.min_order_amount ?? cur.min_order_amount, 0),
    require_order_confirmation: Boolean(patch.require_order_confirmation ?? cur.require_order_confirmation ?? true),
    auto_accept_orders: Boolean(patch.auto_accept_orders ?? cur.auto_accept_orders ?? false),
    reservations_enabled: Boolean(patch.reservations_enabled ?? cur.reservations_enabled ?? true),
    reservation_duration_min: Math.max(30, num(patch.reservation_duration_min ?? cur.reservation_duration_min, 90)),
    reservation_tolerance_min: Math.max(0, num(patch.reservation_tolerance_min ?? cur.reservation_tolerance_min, 15)),
    max_party_size: Math.max(1, num(patch.max_party_size ?? cur.max_party_size, 12)),
    waitlist_enabled: Boolean(patch.waitlist_enabled ?? cur.waitlist_enabled ?? true),
    agent_enabled: Boolean(patch.agent_enabled ?? cur.agent_enabled ?? false),
    // Always inherit team /settings/ai — module never stores a parallel provider choice.
    agent_provider: 'inherit',
    agent_model: null,
    agent_persona: String(patch.agent_persona ?? cur.agent_persona ?? 'friendly').slice(0, 40),
    agent_tone: patch.agent_tone != null ? String(patch.agent_tone) : cur.agent_tone ?? null,
    agent_formal: Boolean(patch.agent_formal ?? cur.agent_formal ?? false),
    agent_instructions: patch.agent_instructions != null ? String(patch.agent_instructions) : cur.agent_instructions ?? null,
    agent_max_options: Math.min(8, Math.max(1, num(patch.agent_max_options ?? cur.agent_max_options, 4))),
    agent_params: patch.agent_params ?? cur.agent_params ?? {},
    handoff_enabled: Boolean(patch.handoff_enabled ?? cur.handoff_enabled ?? true),
    handoff_hours: patch.handoff_hours != null ? String(patch.handoff_hours) : cur.handoff_hours ?? null,
    zernio_account_id: patch.zernio_account_id != null ? String(patch.zernio_account_id) : cur.zernio_account_id ?? null,
    zernio_phone: patch.zernio_phone != null ? String(patch.zernio_phone) : cur.zernio_phone ?? null,
  };

  await db.execute(sql`
    INSERT INTO restapp_settings (
      team_id, is_active, setup_completed, beta_mode, restaurant_name, legal_name, tagline, logo_url,
      phone, email, country, currency, language, timezone, tax_rate, service_fee, tip_enabled,
      address, lat, lng, modes, payment_methods, min_order_amount, require_order_confirmation,
      auto_accept_orders, reservations_enabled, reservation_duration_min, reservation_tolerance_min,
      max_party_size, waitlist_enabled, agent_enabled, agent_provider, agent_model, agent_persona,
      agent_tone, agent_formal, agent_instructions, agent_max_options, agent_params, handoff_enabled,
      handoff_hours, zernio_account_id, zernio_phone, updated_at
    ) VALUES (
      ${teamId}, ${next.is_active}, ${next.setup_completed}, ${next.beta_mode}, ${next.restaurant_name},
      ${next.legal_name}, ${next.tagline}, ${next.logo_url}, ${next.phone}, ${next.email}, ${next.country},
      ${next.currency}, ${next.language}, ${next.timezone}, ${next.tax_rate}, ${next.service_fee},
      ${next.tip_enabled}, ${next.address}, ${next.lat}, ${next.lng},
      ${JSON.stringify(next.modes)}::jsonb, ${JSON.stringify(next.payment_methods)}::jsonb,
      ${next.min_order_amount}, ${next.require_order_confirmation}, ${next.auto_accept_orders},
      ${next.reservations_enabled}, ${next.reservation_duration_min}, ${next.reservation_tolerance_min},
      ${next.max_party_size}, ${next.waitlist_enabled}, ${next.agent_enabled}, ${next.agent_provider},
      ${next.agent_model}, ${next.agent_persona}, ${next.agent_tone}, ${next.agent_formal},
      ${next.agent_instructions}, ${next.agent_max_options}, ${JSON.stringify(next.agent_params)}::jsonb,
      ${next.handoff_enabled}, ${next.handoff_hours}, ${next.zernio_account_id}, ${next.zernio_phone}, NOW()
    )
    ON CONFLICT (team_id) DO UPDATE SET
      is_active = EXCLUDED.is_active,
      setup_completed = EXCLUDED.setup_completed,
      beta_mode = EXCLUDED.beta_mode,
      restaurant_name = EXCLUDED.restaurant_name,
      legal_name = EXCLUDED.legal_name,
      tagline = EXCLUDED.tagline,
      logo_url = EXCLUDED.logo_url,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      country = EXCLUDED.country,
      currency = EXCLUDED.currency,
      language = EXCLUDED.language,
      timezone = EXCLUDED.timezone,
      tax_rate = EXCLUDED.tax_rate,
      service_fee = EXCLUDED.service_fee,
      tip_enabled = EXCLUDED.tip_enabled,
      address = EXCLUDED.address,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      modes = EXCLUDED.modes,
      payment_methods = EXCLUDED.payment_methods,
      min_order_amount = EXCLUDED.min_order_amount,
      require_order_confirmation = EXCLUDED.require_order_confirmation,
      auto_accept_orders = EXCLUDED.auto_accept_orders,
      reservations_enabled = EXCLUDED.reservations_enabled,
      reservation_duration_min = EXCLUDED.reservation_duration_min,
      reservation_tolerance_min = EXCLUDED.reservation_tolerance_min,
      max_party_size = EXCLUDED.max_party_size,
      waitlist_enabled = EXCLUDED.waitlist_enabled,
      agent_enabled = EXCLUDED.agent_enabled,
      agent_provider = EXCLUDED.agent_provider,
      agent_model = EXCLUDED.agent_model,
      agent_persona = EXCLUDED.agent_persona,
      agent_tone = EXCLUDED.agent_tone,
      agent_formal = EXCLUDED.agent_formal,
      agent_instructions = EXCLUDED.agent_instructions,
      agent_max_options = EXCLUDED.agent_max_options,
      agent_params = EXCLUDED.agent_params,
      handoff_enabled = EXCLUDED.handoff_enabled,
      handoff_hours = EXCLUDED.handoff_hours,
      zernio_account_id = EXCLUDED.zernio_account_id,
      zernio_phone = EXCLUDED.zernio_phone,
      updated_at = NOW()
  `);
  return getRestappSettings(teamId);
}

export async function isRestappActive(teamId: number) {
  const s = await getRestappSettings(teamId);
  return Boolean(s?.is_active);
}

export async function listRestappBranches(teamId: number) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_branches WHERE team_id = ${teamId} ORDER BY id ASC
  `));
}

export async function listRestappTables(teamId: number, branchId?: number | null) {
  await ensureRestappTables();
  if (branchId) {
    return rows(await db.execute(sql`
      SELECT * FROM restapp_tables WHERE team_id = ${teamId} AND (branch_id = ${branchId} OR branch_id IS NULL) AND is_active = true
      ORDER BY zone ASC, code ASC
    `));
  }
  return rows(await db.execute(sql`
    SELECT * FROM restapp_tables WHERE team_id = ${teamId} AND is_active = true ORDER BY zone ASC, code ASC
  `));
}

export async function listRestappCategories(teamId: number) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_categories WHERE team_id = ${teamId} ORDER BY sort_order ASC, id ASC
  `));
}

export async function listRestappMenu(teamId: number) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_menu_items WHERE team_id = ${teamId} ORDER BY sort_order ASC, id ASC
  `));
}

export async function listRestappModifiers(teamId: number) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_modifiers WHERE team_id = ${teamId} ORDER BY group_name ASC, id ASC
  `));
}

export async function listRestappOrders(teamId: number, limit = 50, status?: string | null) {
  await ensureRestappTables();
  if (status) {
    return rows(await db.execute(sql`
      SELECT * FROM restapp_orders WHERE team_id = ${teamId} AND status = ${status}
      ORDER BY id DESC LIMIT ${limit}
    `));
  }
  return rows(await db.execute(sql`
    SELECT * FROM restapp_orders WHERE team_id = ${teamId} ORDER BY id DESC LIMIT ${limit}
  `));
}

export async function listRestappReservations(teamId: number, limit = 50) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_reservations WHERE team_id = ${teamId}
    ORDER BY reserved_at ASC LIMIT ${limit}
  `));
}

export async function listRestappCustomers(teamId: number, limit = 100) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_customers WHERE team_id = ${teamId} ORDER BY updated_at DESC LIMIT ${limit}
  `));
}

export async function listRestappFaqs(teamId: number) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_faqs WHERE team_id = ${teamId} ORDER BY sort_order ASC, id ASC
  `));
}

export async function listRestappTeam(teamId: number) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_team_members WHERE team_id = ${teamId} ORDER BY id ASC
  `));
}

export async function listRestappPromotions(teamId: number) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_promotions WHERE team_id = ${teamId} ORDER BY id DESC
  `));
}

export async function listRestappActivity(teamId: number, limit = 30) {
  await ensureRestappTables();
  return rows(await db.execute(sql`
    SELECT * FROM restapp_activity WHERE team_id = ${teamId} ORDER BY id DESC LIMIT ${limit}
  `));
}

export async function logRestappActivity(teamId: number, kind: string, message: string, meta: Record<string, unknown> = {}) {
  await ensureRestappTables();
  await db.execute(sql`
    INSERT INTO restapp_activity (team_id, kind, message, meta) VALUES (
      ${teamId}, ${kind}, ${message}, ${JSON.stringify(meta)}::jsonb
    )
  `).catch(() => null);
}

export async function getRestappDashboard(teamId: number, branchId?: number | null) {
  await ensureRestappTables();
  const settings = await getRestappSettings(teamId);
  const stats = one(await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS orders_today,
      COUNT(*) FILTER (WHERE status IN ('pending_confirmation','confirmed','accepted')) AS orders_pending,
      COUNT(*) FILTER (WHERE status = 'preparing') AS orders_preparing,
      COUNT(*) FILTER (WHERE status = 'completed' AND created_at::date = CURRENT_DATE) AS orders_completed,
      COALESCE(SUM(total) FILTER (WHERE created_at::date = CURRENT_DATE AND status NOT IN ('cancelled','rejected')), 0) AS sales_today,
      COALESCE(AVG(total) FILTER (WHERE created_at::date = CURRENT_DATE AND status NOT IN ('cancelled','rejected')), 0) AS ticket_avg
    FROM restapp_orders WHERE team_id = ${teamId}
  `)) || {};

  const resStats = one(await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE reserved_at::date = CURRENT_DATE) AS reservations_today,
      COUNT(*) FILTER (WHERE status IN ('pending','confirmed') AND reserved_at >= NOW()) AS reservations_pending
    FROM restapp_reservations WHERE team_id = ${teamId}
  `)) || {};

  const tableStats = one(await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'free' AND is_active) AS tables_free,
      COUNT(*) FILTER (WHERE status = 'occupied' AND is_active) AS tables_occupied,
      COUNT(*) FILTER (WHERE is_active) AS tables_total
    FROM restapp_tables WHERE team_id = ${teamId}
  `)) || {};

  const oos = rows(await db.execute(sql`
    SELECT id, name, stock FROM restapp_menu_items
    WHERE team_id = ${teamId} AND (is_available = false OR (stock IS NOT NULL AND stock <= 0))
    ORDER BY name ASC LIMIT 10
  `));

  return {
    settings,
    stats: { ...stats, ...resStats, ...tableStats },
    tables: await listRestappTables(teamId, branchId),
    menu: await listRestappMenu(teamId),
    orders: await listRestappOrders(teamId, 25),
    reservations: await listRestappReservations(teamId, 15),
    branches: await listRestappBranches(teamId),
    activity: await listRestappActivity(teamId, 20),
    outOfStock: oos,
  };
}

export async function createRestappOrder(input: {
  teamId: number;
  chatId?: number | null;
  branchId?: number | null;
  modality: string;
  tableCode?: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
  paymentMethod?: string;
  items: Array<{ name: string; qty: number; unit_price: number; product_id?: number | null; customizations?: string[] }>;
  notes?: string | null;
  deliveryFee?: number;
  discount?: number;
}) {
  await ensureRestappTables();
  const settings = await getRestappSettings(input.teamId);
  const items = (input.items || []).filter((i) => i.name && i.qty > 0);
  if (!items.length) throw new Error('items_required');
  if (!input.customerName?.trim() || !input.customerPhone?.trim()) throw new Error('customer_required');

  const subtotal = items.reduce((s, i) => s + Number(i.unit_price) * Number(i.qty), 0);
  const taxRate = num(settings?.tax_rate, 0);
  const deliveryFee = num(input.deliveryFee, 0);
  const discount = num(input.discount, 0);
  const serviceFee = num(settings?.service_fee, 0);
  const tax = Number(((subtotal - discount) * taxRate).toFixed(2));
  const total = Number((subtotal - discount + tax + deliveryFee + serviceFee).toFixed(2));
  const orderNumber = `RP-${input.teamId}-${Date.now().toString().slice(-9)}`;
  const modality = ['delivery', 'pickup', 'dine_in', 'scheduled'].includes(input.modality)
    ? input.modality
    : 'dine_in';
  const status = settings?.auto_accept_orders ? 'accepted' : 'confirmed';

  const result = await db.execute(sql`
    INSERT INTO restapp_orders (
      team_id, branch_id, chat_id, order_number, modality, table_code,
      customer_name, customer_phone, customer_address, customer_lat, customer_lng,
      status, payment_method, payment_status, subtotal, discount, tax, delivery_fee, tip, total,
      currency, notes, items_json, source, created_at, updated_at
    ) VALUES (
      ${input.teamId}, ${input.branchId || null}, ${input.chatId || null}, ${orderNumber}, ${modality},
      ${input.tableCode || null}, ${input.customerName}, ${input.customerPhone},
      ${input.customerAddress || null}, ${input.customerLat ?? null}, ${input.customerLng ?? null},
      ${status}, ${input.paymentMethod || 'cod'}, 'pending',
      ${subtotal.toFixed(2)}, ${discount.toFixed(2)}, ${tax.toFixed(2)}, ${deliveryFee.toFixed(2)}, 0,
      ${total.toFixed(2)}, ${settings?.currency || 'DOP'}, ${input.notes || null},
      ${JSON.stringify(items)}::jsonb,
      ${JSON.stringify({ provider: 'restapp-ai', beta: true })}::jsonb,
      NOW(), NOW()
    ) RETURNING *
  `);
  const order = one(result);
  if (modality === 'dine_in' && input.tableCode) {
    await db.execute(sql`
      UPDATE restapp_tables SET status = 'occupied'
      WHERE team_id = ${input.teamId} AND code = ${input.tableCode}
    `).catch(() => null);
  }
  await upsertCustomerFromOrder(input.teamId, input.customerName, input.customerPhone, total);
  await logRestappActivity(input.teamId, 'order', `Pedido ${orderNumber} creado (${status})`, {
    order_id: order?.id,
    total,
  });
  // Notify external CRM so they manage kitchen/delivery on their platform
  try {
    const { notifyCrmWebhook } = await import('./import-api');
    await notifyCrmWebhook(input.teamId, 'order.created', { order, order_number: orderNumber });
  } catch {
    /* non-blocking */
  }
  return order;
}

async function upsertCustomerFromOrder(teamId: number, name: string, phone: string, total: number) {
  await db.execute(sql`
    INSERT INTO restapp_customers (team_id, name, phone, total_orders, total_spent, updated_at)
    VALUES (${teamId}, ${name}, ${phone}, 1, ${total}, NOW())
  `).catch(async () => {
    await db.execute(sql`
      UPDATE restapp_customers
      SET name = COALESCE(${name}, name),
          total_orders = total_orders + 1,
          total_spent = total_spent + ${total},
          updated_at = NOW()
      WHERE team_id = ${teamId} AND phone = ${phone}
    `).catch(() => null);
  });
}

export async function updateRestappOrderStatus(teamId: number, orderId: number, status: string) {
  await ensureRestappTables();
  const result = await db.execute(sql`
    UPDATE restapp_orders SET status = ${status}, updated_at = NOW()
    WHERE id = ${orderId} AND team_id = ${teamId}
    RETURNING *
  `);
  const order = one(result);
  if (order && (status === 'completed' || status === 'cancelled') && order.table_code) {
    await db.execute(sql`
      UPDATE restapp_tables SET status = 'free'
      WHERE team_id = ${teamId} AND code = ${order.table_code}
    `).catch(() => null);
  }
  if (order) {
    await logRestappActivity(teamId, 'order_status', `Pedido ${order.order_number} → ${status}`, {
      order_id: orderId,
    });
  }
  return order;
}

export async function createRestappReservation(input: {
  teamId: number;
  branchId?: number | null;
  chatId?: number | null;
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedAt: Date | string;
  tableCode?: string | null;
  notes?: string | null;
}) {
  await ensureRestappTables();
  const result = await db.execute(sql`
    INSERT INTO restapp_reservations (
      team_id, branch_id, chat_id, customer_name, customer_phone, party_size, reserved_at, table_code, status, notes
    ) VALUES (
      ${input.teamId}, ${input.branchId || null}, ${input.chatId || null},
      ${input.customerName}, ${input.customerPhone}, ${Math.max(1, input.partySize)},
      ${input.reservedAt instanceof Date ? input.reservedAt.toISOString() : input.reservedAt},
      ${input.tableCode || null}, 'confirmed', ${input.notes || null}
    ) RETURNING *
  `);
  const row = one(result);
  if (row?.table_code) {
    await db.execute(sql`
      UPDATE restapp_tables SET status = 'reserved'
      WHERE team_id = ${input.teamId} AND code = ${row.table_code} AND status = 'free'
    `).catch(() => null);
  }
  await logRestappActivity(input.teamId, 'reservation', `Reserva creada para ${input.customerName}`, {
    reservation_id: row?.id,
  });
  try {
    const { notifyCrmWebhook } = await import('./import-api');
    await notifyCrmWebhook(input.teamId, 'reservation.created', { reservation: row });
  } catch {
    /* non-blocking */
  }
  return row;
}

export async function getRestappCatalogForIntelligence(teamId: number) {
  const menu = await listRestappMenu(teamId);
  const available = menu.filter((m) => m.is_available !== false);
  const withPrice = available.filter((m) => Number(m.price || 0) > 0);
  // Prefer real priced items so the bot never leads with RD$0 bulk-import leftovers
  const ordered = (withPrice.length ? withPrice : available).slice().sort((a, b) => {
    const pa = Number(a.price || 0);
    const pb = Number(b.price || 0);
    if (pb !== pa) return pb - pa;
    return String(a.name || '').localeCompare(String(b.name || ''), 'es');
  });
  return ordered.slice(0, 40).map((m) => ({
    id: m.id,
    name: m.name,
    price: Number(m.price || 0),
    category: m.category,
    description: m.description,
    image_url: m.image_url,
    is_spicy: m.is_spicy,
    is_vegetarian: m.is_vegetarian,
    is_vegan: m.is_vegan,
    stock: m.stock ?? 999,
    currency: m.currency || 'DOP',
  }));
}

/** Clear demo seed data for a team (orders/menu/tables created as demo). Safe: only team scoped. */
export async function clearRestappDemoData(teamId: number) {
  await ensureRestappTables();
  // Remove obvious demo markers only if restaurant still named demo
  const s = await getRestappSettings(teamId);
  if (s && String(s.restaurant_name || '').toLowerCase().includes('demo')) {
    await db.execute(sql`UPDATE restapp_settings SET restaurant_name = '', is_active = false, setup_completed = false, agent_enabled = false WHERE team_id = ${teamId}`);
  }
  await db.execute(sql`DELETE FROM restapp_orders WHERE team_id = ${teamId} AND (source->>'provider' = 'restapp-ai' AND (notes ILIKE '%demo%' OR order_number LIKE '%DEMO%'))`).catch(() => null);
  await logRestappActivity(teamId, 'system', 'Datos de demostración limpiados / modo producción beta');
}

export type { RestappSettings, RestappAgentParams, RestappModality };
