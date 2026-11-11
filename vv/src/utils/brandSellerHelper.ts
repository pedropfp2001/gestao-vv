// Helper to normalize and match client brands with salespersons intelligently

export const normalizeBrand = (raw: string): string => {
  if (!raw) return '';
  return raw
    .replace(/^MARCA\s*:\s*/i, '')
    .replace(/^CLIENTE\s*:\s*/i, '')
    .replace(/^VV\s*-\s*/i, '')
    .replace(/^VV\s*/i, '')
    .replace(/\*/g, '')
    .replace(/[_\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

export const sanitizeBrandForComparison = (brand: string): string => {
  return normalizeBrand(brand)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\b(SUPERMERCADO|SUPERMERCADOS|MERCADO|MERCADINHO|DISTRIBUIDORA|COMERCIO|COMERCIAL|ATACADO|ATACADISTA|VAREJO|MERCEARIA|MINIMERCADO|PADARIA|PANIFICADORA|LTDA|ME|EPP|EIRELI|SA|S\/A)\b/gi, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
};

export interface SellerMatchResult {
  seller: 'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley';
  matchedBrand: string;
  isExact: boolean;
  confidence: number;
}

/**
 * Searches for the best seller matching a given brand name from the known mappings and orders history
 */
export function findBestSellerForBrand(
  brandInput: string,
  brandSellerMap: Record<string, string>,
  ordersHistory: Array<{ marca: string; vendedor: string }> = []
): SellerMatchResult | null {
  const cleanInput = normalizeBrand(brandInput);
  if (!cleanInput || cleanInput.length < 2) return null;

  const validSellers = ['Pedro', 'Daniel', 'Igor', 'Ricardo', 'Wanderley'] as const;

  // 1. Direct exact normalized match in brandSellerMap
  if (brandSellerMap[cleanInput]) {
    const s = brandSellerMap[cleanInput];
    const match = validSellers.find((v) => v.toLowerCase() === s.toLowerCase());
    if (match) {
      return { seller: match, matchedBrand: cleanInput, isExact: true, confidence: 1.0 };
    }
  }

  // 2. Direct exact normalized match in orders history
  const directOrder = ordersHistory.find((o) => normalizeBrand(o.marca) === cleanInput);
  if (directOrder && directOrder.vendedor) {
    const match = validSellers.find((v) => v.toLowerCase() === directOrder.vendedor.toLowerCase());
    if (match) {
      return { seller: match, matchedBrand: cleanInput, isExact: true, confidence: 1.0 };
    }
  }

  const sanitizedInput = sanitizeBrandForComparison(cleanInput);
  if (!sanitizedInput || sanitizedInput.length < 2) return null;

  // 3. Search in brandSellerMap with sanitized tokens
  for (const [mapBrand, seller] of Object.entries(brandSellerMap)) {
    const sanitizedMapBrand = sanitizeBrandForComparison(mapBrand);
    if (!sanitizedMapBrand) continue;

    if (sanitizedMapBrand === sanitizedInput) {
      const match = validSellers.find((v) => v.toLowerCase() === seller.toLowerCase());
      if (match) {
        return { seller: match, matchedBrand: mapBrand, isExact: false, confidence: 0.95 };
      }
    }

    if (
      (sanitizedInput.length >= 4 && sanitizedMapBrand.includes(sanitizedInput)) ||
      (sanitizedMapBrand.length >= 4 && sanitizedInput.includes(sanitizedMapBrand))
    ) {
      const match = validSellers.find((v) => v.toLowerCase() === seller.toLowerCase());
      if (match) {
        return { seller: match, matchedBrand: mapBrand, isExact: false, confidence: 0.85 };
      }
    }
  }

  // 4. Search in ordersHistory with sanitized tokens
  for (const order of ordersHistory) {
    const sanitizedOrderBrand = sanitizeBrandForComparison(order.marca);
    if (!sanitizedOrderBrand) continue;

    if (sanitizedOrderBrand === sanitizedInput) {
      const match = validSellers.find((v) => v.toLowerCase() === order.vendedor.toLowerCase());
      if (match) {
        return { seller: match, matchedBrand: order.marca, isExact: false, confidence: 0.9 };
      }
    }

    if (
      (sanitizedInput.length >= 4 && sanitizedOrderBrand.includes(sanitizedInput)) ||
      (sanitizedOrderBrand.length >= 4 && sanitizedInput.includes(sanitizedOrderBrand))
    ) {
      const match = validSellers.find((v) => v.toLowerCase() === order.vendedor.toLowerCase());
      if (match) {
        return { seller: match, matchedBrand: order.marca, isExact: false, confidence: 0.8 };
      }
    }
  }

  return null;
}
