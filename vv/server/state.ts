import type { Order, OverdueBoleto, AppNotification } from '../src/types';
import { Store, WriteOp } from './store';
import { DEFAULT_PINS, hashPin } from './auth';
import { VALID_SELLERS, GESTAO_USERS } from './helpers';

export interface UserDoc {
  name: string;
  role: 'admin' | 'vendedor';
  salt: string;
  hash: string;
  pinVersion: number;
  updatedAt: string;
}

/** Cópia em memória sempre alimentada pelo Firestore (listeners). Nunca é reenviada à nuvem em bloco. */
export interface PrefetchConfig {
  semana: { inicio: number; fim: number };  // seg a sex
  sabado: { inicio: number; fim: number };  // turno mais curto
  domingo: boolean;                         // roda no domingo?
}
export const DEFAULT_PREFETCH_CONFIG: PrefetchConfig = { semana: { inicio: 8, fim: 19 }, sabado: { inicio: 8, fim: 13 }, domingo: false };
const hora = (v: any, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 23 ? n : d; };
export function mergePrefetchConfig(d: any): PrefetchConfig {
  const base = DEFAULT_PREFETCH_CONFIG;
  const win = (x: any, b: { inicio: number; fim: number }) => {
    const inicio = hora(x?.inicio, b.inicio); let fim = hora(x?.fim, b.fim);
    if (fim <= inicio) fim = Math.min(23, inicio + 1);
    return { inicio, fim };
  };
  return { semana: win(d?.semana, base.semana), sabado: win(d?.sabado, base.sabado), domingo: d?.domingo === true };
}
/** A pré-leitura pode rodar agora? (hora e dia da semana no fuso de São Paulo) */
export function dentroDaJanela(cfg: PrefetchConfig, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now);
  const wd = parts.find((p) => p.type === 'weekday')!.value;
  const h = Number(parts.find((p) => p.type === 'hour')!.value) % 24;
  if (wd === 'Sun') return cfg.domingo && h >= cfg.semana.inicio && h < cfg.semana.fim;
  const w = wd === 'Sat' ? cfg.sabado : cfg.semana;
  return h >= w.inicio && h < w.fim;
}

export class State {
  orders = new Map<string, Order>();
  boletos = new Map<string, OverdueBoleto>();
  notifications = new Map<string, AppNotification>();
  users = new Map<string, UserDoc>();
  ledger = new Map<string, any>();
  /** Só os metadados dos backups automáticos (o conteúdo fica em 'backupChunks'). */
  backups = new Map<string, any>();
  /** Horários da pré-leitura automática (horas inteiras, fuso de São Paulo). */
  prefetchConfig: PrefetchConfig = { ...DEFAULT_PREFETCH_CONFIG };
  brandMap: Record<string, string> = {};
  /** Marcas escolhidas para o relatório do envio diário (valem para todos os usuários). */
  reportBrands: { brands: string[]; updatedAt?: string; updatedBy?: string } = { brands: [] };
  version = new Date().toISOString();
  ready = false;

  constructor(public store: Store) {}

  touch() { this.version = new Date().toISOString(); }

  async load() {
    const s = this.store;
    await Promise.all([
      s.watch('orders', (t, id, d) => { t === 'remove' ? this.orders.delete(id) : this.orders.set(id, d); this.touch(); }),
      s.watch('boletos', (t, id, d) => { t === 'remove' ? this.boletos.delete(id) : this.boletos.set(id, d); this.touch(); }),
      s.watch('notifications', (t, id, d) => { t === 'remove' ? this.notifications.delete(id) : this.notifications.set(id, d); }),
      s.watch('users', (t, id, d) => { t === 'remove' ? this.users.delete(id) : this.users.set(id, d); }),
      s.watch('ledger', (t, id, d) => { t === 'remove' ? this.ledger.delete(id) : this.ledger.set(id, d); }),
      s.watch('backups', (t, id, d) => { t === 'remove' ? this.backups.delete(id) : this.backups.set(id, d); }),
      s.watch('settings', (t, id, d) => {
        if (id === 'brandSellers') { this.brandMap = t === 'remove' ? {} : { ...(d?.map || {}) }; this.touch(); }
        if (id === 'prefetchConfig') { this.prefetchConfig = t === 'remove' ? { ...DEFAULT_PREFETCH_CONFIG } : mergePrefetchConfig(d); }
        if (id === 'reportBrands') { this.reportBrands = t === 'remove' ? { brands: [] } : { brands: Array.isArray(d?.brands) ? d.brands : [], updatedAt: d?.updatedAt, updatedBy: d?.updatedBy }; }
      }),
    ]);
    await this.ensureUsers();
    this.ready = true;
  }

  /** Cria apenas as 5 contas de acesso (não cria pedidos nem dados de exemplo). */
  private async ensureUsers() {
    const ops: WriteOp[] = [];
    for (const name of VALID_SELLERS) {
      if (this.users.has(name)) continue;
      const { salt, hash } = hashPin(DEFAULT_PINS[name]);
      const doc: UserDoc = {
        name, role: (GESTAO_USERS as readonly string[]).includes(name) ? 'admin' : 'vendedor',
        salt, hash, pinVersion: 1, updatedAt: new Date().toISOString(),
      };
      ops.push({ type: 'set', col: 'users', id: name, data: doc });
      this.users.set(name, doc);
    }
    if (ops.length) await this.store.batch(ops);
  }

  ordersList() { return [...this.orders.values()]; }
  boletosList() { return [...this.boletos.values()]; }
}
