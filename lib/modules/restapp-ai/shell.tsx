import type { ReactNode } from 'react';
import Link from 'next/link';

const NAV = [
  { href: '/modulo/restapp-ai', label: 'Dashboard' },
  { href: '/modulo/restapp-ai/gestion/pedidos', label: 'Pedidos' },
  { href: '/modulo/restapp-ai/gestion/reservas', label: 'Reservas' },
  { href: '/modulo/restapp-ai/gestion/mesas', label: 'Mesas' },
  { href: '/modulo/restapp-ai/gestion/menu', label: 'Menú' },
  { href: '/modulo/restapp-ai/gestion/productos', label: 'Productos' },
  { href: '/modulo/restapp-ai/gestion/sucursales', label: 'Sucursales' },
  { href: '/modulo/restapp-ai/gestion/clientes', label: 'Clientes' },
  { href: '/modulo/restapp-ai/gestion/equipo', label: 'Equipo' },
  { href: '/modulo/restapp-ai/faq', label: 'FAQ' },
  { href: '/modulo/restapp-ai/parametro', label: 'Parámetros' },
  { href: '/modulo/restapp-ai/configuracion', label: 'Configuración' },
  { href: '/modulo/restapp-ai/configuracion/docs/api', label: 'API' },
];

export function RestappShell({
  title,
  subtitle,
  restaurantName,
  beta,
  activePath,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  restaurantName?: string | null;
  beta?: boolean;
  activePath?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600">RestaPP AI</p>
            {beta !== false ? (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-800">
                Beta producción
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {subtitle || restaurantName || 'Módulo de restaurante con datos reales del equipo'}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-1">
        {NAV.map((item) => {
          const active = activePath === item.href || (activePath || '').startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                active
                  ? 'border-orange-300 bg-orange-50 text-orange-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-border dark:bg-card',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-border dark:bg-card">
      <p className="font-semibold text-slate-800 dark:text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function money(v: unknown, currency = 'DOP') {
  const n = Number(v || 0);
  return `${currency === 'DOP' ? 'RD$' : currency + ' '}${n.toLocaleString('es-DO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function StatusPill({ status }: { status: string }) {
  const s = String(status || '').toLowerCase();
  const cls =
    s.includes('free') || s === 'completed' || s === 'confirmed'
      ? 'bg-emerald-100 text-emerald-800'
      : s.includes('occup') || s === 'preparing' || s === 'pending'
        ? 'bg-amber-100 text-amber-900'
        : s.includes('cancel') || s === 'rejected'
          ? 'bg-rose-100 text-rose-800'
          : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{status}</span>;
}
