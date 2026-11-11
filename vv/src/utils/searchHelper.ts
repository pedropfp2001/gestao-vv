/**
 * Utilitário inteligente de busca e normalização de texto.
 * Remove acentuação, caracteres especiais, pontuação e prefixos para que a busca
 * seja 100% tolerante e encontre os pedidos certos independente de como o usuário digite.
 */

export function normalizeSearchString(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos (ex: São -> Sao, Açougue -> Acougue)
    .replace(/^MARCA\s*:\s*/gi, '')
    .replace(/^CLIENTE\s*:\s*/gi, '')
    .replace(/^VV\s*[-–—]\s*/gi, '')
    .replace(/^VV\s*/gi, '')
    .replace(/[#*_\-–—/\\().,]/g, ' ') // Substitui símbolos por espaço
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Normaliza apenas acentos e caixa baixa preservando números e formatação.
 */
export function removeAccents(str: string): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Verifica se um conjunto de campos de um pedido atende aos critérios da busca.
 * Suporta:
 * 1. Múltiplas palavras (todos os termos digitados devem existir nos campos combinados).
 * 2. Busca por número de pedido (ex: "18", "#18", "ord-18", "ped-18").
 * 3. Busca por data (ex: "24/06", "2026-06-24", "junho").
 * 4. Busca por valor (ex: "233", "233,00", "48").
 * 5. Busca por vendedor ou observação.
 */
export function matchesOrderSearch(
  order: {
    id: string;
    marca: string;
    vendedor?: string;
    data?: string;
    valor?: number;
    status?: string;
    observacaoBaixa?: string;
    baixadoPor?: string;
    dataBaixa?: string;
    valorPago?: number;
    historicoBaixas?: any[];
  },
  searchQuery: string
): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;

  const rawQuery = searchQuery.trim();
  const normalizedQuery = normalizeSearchString(rawQuery);
  if (!normalizedQuery) return true;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);

  // Normaliza os campos do pedido
  const normalizedMarca = normalizeSearchString(order.marca);
  const normalizedVendedor = normalizeSearchString(order.vendedor);
  const normalizedObs = normalizeSearchString(order.observacaoBaixa);
  const normalizedBaixadoPor = normalizeSearchString(order.baixadoPor);

  // Normalização do ID (remove 'ord-', 'ped-', '#', etc.)
  const rawId = String(order.id || '').toLowerCase();
  const cleanIdNumber = rawId.replace(/[^0-9]/g, '');

  // Se o usuário digitou prefixo explícito de ID como "#18", "ord-18", "ped-18":
  if (/^(#|ord-|ped-)\d+$/i.test(rawQuery)) {
    const num = rawQuery.replace(/[^0-9]/g, '');
    return cleanIdNumber === num || rawId === `ord-${num}` || rawId === `ped-${num}`;
  }

  // Normalização de data do pedido
  let dateFormattedBR = '';
  if (order.data) {
    const parts = String(order.data).split('T')[0].split('-');
    if (parts.length === 3) {
      dateFormattedBR = `${parts[2]}/${parts[1]}/${parts[0]} ${parts[2]}/${parts[1]}`;
    }
  }

  // Normalização de data da baixa
  let dateBaixaBR = '';
  if (order.dataBaixa) {
    const parts = String(order.dataBaixa).split('T')[0].split('-');
    if (parts.length === 3) {
      dateBaixaBR = `${parts[2]}/${parts[1]}/${parts[0]} ${parts[2]}/${parts[1]}`;
    }
  }

  // Normalização de valor (ex: "233", "233.00", "233,00")
  let valorStr = '';
  if (typeof order.valor === 'number') {
    valorStr = `${order.valor} ${order.valor.toFixed(2)} ${order.valor.toFixed(2).replace('.', ',')}`;
  }
  if (typeof order.valorPago === 'number') {
    valorStr += ` ${order.valorPago} ${order.valorPago.toFixed(2)} ${order.valorPago.toFixed(2).replace('.', ',')}`;
  }

  // Status expandido em português
  const isSettled = order.status === 'baixado';
  const statusLabels = isSettled
    ? 'baixado baixados quitado quitados pago pagos liquidado baixa'
    : 'em aberto abertos aberto pendente pendentes a receber';

  // Histórico de baixas (observações e operadores)
  let historicoStr = '';
  if (Array.isArray(order.historicoBaixas)) {
    historicoStr = order.historicoBaixas
      .map((h) => `${normalizeSearchString(h.observacao || '')} ${normalizeSearchString(h.baixadoPor || '')}`)
      .join(' ');
  }

  // Texto consolidado para busca rápida
  const combinedSearchable = [
    normalizedMarca,
    rawId,
    cleanIdNumber ? `ord-${cleanIdNumber} ped-${cleanIdNumber} #${cleanIdNumber} ${cleanIdNumber}` : '',
    normalizedVendedor,
    dateFormattedBR,
    dateBaixaBR,
    String(order.data || ''),
    String(order.dataBaixa || ''),
    valorStr,
    normalizedObs,
    normalizedBaixadoPor,
    statusLabels,
    historicoStr,
  ].join(' ');

  // Se a busca for um número exato (ex: "#18" ou "18" ou "7300"), confere se o ID termina ou contém esse número
  const queryNumber = rawQuery.replace(/[^0-9]/g, '');
  if (queryNumber && (cleanIdNumber === queryNumber || rawId.endsWith(`-${queryNumber}`) || rawId === `ped-${queryNumber}` || rawId === `ord-${queryNumber}`)) {
    return true;
  }

  // Verifica se TODOS os termos digitados estão presentes no texto consolidado
  return queryTokens.every((token) => combinedSearchable.includes(token));
}

/**
 * Verifica se um boleto atende aos critérios da busca.
 */
export function matchesBoletoSearch(
  boleto: {
    id: string;
    marca: string;
    vendedor?: string;
    data?: string;
    valor?: number;
    indexNum?: number;
    numeroNF?: string;
    numeroBoleto?: string;
    observacao?: string;
    observacaoBaixa?: string;
    baixadoPor?: string;
  },
  searchQuery: string
): boolean {
  if (!searchQuery || !searchQuery.trim()) return true;

  const rawQuery = searchQuery.trim();
  const normalizedQuery = normalizeSearchString(rawQuery);
  if (!normalizedQuery) return true;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);

  const normalizedMarca = normalizeSearchString(boleto.marca);
  const normalizedVendedor = normalizeSearchString(boleto.vendedor);
  const normalizedNF = normalizeSearchString(boleto.numeroNF);
  const normalizedBoletoNum = normalizeSearchString(boleto.numeroBoleto);
  const normalizedObs = normalizeSearchString(boleto.observacao || boleto.observacaoBaixa);

  const cleanIndex = boleto.indexNum ? String(boleto.indexNum) : '';
  const cleanId = String(boleto.id || '').toLowerCase();

  let dateFormattedBR = '';
  if (boleto.data) {
    const parts = String(boleto.data).split('T')[0].split('-');
    if (parts.length === 3) {
      dateFormattedBR = `${parts[2]}/${parts[1]}/${parts[0]} ${parts[2]}/${parts[1]}`;
    }
  }

  let valorStr = '';
  if (typeof boleto.valor === 'number') {
    valorStr = `${boleto.valor} ${boleto.valor.toFixed(2)} ${boleto.valor.toFixed(2).replace('.', ',')}`;
  }

  const combinedSearchable = [
    normalizedMarca,
    cleanIndex,
    cleanId,
    normalizedVendedor,
    normalizedNF,
    normalizedBoletoNum,
    dateFormattedBR,
    String(boleto.data || ''),
    valorStr,
    normalizedObs,
  ].join(' ');

  const queryNumber = rawQuery.replace(/[^0-9]/g, '');
  if (queryNumber && (cleanIndex === queryNumber || cleanId.endsWith(`-${queryNumber}`))) {
    return true;
  }

  return queryTokens.every((token) => combinedSearchable.includes(token));
}
