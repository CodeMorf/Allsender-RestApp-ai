'use server';

import { redirect } from 'next/navigation';

import { getTeamForUser } from '@/lib/db/queries';
import { issueConnectCode, loadTeamPlanLabel } from '@/lib/restapp-connect/codes';

function safeReturnUrl(raw: string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (
      host === 'restapp.allsender.tech' ||
      host === 'www.restapp.allsender.tech' ||
      host === 'localhost' ||
      host.endsWith('.allsender.tech')
    ) {
      return u.toString();
    }
  } catch {
    /* fallthrough */
  }
  return 'https://restapp.allsender.tech/restapp-ai/connect/callback';
}

export async function connectRestappAction(formData: FormData) {
  try {
    const accepted = String(formData.get('accept_terms') || '') === '1';
    if (!accepted) {
      redirect('/es/connect/restapp?error=terms');
    }

    const team = await getTeamForUser();
    if (!team) {
      const returnUrl = safeReturnUrl(String(formData.get('return_url') || ''));
      const state = String(formData.get('state') || '');
      const qs = new URLSearchParams({ return_url: returnUrl });
      if (state) qs.set('state', state);
      redirect(`/es/sign-in?redirect=${encodeURIComponent(`/es/connect/restapp?${qs.toString()}`)}`);
    }

    const returnUrl = safeReturnUrl(String(formData.get('return_url') || ''));
    const state = String(formData.get('state') || '');
    const planName = await loadTeamPlanLabel(Number((team as any).id)).catch(() => null);

    const code = await issueConnectCode({
      teamId: Number((team as any).id),
      teamName: String((team as any).name || ''),
      planName,
      returnUrl,
      state,
    });

    // Always send user back to RestApp callback with one-time code
    const url = new URL(returnUrl);
    // If they pointed to settings, force callback path for exchange
    if (url.pathname.includes('/settings') && !url.pathname.includes('/connect/callback')) {
      url.pathname = '/restapp-ai/connect/callback';
      url.search = '';
    }
    url.searchParams.set('allsender_code', code);
    if (state) url.searchParams.set('state', state);

    redirect(url.toString());
  } catch (e: any) {
    // Next.js redirect throws; rethrow those
    if (e?.digest?.startsWith?.('NEXT_REDIRECT') || e?.message === 'NEXT_REDIRECT') {
      throw e;
    }
    console.error('[connectRestappAction]', e);
    redirect('https://restapp.allsender.tech/settings?tab=restappaiSettings&error=connect_failed');
  }
}
