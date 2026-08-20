import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getTeamForUser, getUser } from '@/lib/db/queries';
import { loadTeamPlanLabel } from '@/lib/restapp-connect/codes';
import {
  ensureUserFromRestappHandoff,
  verifyRestappHandoffToken,
} from '@/lib/restapp-connect/handoff';
import { connectRestappAction } from './actions';

export const dynamic = 'force-dynamic';

function pickReturnUrl(sp: Record<string, string | undefined>) {
  return String(
    sp.return_url ||
      sp.returnUrl ||
      'https://restapp.allsender.tech/restapp-ai/connect/callback'
  );
}

export default async function ConnectRestappPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
}) {
  try {
    const sp =
      searchParams && typeof searchParams === 'object' && 'then' in searchParams
        ? await searchParams
        : searchParams || {};

    const returnUrl = pickReturnUrl(sp as Record<string, string | undefined>);
    const state = String((sp as any).state || '');
    const handoff = String((sp as any).handoff || (sp as any).token || '');

    const qs = new URLSearchParams();
    qs.set('return_url', returnUrl);
    if (state) qs.set('state', state);
    // Keep handoff only for retry links if needed (short-lived)
    // Do not re-append after session is set.

    let autoCreated = false;
    let handoffEmail: string | null = null;

    // 1) Prefer existing session
    let user = await getUser().catch(() => null);
    let team = await getTeamForUser().catch(() => null);

    // 2) Auto-login / auto-register from RestApp signed handoff (novice-friendly)
    if ((!user || !team) && handoff) {
      const payload = verifyRestappHandoffToken(handoff);
      if (payload) {
        const result = await ensureUserFromRestappHandoff(payload);
        if (result.ok) {
          autoCreated = result.created;
          handoffEmail = result.email;
          user = await getUser().catch(() => null);
          team = await getTeamForUser().catch(() => null);
        }
      }
    }

    if (!user || !team) {
      // Fallback only if handoff missing/invalid: classic login with redirect preserved
      if (handoff) qs.set('handoff', handoff);
      redirect(`/es/sign-in?redirect=${encodeURIComponent(`/es/connect/restapp?${qs.toString()}`)}`);
    }

    const teamName = String((team as any).name || `Equipo #${(team as any).id}`);
    const planName =
      (await loadTeamPlanLabel(Number((team as any).id)).catch(() => null)) ||
      'Plan free / revisar facturación';
    const accountEmail = handoffEmail || String((user as any).email || '');

    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-3xl border bg-white p-6 shadow-sm dark:border-border dark:bg-card">
          <p className="text-xs font-bold uppercase tracking-wide text-orange-600">Conexión RestAPP</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
            Autorizar RestApp POS
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Estás conectando <strong>AllSender</strong> (WhatsApp + inteligencia) con{' '}
            <strong>RestApp</strong> (POS, mesas y cocina). Son <strong>dos servicios separados</strong> del
            mismo grupo: cada uno puede tener su membresía.
          </p>

          {autoCreated ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-bold">Cuenta AllSender creada automáticamente</p>
              <p className="mt-1 text-xs leading-relaxed">
                Usamos tu correo de RestApp (<strong>{accountEmail}</strong>) para no pedirte otro registro.
                Solo falta aceptar los términos para terminar la conexión.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
              <p className="font-bold">Cuenta AllSender reconocida</p>
              <p className="mt-1 text-xs leading-relaxed">
                {accountEmail ? (
                  <>
                    Sesión lista para <strong>{accountEmail}</strong>. Acepta los términos para autorizar RestApp.
                  </>
                ) : (
                  <>Sesión AllSender lista. Acepta los términos para autorizar RestApp.</>
                )}
              </p>
            </div>
          )}

          <div className="mt-5 space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm dark:border-border dark:bg-background">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Cuenta AllSender</span>
              <span className="font-semibold text-slate-900 dark:text-white">{teamName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Plan AllSender</span>
              <span className="font-semibold text-slate-900 dark:text-white">{planName}</span>
            </div>
            {accountEmail ? (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Correo</span>
                <span className="font-semibold text-slate-900 dark:text-white break-all">{accountEmail}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
            <p className="font-bold">Términos del servicio de conexión</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
              <li>
                <strong>AllSender</strong> provee canales (WhatsApp/redes) e inteligencia conversacional. Se factura
                en auth.allsender.tech.
              </li>
              <li>
                <strong>RestApp</strong> provee POS, mesas, cocina y delivery del restaurante. Se factura en
                restapp.allsender.tech.
              </li>
              <li>
                Al aceptar, autorizas crear un código de conexión seguro, sincronizar menú/mesas y enviar pedidos del
                chat a RestApp en tiempo real.
              </li>
              <li>Puedes desconectar en cualquier momento desde RestApp → Configuración → RestAPP AI.</li>
              <li>No compartas el código ni tus credenciales con terceros.</li>
            </ul>
          </div>

          <form action={connectRestappAction} className="mt-6 space-y-4">
            <input type="hidden" name="return_url" value={returnUrl} />
            <input type="hidden" name="state" value={state} />

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-border dark:bg-background">
              <input
                type="checkbox"
                name="accept_terms"
                value="1"
                required
                className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-slate-700 dark:text-slate-200">
                He leído y <strong>acepto</strong> que AllSender y RestApp son servicios separados, con membresías
                independientes, y autorizo la conexión entre ambos para mi restaurante.
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                className="flex-1 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700"
              >
                Aceptar y conectar
              </button>
              <Link
                href={
                  returnUrl.includes('restapp')
                    ? returnUrl
                        .split('?')[0]
                        .replace('/restapp-ai/connect/callback', '/settings?tab=restappaiSettings')
                    : 'https://restapp.allsender.tech/settings?tab=restappaiSettings'
                }
                className="flex-1 rounded-xl border px-4 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200"
              >
                Rechazar y volver
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  } catch (e: any) {
    if (e?.digest?.startsWith?.('NEXT_REDIRECT') || e?.message === 'NEXT_REDIRECT') throw e;
    console.error('[connect/restapp] page error', e);
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold">No se pudo abrir la conexión</h1>
        <p className="mt-2 text-sm text-slate-600">
          Vuelve a RestApp e intenta conectar de nuevo desde Configuración → RestAPP AI.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <Link
            href="https://restapp.allsender.tech/settings?tab=restappaiSettings"
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white"
          >
            Volver a RestApp
          </Link>
        </div>
      </div>
    );
  }
}
