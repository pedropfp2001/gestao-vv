/**
 * Camada de armazenamento. Duas implementações com a mesma interface:
 *  - FirestoreStore: produção (firebase-admin, conta de serviço).
 *  - MemoryStore: testes e desenvolvimento sem nuvem.
 * Nenhuma delas grava em disco local.
 */
export type WatchHandler = (type: 'upsert' | 'remove', id: string, data: any) => void;

export interface WriteOp {
  type: 'set' | 'delete';
  col: string;
  id: string;
  data?: any;
}

export interface StoreStatus {
  kind: 'firestore' | 'memory';
  quotaExhausted: boolean;
  lastError?: string;
}

export interface Store {
  readonly kind: 'firestore' | 'memory';
  get(col: string, id: string): Promise<any | null>;
  set(col: string, id: string, data: any): Promise<void>;
  delete(col: string, id: string): Promise<void>;
  deleteWhere(col: string, field: string, value: any): Promise<number>;
  queryWhere(col: string, field: string, value: any): Promise<any[]>;
  batch(ops: WriteOp[]): Promise<void>;
  /** Carrega a coleção inteira e continua avisando de mudanças. Resolve após a carga inicial. */
  watch(col: string, handler: WatchHandler): Promise<void>;
  status(): StoreStatus;
}

export class StoreQuotaError extends Error {
  constructor(msg = 'Cota do Firestore esgotada') {
    super(msg);
    this.name = 'StoreQuotaError';
  }
}

export function isQuotaError(err: any): boolean {
  const s = `${err?.code ?? ''} ${err?.message ?? ''}`;
  return err?.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded|quota/i.test(s);
}

/* ------------------------------ Memória ------------------------------ */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private cols = new Map<string, Map<string, any>>();
  /** Para testes: força falha de cota nas próximas escritas. */
  public simulateQuota = false;

  private col(name: string) {
    let c = this.cols.get(name);
    if (!c) { c = new Map(); this.cols.set(name, c); }
    return c;
  }
  private guard() {
    if (this.simulateQuota) throw new StoreQuotaError();
  }
  async get(col: string, id: string) {
    const v = this.col(col).get(id);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }
  async set(col: string, id: string, data: any) {
    this.guard();
    this.col(col).set(id, JSON.parse(JSON.stringify(data)));
  }
  async delete(col: string, id: string) {
    this.guard();
    this.col(col).delete(id);
  }
  async deleteWhere(col: string, field: string, value: any) {
    this.guard();
    let n = 0;
    for (const [id, v] of [...this.col(col).entries()]) {
      if (v?.[field] === value) { this.col(col).delete(id); n++; }
    }
    return n;
  }
  async queryWhere(col: string, field: string, value: any) {
    return [...this.col(col).values()].filter((v) => v?.[field] === value).map((v) => JSON.parse(JSON.stringify(v)));
  }
  async batch(ops: WriteOp[]) {
    this.guard();
    for (const op of ops) {
      if (op.type === 'set') this.col(op.col).set(op.id, JSON.parse(JSON.stringify(op.data)));
      else this.col(op.col).delete(op.id);
    }
  }
  async watch(col: string, handler: WatchHandler) {
    for (const [id, v] of this.col(col).entries()) handler('upsert', id, JSON.parse(JSON.stringify(v)));
  }
  status(): StoreStatus {
    return { kind: 'memory', quotaExhausted: this.simulateQuota };
  }
}

/* ------------------------------ Firestore ------------------------------ */
export class FirestoreStore implements Store {
  readonly kind = 'firestore' as const;
  private db: any;
  private quotaExhausted = false;
  private lastError: string | undefined;

  constructor(db: any) {
    this.db = db;
  }

