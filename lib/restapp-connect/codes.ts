import 'server-only';

import crypto from 'crypto';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { apiKeys } from '@/lib/db/schema';

type Row = Record<string, any>;

function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  const maybe = result as { rows?: Row[] } | null;
  return Array.isArray(maybe?.rows) ? maybe.rows : [];
}

function one(result: unknown): Row | null {
  return rows(result)[0] || null;
}

let ready: Promise<void> | null = null;

export async function ensureRestappConnectTable() {
  if (!ready) {
    ready = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS restapp_connect_codes (
          id SERIAL PRIMARY KEY,
          code VARCHAR(80) NOT NULL UNIQUE,
          team_id INTEGER NOT NULL,
          api_key VARCHAR(255) NOT NULL,
          team_name VARCHAR(200),
          plan_name VARCHAR(200),
          return_url TEXT,
          state VARCHAR(120),
          expires_at TIMESTAMP NOT NULL,
          used_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  await ready;
}

export async function getOrCreateRestappApiKey(teamId: number): Promise<string> {
  const existing = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.teamId, teamId), eq(apiKeys.name, 'RestAPP restapp.allsender')),
  });
  if (existing?.key) return String(existing.key);

  // Fallback: reuse any existing team key
  const anyKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.teamId, teamId),
  });
  if (anyKey?.key) return String(anyKey.key);

  const key = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
  await db.insert(apiKeys).values({
    teamId,
    name: 'RestAPP restapp.allsender',
    key,
  });
  return key;
}

export async function issueConnectCode(input: {
  teamId: number;
  teamName?: string | null;
  planName?: string | null;
  returnUrl: string;
  state?: string | null;
}): Promise<string> {
  await ensureRestappConnectTable();
  const apiKey = await getOrCreateRestappApiKey(input.teamId);
  const code = `rc_${crypto.randomBytes(24).toString('hex')}`;

  await db.execute(sql`
    INSERT INTO restapp_connect_codes (
      code, team_id, api_key, team_name, plan_name, return_url, state, expires_at, created_at
    ) VALUES (
      ${code},
      ${input.teamId},
      ${apiKey},
      ${input.teamName || null},
      ${input.planName || null},
      ${input.returnUrl},
      ${input.state || null},
      NOW() + INTERVAL '15 minutes',
      NOW()
    )
  `);

  return code;
}

export async function exchangeConnectCode(code: string): Promise<{
  ok: boolean;
  error?: string;
  api_key?: string;
  team_id?: number;
  team_name?: string | null;
  plan_name?: string | null;
}> {
  await ensureRestappConnectTable();
  const row = one(
    await db.execute(sql`
      SELECT * FROM restapp_connect_codes
      WHERE code = ${code}
      LIMIT 1
    `)
  );
  if (!row) return { ok: false, error: 'invalid_code' };
  if (row.used_at) return { ok: false, error: 'already_used' };
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: false, error: 'expired' };
  }

  await db.execute(sql`
    UPDATE restapp_connect_codes SET used_at = NOW() WHERE id = ${Number(row.id)}
  `);

  return {
    ok: true,
    api_key: String(row.api_key),
    team_id: Number(row.team_id),
    team_name: row.team_name ? String(row.team_name) : null,
    plan_name: row.plan_name ? String(row.plan_name) : null,
  };
}

export async function loadTeamPlanLabel(teamId: number): Promise<string | null> {
  try {
    const row = one(
      await db.execute(sql`
        SELECT COALESCE(p.name, p.slug, 'Plan') AS plan_name
        FROM teams t
        LEFT JOIN plans p ON p.id = t.plan_id
        WHERE t.id = ${teamId}
        LIMIT 1
      `)
    );
    return row?.plan_name ? String(row.plan_name) : null;
  } catch {
    return null;
  }
}
