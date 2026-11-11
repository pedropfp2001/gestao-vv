import { Order } from '../types';

/** Imagem neutra exibida quando o pedido não tem foto (não imita comprovante). */
export function createReceiptDataUrl(_title?: string, _date?: string, _value?: string, _seller?: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#f1f5f9"/><rect x="20" y="20" width="560" height="760" rx="16" fill="#fff" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="10 8"/><text x="300" y="400" fill="#94a3b8" font-family="sans-serif" font-size="30" font-weight="bold" text-anchor="middle">SEM FOTO</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function hasOrderPhoto(order?: Partial<Order> | null): boolean {
  return !!order && typeof order.imageUrl === 'string' && order.imageUrl.trim().length > 5;
}

/** URL da foto do pedido (servida pelo servidor a partir do Firestore) ou o marcador "sem foto". */
export function getOrderImageUrl(order?: Partial<Order> | null): string {
  if (hasOrderPhoto(order)) return order!.imageUrl as string;
  return createReceiptDataUrl();
}
