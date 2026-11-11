import { OverdueBoleto } from '../types';

/**
 * Format currency to Brazilian Reais (R$)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

/**
 * Format ISO date string YYYY-MM-DD or DD/MM/YYYY to DD/MM/YYYY
 */
export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '-';
  const clean = String(dateStr).trim().split('T')[0];
  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  return clean;
}

/**
 * Calculate elapsed calendar days from order date to today (at midnight local time)
 */
export function computeOrderDiasAtraso(dataStr: string): number {
  if (!dataStr) return 0;
  let y = 0,
    m = 0,
    d = 0;

  const clean = String(dataStr).trim().split('T')[0];
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      y = parseInt(parts[2], 10);
    }
  } else if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
    }
  }

  if (!y || isNaN(y) || isNaN(m) || isNaN(d)) {
    const parsed = new Date(dataStr);
    if (isNaN(parsed.getTime())) return 0;
    y = parsed.getFullYear();
    m = parsed.getMonth();
    d = parsed.getDate();
  }

  // Exact calendar dates at midnight local time
  const orderMidnight = new Date(y, m, d, 0, 0, 0, 0);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const diffMs = todayMidnight.getTime() - orderMidnight.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Calculate exact elapsed calendar days overdue for a boleto:
 * - If EM ABERTO: Difference in calendar days between today (local midnight) and due date (local midnight).
 *   Returns 0 if due date is today or in the future.
 * - If PAGO / BAIXADO: If dataBaixa is present, difference between settlement date and due date.
 *   Returns 0 if paid on time or if dataBaixa is absent.
 */
export function computeBoletoDiasAtraso(
  dataStr?: string,
  situacao?: string,
  dataBaixa?: string
): number {
  if (!dataStr) return 0;

  const isPaid =
    situacao === 'PAGO' ||
    (situacao as any) === 'BAIXADO' ||
    Boolean(dataBaixa);

  // Parse due date
  let y = 0,
    m = 0,
    d = 0;

  const cleanData = String(dataStr).trim().split('T')[0];
  if (cleanData.includes('/')) {
    const parts = cleanData.split('/');
    if (parts.length === 3) {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      y = parseInt(parts[2], 10);
    }
  } else if (cleanData.includes('-')) {
    const parts = cleanData.split('-');
    if (parts.length === 3) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
    }
  }

  if (!y || isNaN(y) || isNaN(m) || isNaN(d)) {
    const parsed = new Date(dataStr);
    if (isNaN(parsed.getTime())) return 0;
    y = parsed.getFullYear();
    m = parsed.getMonth();
    d = parsed.getDate();
  }

  const dueMidnight = new Date(y, m, d, 0, 0, 0, 0);

  if (isPaid) {
    if (!dataBaixa) return 0;
    const bDate = new Date(dataBaixa);
    if (isNaN(bDate.getTime())) return 0;
    const bMidnight = new Date(
      bDate.getFullYear(),
      bDate.getMonth(),
      bDate.getDate(),
      0,
      0,
      0,
      0
    );
    const diffMs = bMidnight.getTime() - dueMidnight.getTime();
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  }

  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );

  const diffMs = todayMidnight.getTime() - dueMidnight.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Checks if a boleto is actively open (pending payment)
 */
export function isBoletoOpen(b?: OverdueBoleto | null): boolean {
  if (!b) return false;
  if (b.situacao === 'PAGO' || (b.situacao as any) === 'BAIXADO' || (b as any).status === 'baixado') {
    return false;
  }
  if (b.dataBaixa) {
    return false;
  }
  return b.situacao === 'EM ABERTO' || !b.situacao;
}

/**
 * Parses date string (YYYY-MM-DD or DD/MM/YYYY) to timestamp at local midnight.
 * Returns 0 if invalid.
 */
export function parseBoletoDateToTimestamp(dataStr?: string): number {
  if (!dataStr) return 0;
  let y = 0,
    m = 0,
    d = 0;

  const cleanData = String(dataStr).trim().split('T')[0];
  if (cleanData.includes('/')) {
    const parts = cleanData.split('/');
    if (parts.length === 3) {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      y = parseInt(parts[2], 10);
    }
  } else if (cleanData.includes('-')) {
    const parts = cleanData.split('-');
    if (parts.length === 3) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
    }
  }

  if (!y || isNaN(y) || isNaN(m) || isNaN(d)) {
    const parsed = new Date(dataStr);
    if (isNaN(parsed.getTime())) return 0;
    y = parsed.getFullYear();
    m = parsed.getMonth();
    d = parsed.getDate();
  }

  return new Date(y, m, d, 0, 0, 0, 0).getTime();
}

/**
 * Sorts an array of boletos from oldest overdue (earliest due date / highest delay) to most recent overdue.
 */
export function sortBoletosByOldestOverdue(
  list: OverdueBoleto[],
  order: 'oldest' | 'newest' = 'oldest'
): OverdueBoleto[] {
  return [...list].sort((a, b) => {
    const timeA = parseBoletoDateToTimestamp(a.data);
    const timeB = parseBoletoDateToTimestamp(b.data);

    if (!timeA && timeB) return 1;
    if (timeA && !timeB) return -1;

    if (timeA !== timeB) {
      return order === 'oldest' ? timeA - timeB : timeB - timeA;
    }

    const diasA = computeBoletoDiasAtraso(a.data, a.situacao, a.dataBaixa);
    const diasB = computeBoletoDiasAtraso(b.data, b.situacao, b.dataBaixa);
    if (diasA !== diasB) {
      return order === 'oldest' ? diasB - diasA : diasA - diasB;
    }

    return (b.valor || 0) - (a.valor || 0);
  });
}
