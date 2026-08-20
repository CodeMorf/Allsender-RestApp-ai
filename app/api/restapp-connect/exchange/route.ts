import { NextRequest, NextResponse } from 'next/server';

import { exchangeConnectCode } from '@/lib/restapp-connect/codes';

export const dynamic = 'force-dynamic';

/**
 * RestApp server exchanges one-time code for API key + plan label.
 * Optional header X-RestApp-Connect-Secret if RESTAPP_CONNECT_SECRET is set.
 */
export async function POST(request: NextRequest) {
  try {
    const expected = String(process.env.RESTAPP_CONNECT_SECRET || '').trim();
    if (expected) {
      const got = request.headers.get('x-restapp-connect-secret') || '';
      if (got !== expected) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const code = String(body.code || body.allsender_code || '').trim();
    if (!code) {
      return NextResponse.json({ ok: false, error: 'code_required' }, { status: 400 });
    }

    const result = await exchangeConnectCode(code);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      api_key: result.api_key,
      team_id: result.team_id,
      team_name: result.team_name,
      plan_name: result.plan_name,
      memberships: {
        allsender: true,
        restapp: 'managed_on_restapp_saas',
        note: 'El cliente mantiene membresía en AllSender (IA/WhatsApp) y en RestApp (POS).',
      },
    });
  } catch (e: any) {
    console.error('[restapp-connect/exchange]', e);
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
