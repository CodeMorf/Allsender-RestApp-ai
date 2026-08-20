import 'server-only';

import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import { db, client } from '@/lib/db/drizzle';
import {
  users,
  teams,
  teamMembers,
  activityLogs,
  type NewUser,
  type NewTeam,
  type NewTeamMember,
  type NewActivityLog,
  ActivityType,
} from '@/lib/db/schema';
import { hashPassword, setSession } from '@/lib/auth/session';

export type RestappHandoffPayload = {
  email: string;
  name: string;
  restaurant_id: number;
  restaurant_name?: string;
  phone?: string;
  exp: number;
  nonce: string;
};

function b64urlEncode(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8');
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

export function verifyRestappHandoffToken(token: string): RestappHandoffPayload | null {
  try {
    const secret = String(process.env.RESTAPP_CONNECT_SECRET || '').trim();
    if (!secret || !token || !token.includes('.')) return null;

    const [body, sig] = token.split('.', 2);
    if (!body || !sig) return null;

    const expected = crypto.createHmac('sha256', secret).update(body).digest();
    const given = b64urlDecode(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      return null;
    }

    const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as RestappHandoffPayload;
    if (!payload?.email || !payload?.exp || !payload?.nonce) return null;
    if (Number(payload.exp) * 1000 < Date.now()) return null;

    const email = String(payload.email).trim().toLowerCase();
    if (!email.includes('@')) return null;

    return {
      email,
      name: String(payload.name || email.split('@')[0] || 'Restaurante').slice(0, 100),
      restaurant_id: Number(payload.restaurant_id || 0),
      restaurant_name: payload.restaurant_name ? String(payload.restaurant_name).slice(0, 120) : undefined,
      phone: payload.phone ? String(payload.phone).slice(0, 40) : undefined,
      exp: Number(payload.exp),
      nonce: String(payload.nonce),
    };
  } catch {
    return null;
  }
}

async function logActivity(teamId: number, userId: number, type: ActivityType) {
  const row: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: '',
  };
  await db.insert(activityLogs).values(row).catch(() => null);
}

/**
 * Ensure AllSender user+team from RestApp handoff, then set session cookie.
 * - Existing email → login
 * - New email → auto-register free team named after restaurant
 */
export async function ensureUserFromRestappHandoff(payload: RestappHandoffPayload): Promise<{
  ok: boolean;
  created: boolean;
  email: string;
  teamName?: string;
  error?: string;
}> {
  const email = payload.email;
  const displayName =
    (payload.name || payload.restaurant_name || email.split('@')[0] || 'Restaurante').trim().slice(0, 100);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    await setSession(existing[0] as NewUser);
    const member = await db
      .select({ team: teams })
      .from(teamMembers)
      .leftJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, existing[0].id))
      .limit(1);
    return {
      ok: true,
      created: false,
      email,
      teamName: member[0]?.team?.name || undefined,
    };
  }

  // Auto-create AllSender account for RestApp novices (no password form)
  const randomPass = crypto.randomBytes(24).toString('hex');
  const passwordHash = await hashPassword(randomPass);

  const [createdUser] = await db
    .insert(users)
    .values({
      name: displayName,
      email,
      passwordHash,
      role: 'owner',
    } as NewUser)
    .returning();

  if (!createdUser?.id) {
    return { ok: false, created: false, email, error: 'create_user_failed' };
  }

  const teamLabel = (payload.restaurant_name || displayName).slice(0, 80);
  const [createdTeam] = await db
    .insert(teams)
    .values({ name: `${teamLabel} · RestApp`.slice(0, 100) } as NewTeam)
    .returning();

  if (!createdTeam?.id) {
    return { ok: false, created: true, email, error: 'create_team_failed' };
  }


  const member: NewTeamMember = {
    userId: createdUser.id,
    teamId: createdTeam.id,
    role: 'owner',
  };
  await db.insert(teamMembers).values(member);

  await logActivity(createdTeam.id, createdUser.id, ActivityType.SIGN_UP);
  await logActivity(createdTeam.id, createdUser.id, ActivityType.CREATE_TEAM);

  // Audit: auto-created from RestApp connect
  await client`
    INSERT INTO billing_audit_logs (provider, action, team_id, user_id, metadata, created_at)
    VALUES (
      'restapp_connect',
      'auto_register_from_restapp',
      ${createdTeam.id},
      ${createdUser.id},
      ${JSON.stringify({
        restaurant_id: payload.restaurant_id,
        restaurant_name: payload.restaurant_name || null,
        source: 'restapp_handoff',
      })}::jsonb,
      NOW()
    )
  `.catch(() => null);

  await setSession(createdUser as NewUser);

  return {
    ok: true,
    created: true,
    email,
    teamName: createdTeam.name,
  };
}
