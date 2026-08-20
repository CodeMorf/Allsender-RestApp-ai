/**
 * Shared money helpers for SaaS product imports (RestaPP, Ventas, API, forms).
 * Accepts RD$, commas, aliases (precio / unit_price), nested variants.
 */
import 'server-only';

/** Strip currency symbols / spaces and parse es-DO / en-US decimals. */
export function parseMoney(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    // nested: { amount: 150 } | { value: 150 } | { price: 150 }
    const nested =
      o.amount ?? o.value ?? o.price ?? o.precio ?? o.unit_price ?? o.unitPrice;
    if (nested != null && nested !== value) return parseMoney(nested, fallback);
  }

  let s = String(value).trim();
  if (!s) return fallback;

  // Remove currency codes/symbols and letters except separators
  s = s
    .replace(/RD\$|DOP|USD|EUR|\$|€|£/gi, '')
    .replace(/\s+/g, '')
    .replace(/[^\d,.\-]/g, '');

  if (!s || s === '-' || s === '.' || s === ',') return fallback;

  // 1.234,56 (es) vs 1,234.56 (en) vs 1234,56 vs 1234.56
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // 150,50 or 1.234 mis-typed as 1,234 without decimals
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0].replace(/\./g, '')}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  // Guard absurd negatives for catalog prices
  if (n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

const PRICE_KEYS = [
  'price',
  'precio',
  'unit_price',
  'unitPrice',
  'sale_price',
  'salePrice',
  'amount',
  'costo',
  'cost',
  'base_price',
  'basePrice',
  'regular_price',
  'regularPrice',
] as const;

/** True if payload intentionally includes a price field (re-sync safe). */
export function hasPriceInPayload(data: Record<string, unknown> | null | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  for (const k of PRICE_KEYS) {
    const v = data[k];
    if (v != null && v !== '') return true;
  }
  const variants = data.variants_json ?? data.variants ?? data.variantes;
  if (Array.isArray(variants) && variants[0] && typeof variants[0] === 'object') {
    return hasPriceInPayload(variants[0] as Record<string, unknown>);
  }
  return false;
}

/** Pick first defined price-like field from a product payload (API / form / POS). */
export function pickPrice(data: Record<string, unknown> | null | undefined, fallback = 0): number {
  if (!data || typeof data !== 'object') return fallback;
  const candidates = PRICE_KEYS.map((k) => data[k]);
  for (const c of candidates) {
    if (c == null || c === '') continue;
    const n = parseMoney(c, Number.NaN);
    if (Number.isFinite(n)) return n;
  }
  // variants_json[0].price
  const variants = data.variants_json ?? data.variants ?? data.variantes;
  if (Array.isArray(variants) && variants[0]) {
    const n = pickPrice(variants[0] as Record<string, unknown>, Number.NaN);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Normalize product money fields for import.
 * - If price is present → set numeric price (allows re-sync of prices).
 * - If price is absent → do NOT force 0 (preserves existing price on update).
 */
export function normalizeProductMoneyFields<T extends Record<string, unknown>>(
  data: T
): T & { price?: number; __pricePresent?: boolean } {
  const pricePresent = hasPriceInPayload(data as Record<string, unknown>);
  const currencyRaw = data.currency ?? data.moneda ?? data.currency_code;
  const currency =
    currencyRaw != null && String(currencyRaw).trim()
      ? String(currencyRaw).trim().toUpperCase().slice(0, 8)
      : undefined;
  if (!pricePresent) {
    return {
      ...data,
      __pricePresent: false,
      ...(currency ? { currency } : {}),
    };
  }
  const price = pickPrice(data as Record<string, unknown>, 0);
  return {
    ...data,
    price,
    __pricePresent: true,
    ...(currency ? { currency } : {}),
  };
}