  static async create(): Promise<FirestoreStore> {
    const admin = await import('firebase-admin');
    const mod: any = (admin as any).default || admin;
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT_B64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
      : process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('Defina FIREBASE_SERVICE_ACCOUNT (JSON da conta de serviço) ou FIREBASE_SERVICE_ACCOUNT_B64.');
    let cred: any;
    try { cred = JSON.parse(raw); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT não é um JSON válido.'); }
    if (cred.private_key) cred.private_key = String(cred.private_key).replace(/\\n/g, '\n');
    if (!mod.apps.length) mod.initializeApp({ credential: mod.credential.cert(cred), projectId: cred.project_id });
    const { getFirestore } = await import('firebase-admin/firestore');
    const dbId = process.env.FIRESTORE_DATABASE_ID;
    const db = dbId ? getFirestore(mod.app(), dbId) : getFirestore(mod.app());
    db.settings({ ignoreUndefinedProperties: true });
    return new FirestoreStore(db);
  }

  private ok() {
    this.quotaExhausted = false;
    this.lastError = undefined;
  }
  private fail(err: any): never {
    this.lastError = String(err?.message || err);
    if (isQuotaError(err)) {
      this.quotaExhausted = true;
      throw new StoreQuotaError();
    }
    throw err;
  }

  async get(col: string, id: string) {
    try {
      const s = await this.db.collection(col).doc(id).get();
      this.ok();
      return s.exists ? s.data() : null;
    } catch (e) { return this.fail(e); }
  }
  async set(col: string, id: string, data: any) {
    try { await this.db.collection(col).doc(id).set(data); this.ok(); } catch (e) { this.fail(e); }
  }
  async delete(col: string, id: string) {
    try { await this.db.collection(col).doc(id).delete(); this.ok(); } catch (e) { this.fail(e); }
  }
  async queryWhere(col: string, field: string, value: any) {
    try {
      const s = await this.db.collection(col).where(field, '==', value).get();
      this.ok();
      return s.docs.map((d: any) => d.data());
    } catch (e) { return this.fail(e); }
  }
  async deleteWhere(col: string, field: string, value: any) {
    try {
      const s = await this.db.collection(col).where(field, '==', value).get();
      const ops: WriteOp[] = s.docs.map((d: any) => ({ type: 'delete', col, id: d.id }));
      await this.batch(ops);
      return ops.length;
    } catch (e) { return this.fail(e); }
  }
  async batch(ops: WriteOp[]) {
    try {
      // Lotes de até 400 operações e ~8 MB (limite do Firestore: 500 ops / 10 MB por commit).
      let group: WriteOp[] = [];
      let bytes = 0;
      const flush = async () => {
        if (!group.length) return;
        const b = this.db.batch();
        for (const op of group) {
          const ref = this.db.collection(op.col).doc(op.id);
          if (op.type === 'set') b.set(ref, op.data);
          else b.delete(ref);
        }
        await b.commit();
        group = [];
        bytes = 0;
      };
      for (const op of ops) {
        const size = op.type === 'set' ? JSON.stringify(op.data).length : 100;
        if (group.length >= 400 || (group.length && bytes + size > 8_000_000)) await flush();
        group.push(op);
        bytes += size;
      }
      await flush();
      this.ok();
    } catch (e) { this.fail(e); }
  }
  watch(col: string, handler: WatchHandler): Promise<void> {
    return new Promise((resolve, reject) => {
      let first = true;
      this.db.collection(col).onSnapshot(
        (snap: any) => {
          snap.docChanges().forEach((ch: any) => {
            if (ch.type === 'removed') handler('remove', ch.doc.id, null);
            else handler('upsert', ch.doc.id, ch.doc.data());
          });
          this.ok();
          if (first) { first = false; resolve(); }
        },
        (err: any) => {
          this.lastError = String(err?.message || err);
          if (isQuotaError(err)) this.quotaExhausted = true;
          console.error(`[STORE] Erro no listener de "${col}":`, err?.message || err);
          if (first) { first = false; reject(err); }
        }
      );
    });
  }
  status(): StoreStatus {
    return { kind: 'firestore', quotaExhausted: this.quotaExhausted, lastError: this.lastError };
  }
}
