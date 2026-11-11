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
export class State {
  orders = new Map<string, Order>();
  boletos = new Map<string, OverdueBoleto>();
  notifications = new Map<string, AppNotification>();
  users = new Map<string, UserDoc>();
  ledger = new Map<string, any>();
  brandMap: Record<string, string> = {};
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
      s.watch('settings', (t, id, d) => { if (id === 'brandSellers') { this.brandMap = t === 'remove' ? {} : { ...(d?.map || {}) }; this.touch(); } }),
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
