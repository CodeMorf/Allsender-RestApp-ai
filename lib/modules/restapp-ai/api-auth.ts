import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { apiKeys } from '@/lib/db/schema';
import { assertTeamDeveloperAccess } from '@/lib/developers/plan-access';
import { getRestappAccess } from './access';

export type RestappApiAuth = {
  teamId: number;
  apiKeyId: number;
};

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

export function isNextResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Reuses the same Bearer API keys as /settings/developers.
 * Does not change existing developers/orders contracts.
 */
export async function authenticateRestappRequest(request: NextRequest): Promise<RestappApiAuth | NextResponse> {
  const authHeader = request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    return jsonError('Missing Authorization Bearer API key.', 401);
  }

  const token = match[1].trim();
  const key = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.key, token),
  });
  if (!key) {
    return jsonError('Invalid API key.', 401);
  }

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

  // Same developer plan gate as orders API (reuses infrastructure)
  const gate = await assertTeamDeveloperAccess(key.teamId, 'api').catch(() => ({ ok: true as const }));
  if (gate && typeof gate === 'object' && 'ok' in gate && !gate.ok && 'response' in gate) {
    return (gate as any).response as NextResponse;
  }

  const access = await getRestappAccess(key.teamId);
  if (!access.canConfigure && !access.runtimeActive) {
    return jsonError('RestaPP AI not available for this team.', 403);
  }

  return { teamId: key.teamId, apiKeyId: key.id };
}
