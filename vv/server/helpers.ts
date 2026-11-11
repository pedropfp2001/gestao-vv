import type { Order } from '../src/types';

export const VALID_SELLERS = ['Pedro', 'Daniel', 'Igor', 'Ricardo', 'Wanderley'] as const;
export const GESTAO_USERS = ['Pedro', 'Daniel', 'Igor'] as const;

export function isGestao(name?: string | null): boolean {
  return !!name && (GESTAO_USERS as readonly string[]).includes(name);
}

export function normalizeBrandName(rawMarca: string): string {
  if (!rawMarca) return '';
  return String(rawMarca)
    .replace(/^MARCA\s*:\s*/i, '')
    .replace(/^CLIENTE\s*:\s*/i, '')
    .replace(/^VV\s*-\s*/i, '')
    .replace(/^VV\s*/i, '')
    .replace(/\*/g, '')
    .replace(/[_\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function sanitizeBrandForComparison(brand: string): string {
  return normalizeBrandName(brand)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(SUPERMERCADO|SUPERMERCADOS|MERCADO|MERCADINHO|DISTRIBUIDORA|COMERCIO|COMERCIAL|ATACADO|ATACADISTA|VAREJO|MERCEARIA|MINIMERCADO|PADARIA|PANIFICADORA|LTDA|ME|EPP|EIRELI|SA|S\/A)\b/gi, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function matchSeller(name?: string): string | undefined {
  return VALID_SELLERS.find((s) => s.toLowerCase() === String(name || '').toLowerCase());
}

/** Resolve o vendedor de uma marca pelo mapa marca→vendedor e pelo histórico de pedidos. */
export function resolveSellerForBrand(
  brandInput: string,
  brandMap: Record<string, string>,
  orders: Order[],
  fallbackSeller?: string
): { seller: string; matchedBrand?: string; autoMapped: boolean } {
  const cleanInput = normalizeBrandName(brandInput);
  const fallback = matchSeller(fallbackSeller) || 'Ricardo';
  if (!cleanInput || cleanInput.length < 2) return { seller: fallback, autoMapped: false };

  const direct = matchSeller(brandMap[cleanInput]);
  if (direct) return { seller: direct, matchedBrand: cleanInput, autoMapped: true };

  const sorted = [...orders].sort(
    (a, b) => new Date(b.createdAt || b.data || 0).getTime() - new Date(a.createdAt || a.data || 0).getTime()
  );
  const directOrder = sorted.find((o) => normalizeBrandName(o.marca) === cleanInput && matchSeller(o.vendedor));
  if (directOrder) return { seller: matchSeller(directOrder.vendedor)!, matchedBrand: cleanInput, autoMapped: true };

  const sanitized = sanitizeBrandForComparison(cleanInput);
  if (sanitized.length >= 2) {
    const close = (other: string) =>
      other === sanitized ||
      (sanitized.length >= 4 && other.includes(sanitized)) ||
      (other.length >= 4 && sanitized.includes(other));
    for (const [mapBrand, seller] of Object.entries(brandMap)) {
      const s = sanitizeBrandForComparison(mapBrand);
      if (s && close(s) && matchSeller(seller)) return { seller: matchSeller(seller)!, matchedBrand: mapBrand, autoMapped: true };
    }
    for (const o of sorted) {
      const s = sanitizeBrandForComparison(o.marca);
      if (s && close(s) && matchSeller(o.vendedor)) return { seller: matchSeller(o.vendedor)!, matchedBrand: o.marca, autoMapped: true };
    }
  }
  return { seller: fallback, autoMapped: false };
}

/** Dias corridos em atraso (até hoje, ou até a baixa se pago). */
export function computeDiasAtraso(dateStr?: string, situacao?: string, dataBaixa?: string): number {
  if (!dateStr) return 0;
  try {
    const isPaid = situacao === 'PAGO' || situacao === 'BAIXADO' || Boolean(dataBaixa);
    let y = 0, m = 0, d = 0;
    const clean = String(dateStr).trim().split('T')[0];
    if (clean.includes('/')) {
      const p = clean.split('/');
      if (p.length === 3) { d = parseInt(p[0], 10); m = parseInt(p[1], 10) - 1; y = parseInt(p[2], 10); }
    } else if (clean.includes('-')) {
      const p = clean.split('-');
      if (p.length === 3) { y = parseInt(p[0], 10); m = parseInt(p[1], 10) - 1; d = parseInt(p[2], 10); }
    }
    if (!y || isNaN(y) || isNaN(m) || isNaN(d)) {
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) return 0;
      y = parsed.getFullYear(); m = parsed.getMonth(); d = parsed.getDate();
    }
    const due = new Date(y, m, d, 0, 0, 0, 0);
    const ref = isPaid ? (dataBaixa ? new Date(dataBaixa) : null) : new Date();
    if (!ref || isNaN(ref.getTime())) return 0;
    const refMid = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    return Math.max(0, Math.round((refMid.getTime() - due.getTime()) / 86400000));
  } catch {
    return 0;
  }
}

export function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  Object.keys(obj).forEach((k) => {
    if (obj[k] === undefined) delete obj[k];
  });
  return obj;
}

export const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
