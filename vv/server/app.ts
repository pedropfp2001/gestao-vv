import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import type { Order, OverdueBoleto, AppNotification } from '../src/types';
import { Store, StoreQuotaError, WriteOp } from './store';
import { State, UserDoc } from './state';
import { makeGeminiExtractor, ExtractError, Extractor } from './extract';
import {
  DEFAULT_PINS, hashPin, verifyPin, signSession, readSession, parseCookies, setSessionCookie,
  clearSessionCookie, COOKIE_NAME, requireGestao, LoginLimiter,
} from './auth';
import {
  VALID_SELLERS, isGestao, normalizeBrandName, resolveSellerForBrand, computeDiasAtraso, cleanUndefined, uid,
} from './helpers';

const MAX_IMAGE_CHARS = 420_000; // ~300 KB de imagem em base64
const MAX_PDF_CHARS = 4_000_000; // ~3 MB por PDF
const PDF_CHUNK = 700_000;
const ARCHIVE_DAYS = 90;

export interface AppOptions {
  sessionSecret: string;
  secureCookies?: boolean;
  staticDir?: string;
  extractor?: Extractor | null; // IA opcional (padrão: Gemini se GEMINI_API_KEY existir)
}

const wrap = (fn: (req: Request, res: Response) => Promise<any> | any): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};

const isDataImage = (s: any) => typeof s === 'string' && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(s);
const isDataPdf = (s: any) => typeof s === 'string' && /^data:application\/pdf;base64,/i.test(s);

export function createApp(store: Store, opts: AppOptions) {
  const state = new State(store);
  const app = express();
  const limiter = new LoginLimiter();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use(express.json({ limit: '50mb' }));

  /* ---------------------- util ---------------------- */
  const orderView = (o: Order): Order => {
    const out: any = { ...o };
    if (o.imageUrl) out.imageUrl = `/api/orders/${o.id}/image?v=${encodeURIComponent((o as any).imageUpdatedAt || '')}`;
    else out.imageUrl = '';
    return out;
  };
  const boletoView = (b: OverdueBoleto): OverdueBoleto => ({
    ...b,
    diasEmAtraso: computeDiasAtraso(b.data, b.situacao, b.dataBaixa),
  });
  const canSeeOrder = (user: string, o: Order) => isGestao(user) || o.vendedor === user;
  const canSeeBoleto = (user: string, b: OverdueBoleto) => isGestao(user) || b.vendedor === user;
  const sellerOk = (v: any) => VALID_SELLERS.find((s) => s.toLowerCase() === String(v || '').toLowerCase());

  const newOrderId = () => {
    for (let i = 0; i < 50; i++) {
      const id = `PED-${Math.floor(1000 + Math.random() * 9000)}`;
      if (!state.orders.has(id)) return id;
    }
    return `PED-${Date.now()}`;
  };

  /** Grava primeiro na nuvem; só depois atualiza a cópia em memória. */
  async function commit(ops: WriteOp[]) {
    await store.batch(ops);
    for (const op of ops) {
      if (op.col === 'orders') op.type === 'set' ? state.orders.set(op.id, op.data) : state.orders.delete(op.id);
      else if (op.col === 'boletos') op.type === 'set' ? state.boletos.set(op.id, op.data) : state.boletos.delete(op.id);
      else if (op.col === 'ledger' && op.type === 'set') state.ledger.set(op.id, op.data);
      else if (op.col === 'notifications') op.type === 'set' ? state.notifications.set(op.id, op.data) : state.notifications.delete(op.id);
    }
    state.touch();
  }
  async function saveBrandMap() {
    await store.set('settings', 'brandSellers', { map: state.brandMap, updatedAt: new Date().toISOString() });
  }

  /** Fotos */
  const imgOp = (id: string, dataUrl: string, ts: string): WriteOp => ({
    type: 'set', col: 'orderImages', id, data: { orderId: id, data: dataUrl, updatedAt: ts },
  });
  const imgDelOp = (id: string): WriteOp => ({ type: 'delete', col: 'orderImages', id });

  /** PDFs de boletos em pedaços */
  const pdfKey = (id: string, kind: 'nf' | 'boleto') => `${id}__${kind}`;
  function pdfOps(id: string, kind: 'nf' | 'boleto', dataUrl: string): WriteOp[] {
    const n = Math.ceil(dataUrl.length / PDF_CHUNK);
    const ops: WriteOp[] = [];
    for (let i = 0; i < n; i++) {
      ops.push({
        type: 'set', col: 'boletoPdfs', id: `${pdfKey(id, kind)}__${i}`,
        data: { key: pdfKey(id, kind), boletoId: id, kind, i, n, chunk: dataUrl.slice(i * PDF_CHUNK, (i + 1) * PDF_CHUNK) },
      });
    }
    return ops;
  }
  async function pdfDeleteOps(id: string, kind?: 'nf' | 'boleto'): Promise<WriteOp[]> {
    const kinds = kind ? [kind] : (['nf', 'boleto'] as const);
    const ops: WriteOp[] = [];
    for (const k of kinds) {
      const docs = await store.queryWhere('boletoPdfs', 'key', pdfKey(id, k));
      for (const d of docs) ops.push({ type: 'delete', col: 'boletoPdfs', id: `${pdfKey(id, k)}__${d.i}` });
    }
    return ops;
  }

  const notify = (n: Partial<AppNotification> & { senderName: string; targetUser: any; cliente: string }): AppNotification => {
    const full: AppNotification = {
      id: uid('notif'), message: '', createdAt: new Date().toISOString(), read: false, type: 'alert', ...n,
    } as AppNotification;
    return full;
  };

  /* ---------------------- sessão ---------------------- */
  app.use((req, _res, next) => {
    const tok = parseCookies(req.headers.cookie)[COOKIE_NAME];
    const s = readSession(opts.sessionSecret, tok);
    if (s) {
      const u = state.users.get(s.n);
      if (u && u.pinVersion === s.v) req.user = s.n;
    }
    next();
  });

  app.get('/api/status', (_req, res) => {
    res.json({ ok: true, ready: state.ready, store: store.status() });
  });

  app.use('/api', (req, res, next) => {
    if (req.path === '/status') return next();
    if (!state.ready) return res.status(503).json({ error: 'Servidor iniciando, tente novamente em instantes.' });
    next();
  });

  /* ---------------------- autenticação ---------------------- */
  app.get('/api/auth/users', (_req, res) => {
    res.json(VALID_SELLERS.map((name) => ({ name, role: state.users.get(name)?.role || 'vendedor' })));
  });
  app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
    res.json({ name: req.user, role: state.users.get(req.user)?.role, gestao: isGestao(req.user) });
  });
  app.post('/api/auth/login', wrap(async (req, res) => {
    const name = sellerOk(req.body?.name);
    const password = String(req.body?.password ?? '');
    const key = `${req.ip}|${name}`;
    if (limiter.blocked(key)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const u = name ? state.users.get(name) : undefined;
    if (!u || !verifyPin(password, u.salt, u.hash)) {
      limiter.fail(key);
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    limiter.ok(key);
    setSessionCookie(res, signSession(opts.sessionSecret, u.name, u.pinVersion), !!opts.secureCookies);
    res.json({ name: u.name, role: u.role, gestao: isGestao(u.name) });
  }));
  app.post('/api/auth/logout', (_req, res) => { clearSessionCookie(res); res.json({ success: true }); });

  const needAuth: RequestHandler = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Faça login para continuar.' });
    next();
  };
  app.use('/api', (req, res, next) => (req.path.startsWith('/auth/') || req.path === '/status' ? next() : needAuth(req, res, next)));

  app.post('/api/auth/change-password', wrap(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const u = state.users.get(req.user!)!;
    if (!verifyPin(String(currentPassword ?? ''), u.salt, u.hash)) return res.status(400).json({ error: 'Senha atual incorreta.' });
    const np = String(newPassword ?? '');
    if (np.length < 4 || np.length > 32) return res.status(400).json({ error: 'A nova senha deve ter de 4 a 32 caracteres.' });
    const { salt, hash } = hashPin(np);
    const updated: UserDoc = { ...u, salt, hash, pinVersion: u.pinVersion + 1, updatedAt: new Date().toISOString() };
    await store.set('users', u.name, updated);
    state.users.set(u.name, updated);
    setSessionCookie(res, signSession(opts.sessionSecret, u.name, updated.pinVersion), !!opts.secureCookies);
    res.json({ success: true });
  }));
  app.post('/api/auth/reset-password', wrap(async (req, res) => {
    if (req.user !== 'Pedro') return res.status(403).json({ error: 'Somente Pedro pode restaurar senhas.' });
    const name = sellerOk(req.body?.name);
    const u = name ? state.users.get(name) : undefined;
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const { salt, hash } = hashPin(DEFAULT_PINS[u.name]);
    const updated: UserDoc = { ...u, salt, hash, pinVersion: u.pinVersion + 1, updatedAt: new Date().toISOString() };
    await store.set('users', u.name, updated);
    state.users.set(u.name, updated);
    if (u.name === req.user) setSessionCookie(res, signSession(opts.sessionSecret, u.name, updated.pinVersion), !!opts.secureCookies);
    res.json({ success: true, message: `Senha de ${u.name} restaurada para a padrão.` });
  }));

  /* ---------------------- pedidos ---------------------- */
  app.get('/api/orders', (req, res) => {
    res.setHeader('X-Dataset-Timestamp', state.version);
    res.setHeader('X-Store-Status', store.status().quotaExhausted ? 'quota' : 'ok');
    res.setHeader('Cache-Control', 'private, no-cache');
    res.json(state.ordersList().filter((o) => canSeeOrder(req.user!, o)).map(orderView));
  });
  app.get('/api/dataset/info', (req, res) => {
    res.json({
      datasetTimestamp: state.version,
      ordersCount: state.ordersList().filter((o) => canSeeOrder(req.user!, o)).length,
      boletosCount: state.boletosList().filter((b) => canSeeBoleto(req.user!, b)).length,
      brandSellerMapCount: Object.keys(state.brandMap).length,
      store: store.status(),
    });
  });

  const extractor = opts.extractor !== undefined ? opts.extractor : makeGeminiExtractor();
  app.get('/api/extract-order/status', requireGestao, (_req, res) => res.json({ enabled: !!extractor }));
  app.post('/api/extract-order', requireGestao, wrap(async (req, res) => {
    if (!extractor) return res.status(503).json({ error: 'Leitura por IA não está ativada (falta GEMINI_API_KEY). Preencha manualmente.' });
    const { imageBase64 } = req.body || {};
    if (!isDataImage(imageBase64) || imageBase64.length > MAX_IMAGE_CHARS * 4) return res.status(400).json({ error: 'Imagem inválida ou muito grande.' });
    try {
      const out = await extractor(imageBase64, Object.keys(state.brandMap));
      res.json(out);
    } catch (e: any) {
      if (e instanceof ExtractError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }));

  app.post('/api/orders', requireGestao, wrap(async (req, res) => {
    const { marca, data, valor, vendedor, imageUrl } = req.body || {};
    if (!marca || !data || valor === undefined || valor === null || isNaN(Number(valor))) {
      return res.status(400).json({ error: 'Dados do pedido incompletos.' });
    }
    if (imageUrl && !isDataImage(imageUrl)) return res.status(400).json({ error: 'Foto inválida (envie JPEG ou PNG).' });
    if (imageUrl && imageUrl.length > MAX_IMAGE_CHARS) return res.status(413).json({ error: 'Foto muito grande. Reduza a imagem e tente de novo.' });
    const cleanMarca = normalizeBrandName(marca);
    const seller = sellerOk(vendedor) || resolveSellerForBrand(cleanMarca, state.brandMap, state.ordersList(), 'Ricardo').seller;
    const now = new Date().toISOString();
    const id = newOrderId();
    const order: any = {
      id, marca: cleanMarca, data, valor: Number(valor), vendedor: seller, imageUrl: imageUrl ? `/api/orders/${id}/image` : '',
      status: 'em_aberto', createdAt: now, updatedAt: now,
    };
    if (imageUrl) order.imageUpdatedAt = now;
    const ops: WriteOp[] = [{ type: 'set', col: 'orders', id, data: order }];
    if (imageUrl) ops.push(imgOp(id, imageUrl, now));
    await commit(ops);
    if (cleanMarca && state.brandMap[cleanMarca] !== seller) {
      state.brandMap[cleanMarca] = seller;
      await saveBrandMap();
    }
    res.status(201).json(orderView(order));
  }));

  const settleOne = (cur: any, opts2: { amount?: number; tipo?: string; por: string; obs?: string; lote?: boolean }) => {
    const paid = Number(cur.valorPago) || 0;
    const saldo = Math.max(0, cur.valor - paid);
    const now = new Date().toISOString();
    let amount = saldo;
    const parcial = !opts2.lote && (opts2.tipo === 'parcial' || (opts2.amount !== undefined && Number(opts2.amount) < saldo));
    if (parcial && opts2.amount !== undefined && Number(opts2.amount) > 0) amount = Math.min(Number(opts2.amount), saldo);
    const newPaid = Math.min(cur.valor, paid + amount);
    const total = newPaid >= cur.valor;
    const item = {
      id: uid('bx'), data: now, dataHora: now, valor: amount, baixadoPor: opts2.por,
      observacao: opts2.obs || (opts2.lote ? 'Baixa em lote realizada.' : parcial ? 'Baixa parcial' : 'Baixa total'),
      tipo: (total ? 'total' : 'parcial') as 'total' | 'parcial',
    };
    const updated: any = {
      ...cur, valorPago: newPaid, historicoBaixas: [...(cur.historicoBaixas || []), item],
      status: total ? 'baixado' : 'em_aberto',
      dataBaixa: total ? now : cur.dataBaixa, baixadoPor: total ? opts2.por : cur.baixadoPor,
      observacaoBaixa: opts2.obs || cur.observacaoBaixa || (parcial ? 'Baixa parcial realizada.' : 'Baixa realizada.'),
      updatedAt: now,
    };
    if (total) { updated.imageUrl = ''; delete updated.imageUpdatedAt; }
    cleanUndefined(updated);
    const ledger = {
      id: uid(opts2.lote ? 'bx-lote' : 'bx-rec'), orderId: cur.id, tipo: opts2.lote ? 'lote' : total ? 'total' : 'parcial',
      marca: cur.marca, vendedor: cur.vendedor, valorOriginal: cur.valor, valorBaixa: amount,
      valorRestante: Math.max(0, cur.valor - newPaid), dataHora: now, baixadoPor: opts2.por,
      observacao: item.observacao,
    };
    return { updated, ledger, total };
  };

  app.post('/api/orders/baixa-lote', requireGestao, wrap(async (req, res) => {
    const { orderIds, observacaoBaixa } = req.body || {};
    if (!Array.isArray(orderIds) || !orderIds.length) return res.status(400).json({ error: 'Nenhum pedido selecionado para baixa.' });
    const ops: WriteOp[] = [];
    const updatedOrders: Order[] = [];
    for (const id of orderIds) {
      const cur = state.orders.get(id);
      if (!cur || cur.status === 'baixado') continue;
      const r = settleOne(cur, { por: req.user!, obs: observacaoBaixa, lote: true });
      ops.push({ type: 'set', col: 'orders', id, data: r.updated }, { type: 'set', col: 'ledger', id: r.ledger.id, data: r.ledger }, imgDelOp(id));
      updatedOrders.push(r.updated);
    }
    await commit(ops);
    res.json({
      message: `${updatedOrders.length} pedido(s) baixado(s) com sucesso.`,
      updatedOrders: updatedOrders.map(orderView),
      allOrders: state.ordersList().map(orderView),
    });
  }));

  app.post('/api/orders/archive', requireGestao, wrap(async (req, res) => {
    const { ids, confirm } = req.body || {};
    if (confirm !== true) return res.status(400).json({ error: 'Confirmação explícita necessária.' });
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Nenhum pedido informado.' });
    const limit = Date.now() - ARCHIVE_DAYS * 86400000;
    const ops: WriteOp[] = [];
    for (const id of ids) {
      const o = state.orders.get(id);
      if (!o || o.status !== 'baixado' || !o.dataBaixa || new Date(o.dataBaixa).getTime() > limit) continue;
      ops.push({ type: 'delete', col: 'orders', id }, imgDelOp(id));
    }
    const archived = ops.filter((o) => o.col === 'orders').length;
    if (archived) await commit(ops);
    res.json({ success: true, archived, ignored: ids.length - archived });
  }));

  app.post('/api/orders/:id/baixa', requireGestao, wrap(async (req, res) => {
    const cur = state.orders.get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (cur.status === 'baixado') return res.status(409).json({ error: 'Pedido já está baixado.' });
    const { observacaoBaixa, valorBaixa, tipo } = req.body || {};
    const r = settleOne(cur, { amount: valorBaixa, tipo, por: req.user!, obs: observacaoBaixa });
    const ops: WriteOp[] = [{ type: 'set', col: 'orders', id: cur.id, data: r.updated }, { type: 'set', col: 'ledger', id: r.ledger.id, data: r.ledger }];
    if (r.total) ops.push(imgDelOp(cur.id));
    await commit(ops);
    res.json(orderView(r.updated));
  }));

  app.post('/api/orders/:id/estorno', requireGestao, wrap(async (req, res) => {
    const cur: any = state.orders.get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const { motivo } = req.body || {};
    const now = new Date().toISOString();
    const valorEst = cur.valorPago || cur.valor;
    const log = {
      id: uid('est'), data: now, dataHora: now, valor: -valorEst, baixadoPor: req.user,
      observacao: `[ESTORNO] ${motivo || 'Baixa desfeita/reaberta'}`, tipo: 'parcial' as const,
    };
    const updated: any = {
      ...cur, status: 'em_aberto', valorPago: 0, historicoBaixas: [...(cur.historicoBaixas || []), log],
      observacaoBaixa: `Estornado por ${req.user} em ${new Date().toLocaleDateString('pt-BR')}: ${motivo || 'Reaberto'}`,
      updatedAt: now,
    };
    delete updated.dataBaixa; delete updated.baixadoPor;
    const ledger = {
      id: uid('est-rec'), orderId: cur.id, tipo: 'estorno', marca: cur.marca, vendedor: cur.vendedor, valorOriginal: cur.valor,
      valorBaixa: -valorEst, valorRestante: cur.valor, dataHora: now, baixadoPor: req.user, observacao: motivo || 'Estorno de baixa realizado',
    };
    await commit([{ type: 'set', col: 'orders', id: cur.id, data: updated }, { type: 'set', col: 'ledger', id: ledger.id, data: ledger }]);
    res.json({ success: true, message: `Pedido #${cur.id} reaberto e estornado com sucesso.`, updatedOrder: orderView(updated) });
  }));

  app.get('/api/baixas/ledger', requireGestao, (_req, res) => {
    const ledger = [...state.ledger.values()].sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)));
    res.json({ success: true, count: ledger.length, ledger });
  });

  app.put('/api/orders/:id/vendedor', requireGestao, wrap(async (req, res) => {
    const cur = state.orders.get(req.params.id);
    const v = sellerOk(req.body?.vendedor);
    if (!cur) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (!v) return res.status(400).json({ error: 'Vendedor inválido.' });
    const updated = { ...cur, vendedor: v as any, updatedAt: new Date().toISOString() };
    await commit([{ type: 'set', col: 'orders', id: cur.id, data: updated }]);
    const cm = normalizeBrandName(cur.marca);
    if (cm) { state.brandMap[cm] = v; await saveBrandMap(); }
    res.json(orderView(updated));
  }));

  app.get('/api/orders/:id/image', wrap(async (req, res) => {
    const o = state.orders.get(req.params.id);
    if (!o || !canSeeOrder(req.user!, o)) return res.status(404).send('Imagem não encontrada');
    const doc = await store.get('orderImages', o.id);
    const m = doc?.data && /^data:(image\/[a-z+]+);base64,(.*)$/is.exec(doc.data);
    if (!m) return res.status(404).send('Imagem não encontrada');
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(m[2], 'base64'));
  }));

  app.put('/api/orders/:id/image', requireGestao, wrap(async (req, res) => {
    const cur: any = state.orders.get(req.params.id);
    const { imageUrl } = req.body || {};
    if (!cur) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (cur.status === 'baixado') return res.status(409).json({ error: 'Pedido baixado não pode receber foto.' });
    if (!isDataImage(imageUrl)) return res.status(400).json({ error: 'Nova imagem inválida (JPEG ou PNG).' });
    if (imageUrl.length > MAX_IMAGE_CHARS) return res.status(413).json({ error: 'Foto muito grande. Reduza a imagem e tente de novo.' });
    const now = new Date().toISOString();
    const updated = { ...cur, imageUrl: `/api/orders/${cur.id}/image`, imageUpdatedAt: now, updatedAt: now };
    await commit([imgOp(cur.id, imageUrl, now), { type: 'set', col: 'orders', id: cur.id, data: updated }]);
    res.json(orderView(updated));
  }));

  app.put('/api/orders/:id', requireGestao, wrap(async (req, res) => {
    const cur: any = state.orders.get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const { marca, data, valor, vendedor, status, observacaoBaixa } = req.body || {};
    const now = new Date().toISOString();
    const cleanMarca = marca ? normalizeBrandName(marca) : cur.marca;
    const updated: any = {
      ...cur, marca: cleanMarca, data: data || cur.data,
      valor: valor !== undefined && valor !== null && valor !== '' ? Number(valor) : cur.valor,
      vendedor: sellerOk(vendedor) || cur.vendedor, status: status || cur.status, updatedAt: now,
    };
    const ops: WriteOp[] = [];
    if (status === 'baixado' && cur.status !== 'baixado') {
      updated.dataBaixa = now; updated.baixadoPor = req.user; updated.observacaoBaixa = observacaoBaixa || 'Baixado via edição';
      updated.valorPago = updated.valor; updated.imageUrl = ''; delete updated.imageUpdatedAt;
      ops.push(imgDelOp(cur.id));
    } else if (status === 'em_aberto' && cur.status === 'baixado') {
      delete updated.dataBaixa; delete updated.baixadoPor; delete updated.observacaoBaixa; updated.valorPago = 0;
    } else if (observacaoBaixa !== undefined) updated.observacaoBaixa = observacaoBaixa;
    cleanUndefined(updated);
    ops.unshift({ type: 'set', col: 'orders', id: cur.id, data: updated });
    await commit(ops);
    if (cleanMarca && sellerOk(vendedor)) { state.brandMap[cleanMarca] = sellerOk(vendedor)!; await saveBrandMap(); }
    res.json(orderView(updated));
  }));

  app.delete('/api/orders/:id', requireGestao, wrap(async (req, res) => {
    const cur = state.orders.get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Pedido não encontrado.' });
    await commit([{ type: 'delete', col: 'orders', id: cur.id }, imgDelOp(cur.id)]);
    res.json({ success: true, removedOrder: orderView(cur) });
  }));

  /* ---------------------- marcas × vendedores ---------------------- */
  app.get('/api/brand-sellers', (_req, res) => res.json(state.brandMap));
  app.post('/api/brand-sellers', requireGestao, wrap(async (req, res) => {
    const { marca } = req.body || {};
    const v = sellerOk(req.body?.vendedor);
    if (!marca || !v) return res.status(400).json({ error: 'Marca e Vendedor são obrigatórios.' });
    const cm = normalizeBrandName(marca);
    const now = new Date().toISOString();
    const ops: WriteOp[] = [];
    for (const o of state.ordersList()) {
      if (normalizeBrandName(o.marca) === cm && o.status === 'em_aberto') ops.push({ type: 'set', col: 'orders', id: o.id, data: { ...o, vendedor: v as any, updatedAt: now } });
    }
    for (const b of state.boletosList()) {
      if (normalizeBrandName(b.marca) === cm && b.situacao === 'EM ABERTO') ops.push({ type: 'set', col: 'boletos', id: b.id, data: { ...b, vendedor: v as any, updatedAt: now } });
    }
    if (ops.length) await commit(ops);
    state.brandMap[cm] = v;
    await saveBrandMap();
    res.json({ success: true, cleanMarca: cm, vendedor: v, brandSellerMap: state.brandMap });
  }));
  app.delete('/api/brand-sellers/:marca', requireGestao, wrap(async (req, res) => {
    const cm = normalizeBrandName(req.params.marca);
    if (state.brandMap[cm]) { delete state.brandMap[cm]; await saveBrandMap(); }
    res.json({ success: true, cleanMarca: cm, brandSellerMap: state.brandMap });
  }));

  /* ---------------------- notificações ---------------------- */
  const myNotifs = (user: string) =>
    [...state.notifications.values()]
      .filter((n) => n.targetUser === user || n.targetUser === 'Todos')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 200);
  app.get('/api/notifications', (req, res) => res.json(myNotifs(req.user!)));
  app.post('/api/notifications', wrap(async (req, res) => {
    const { senderName, targetUser, cliente, valorPendente, message, type, errorDetails, actionType, referenceId } = req.body || {};
    if (!targetUser || !cliente) return res.status(400).json({ error: 'Campos obrigatórios ausentes (targetUser, cliente).' });
    if (type !== 'sync_error' && !isGestao(req.user)) return res.status(403).json({ error: 'Sem permissão para enviar alertas.' });
    const n = notify({
      senderName: req.user!, targetUser, cliente, valorPendente: valorPendente || 0,
      message: message || `Atenção: Cobrança do cliente ${cliente}. Por favor, verificar o pagamento pendente.`,
      type: type || 'alert', errorDetails, actionType, referenceId,
    });
    void senderName;
    await commit([{ type: 'set', col: 'notifications', id: n.id, data: cleanUndefined({ ...n }) }]);
    res.status(201).json(n);
  }));
  app.post('/api/sync/report-error', wrap(async (req, res) => {
    const { record, message } = req.body || {};
    if (record || message) {
      const n = notify({
        senderName: 'Sistema', targetUser: 'Pedro', cliente: record?.cliente || 'Sistema', valorPendente: record?.valor || 0,
        message: message || `Alerta: ${record?.errorMessage || 'Falha na operação'}`, type: 'sync_error',
        actionType: record?.actionType || 'sync', referenceId: record?.referenceId, errorDetails: record?.errorMessage,
      });
      await commit([{ type: 'set', col: 'notifications', id: n.id, data: cleanUndefined({ ...n }) }]);
    }
    res.json({ success: true });
  }));
  app.put('/api/notifications/:id/read', wrap(async (req, res) => {
    const n = state.notifications.get(req.params.id);
    if (n && (n.targetUser === req.user || n.targetUser === 'Todos')) {
      const upd = { ...n, read: true };
      await commit([{ type: 'set', col: 'notifications', id: n.id, data: upd }]);
      return res.json({ success: true, notif: upd });
    }
    res.json({ success: true });
  }));
  app.post('/api/notifications/read-all', wrap(async (req, res) => {
    const ops: WriteOp[] = [];
    for (const n of myNotifs(req.user!)) if (!n.read) ops.push({ type: 'set', col: 'notifications', id: n.id, data: { ...n, read: true } });
    if (ops.length) await commit(ops);
    res.json({ success: true, notifications: myNotifs(req.user!) });
  }));

  /* ---------------------- boletos ---------------------- */
  app.get('/api/boletos', (req, res) => {
    res.setHeader('Cache-Control', 'private, no-cache');
    res.json(state.boletosList().filter((b) => canSeeBoleto(req.user!, b)).map(boletoView));
  });

  async function buildBoleto(item: any, id: string, indexNum: number, por: string) {
    const cm = normalizeBrandName(item.marca);
    const vend = sellerOk(item.vendedor) || sellerOk(state.brandMap[cm]) || 'Ricardo';
    const now = new Date().toISOString();
    const ops: WriteOp[] = [];
    const b: any = {
      id, indexNum, marca: cm, valor: Number(item.valor) || 0, data: String(item.data).trim(),
      situacao: 'EM ABERTO', vendedor: vend,
      numeroNF: item.numeroNF?.trim() || undefined, numeroBoleto: item.numeroBoleto?.trim() || undefined,
      observacao: item.observacao?.trim() || undefined, createdAt: now, updatedAt: now, cadastradoPor: por,
    };
    for (const [kind, urlField, nameField, def] of [
      ['nf', 'pdfNFUrl', 'pdfNFName', 'Nota_Fiscal.pdf'], ['boleto', 'pdfBoletoUrl', 'pdfBoletoName', 'Boleto.pdf'],
    ] as const) {
      const url = item[urlField];
      if (!url) continue;
      if (!isDataPdf(url)) throw Object.assign(new Error('Arquivo PDF inválido.'), { status: 400 });
      if (url.length > MAX_PDF_CHARS) throw Object.assign(new Error('PDF muito grande (máx. 3 MB).'), { status: 413 });
      ops.push(...pdfOps(id, kind, url));
      b[urlField] = `/api/boletos/${id}/pdf/${kind}`;
      b[nameField] = item[nameField] || def;
    }
    cleanUndefined(b);
    ops.push({ type: 'set', col: 'boletos', id, data: b });
    return { b, ops, cm, vend };
  }
  const nextBoletoIndex = () => state.boletosList().reduce((m, b) => Math.max(m, b.indexNum || 0), 0) + 1;

  app.post('/api/boletos/batch', requireGestao, wrap(async (req, res) => {
    const { boletos } = req.body || {};
    if (!Array.isArray(boletos) || !boletos.length) return res.status(400).json({ error: 'Nenhum boleto fornecido.' });
    const created: OverdueBoleto[] = [];
    const ops: WriteOp[] = [];
    let idx = nextBoletoIndex();
    for (const item of boletos) {
      if (!item.marca || item.valor === undefined || item.valor === null || !item.data) continue;
      const r = await buildBoleto(item, `bol-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${created.length}`, idx++, req.user!);
      ops.push(...r.ops); created.push(r.b); state.brandMap[r.cm] = r.vend;
    }
    if (!created.length) return res.status(400).json({ error: 'Nenhum boleto válido (marca, valor e data são obrigatórios).' });
    await commit(ops);
    await saveBrandMap();
    res.status(201).json({ message: `${created.length} boleto(s) cadastrado(s) com sucesso.`, boletos: created.map(boletoView) });
  }));

  app.post('/api/boletos', requireGestao, wrap(async (req, res) => {
    const item = req.body || {};
    if (!item.marca || item.valor === undefined || item.valor === null || !item.data) {
      return res.status(400).json({ error: 'Marca, Valor e Data são obrigatórios.' });
    }
    const r = await buildBoleto(item, `bol-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, nextBoletoIndex(), req.user!);
    await commit(r.ops);
    state.brandMap[r.cm] = r.vend;
    await saveBrandMap();
    res.status(201).json(boletoView(r.b));
  }));

  app.put('/api/boletos/:id', requireGestao, wrap(async (req, res) => {
    const cur: any = state.boletos.get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Boleto não encontrado.' });
    const b = req.body || {};
    const id = cur.id;
    const ops: WriteOp[] = [];
    const upd: any = { ...cur };
    for (const [kind, urlField, nameField, def] of [
      ['nf', 'pdfNFUrl', 'pdfNFName', 'Nota_Fiscal.pdf'], ['boleto', 'pdfBoletoUrl', 'pdfBoletoName', 'Boleto.pdf'],
    ] as const) {
      const url = b[urlField];
      if (url === undefined) continue;
      if (url === null || url === '') {
        ops.push(...(await pdfDeleteOps(id, kind)));
        delete upd[urlField]; delete upd[nameField];
      } else if (isDataPdf(url)) {
        if (url.length > MAX_PDF_CHARS) return res.status(413).json({ error: 'PDF muito grande (máx. 3 MB).' });
        ops.push(...(await pdfDeleteOps(id, kind)), ...pdfOps(id, kind, url));
        upd[urlField] = `/api/boletos/${id}/pdf/${kind}`;
        upd[nameField] = b[nameField] || cur[nameField] || def;
      } else if (b[nameField] !== undefined) upd[nameField] = b[nameField];
    }
    if (b.marca) upd.marca = normalizeBrandName(b.marca);
    if (b.valor !== undefined && b.valor !== null) upd.valor = Number(b.valor);
    if (b.data) upd.data = b.data;
    if (sellerOk(b.vendedor)) upd.vendedor = sellerOk(b.vendedor);
    if (b.situacao) upd.situacao = b.situacao;
    for (const f of ['numeroNF', 'numeroBoleto', 'observacao']) if (b[f] !== undefined) upd[f] = b[f];
    upd.updatedAt = new Date().toISOString();
    cleanUndefined(upd);
    ops.push({ type: 'set', col: 'boletos', id, data: upd });
    await commit(ops);
    if (b.vendedor && sellerOk(b.vendedor)) { state.brandMap[normalizeBrandName(upd.marca)] = sellerOk(b.vendedor)!; await saveBrandMap(); }
    res.json(boletoView(upd));
  }));

  app.put('/api/boletos/:id/baixa', requireGestao, wrap(async (req, res) => {
    const cur: any = state.boletos.get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Boleto não encontrado.' });
    const now = new Date().toISOString();
    const upd: any = {
      ...cur, situacao: 'PAGO', dataBaixa: now, baixadoPor: req.user, observacaoBaixa: req.body?.observacaoBaixa || 'Baixa realizada', updatedAt: now,
    };
    delete upd.pdfNFUrl; delete upd.pdfNFName; delete upd.pdfBoletoUrl; delete upd.pdfBoletoName;
    const ops = [...(await pdfDeleteOps(cur.id)), { type: 'set', col: 'boletos', id: cur.id, data: upd } as WriteOp];
    await commit(ops);
    res.json(boletoView(upd));
  }));

  app.delete('/api/boletos/:id', requireGestao, wrap(async (req, res) => {
    const cur = state.boletos.get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'Boleto não encontrado.' });
    await commit([...(await pdfDeleteOps(cur.id)), { type: 'delete', col: 'boletos', id: cur.id }]);
    res.json({ success: true, message: 'Boleto removido com sucesso.' });
  }));

  app.get('/api/boletos/:id/pdf/:kind', wrap(async (req, res) => {
    const kind = req.params.kind === 'nf' ? 'nf' : req.params.kind === 'boleto' ? 'boleto' : null;
    const b = state.boletos.get(req.params.id);
    if (!kind || !b || !canSeeBoleto(req.user!, b)) return res.status(404).send('PDF não encontrado');
    const parts = (await store.queryWhere('boletoPdfs', 'key', pdfKey(b.id, kind))).sort((x, y) => x.i - y.i);
    if (!parts.length) return res.status(404).send('PDF não encontrado');
    const full = parts.map((p) => p.chunk).join('');
    const m = /^data:application\/pdf;base64,(.*)$/is.exec(full);
    if (!m) return res.status(404).send('PDF não encontrado');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(Buffer.from(m[1], 'base64'));
  }));

  /* ---------------------- backup ---------------------- */
  const stripOrder = (o: any) => {
    const c = { ...o };
    delete c.imageUrl; delete c.imageUpdatedAt;
    return c;
  };
  const stripBoleto = (b: any) => {
    const c = { ...b };
    delete c.pdfNFUrl; delete c.pdfBoletoUrl; delete c.pdfNFName; delete c.pdfBoletoName; delete c.diasEmAtraso;
    return c;
  };
  app.get('/api/backup/export', requireGestao, (req, res) => {
    const tipo = req.query.tipo === 'abertos' ? 'abertos' : 'completo';
    const allO = state.ordersList(), allB = state.boletosList();
    const orders = (tipo === 'abertos' ? allO.filter((o) => o.status === 'em_aberto') : allO).map(stripOrder);
    const boletos = (tipo === 'abertos' ? allB.filter((b) => b.situacao === 'EM ABERTO') : allB).map(stripBoleto);
    const today = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=Backup_${tipo === 'abertos' ? 'Em_Aberto' : 'Completo'}_VV_${today}.json`);
    res.json({
      app: 'Gestao VV', version: '2.0', tipo, exportedAt: new Date().toISOString(), exportedBy: req.user,
      totalOrders: allO.length, openOrders: allO.filter((o) => o.status === 'em_aberto').length,
      settledOrders: allO.filter((o) => o.status === 'baixado').length,
      totalBoletos: allB.length, openBoletos: allB.filter((b) => b.situacao === 'EM ABERTO').length,
      orders, boletos, brandSellerMap: state.brandMap,
    });
  });

  const ts = (o: any) => new Date(o?.updatedAt || o?.createdAt || 0).getTime() || 0;
  function mergeOrder(ex: any | undefined, inc: any) {
    if (!ex) {
      const n = { ...inc };
      if (n.status === 'baixado' && !n.dataBaixa) n.dataBaixa = n.updatedAt || new Date().toISOString();
      return { merged: n, kind: 'novo' as const };
    }
    const newer = ts(inc) > ts(ex) ? inc : ex;
    const older = newer === inc ? ex : inc;
    const merged: any = { ...older, ...newer };
    if (ex.valorPago !== undefined || inc.valorPago !== undefined) merged.valorPago = Math.max(Number(ex.valorPago) || 0, Number(inc.valorPago) || 0);
    const hist = new Map<string, any>();
    for (const h of [...(ex.historicoBaixas || []), ...(inc.historicoBaixas || [])]) if (h?.id) hist.set(h.id, h);
    if (hist.size) merged.historicoBaixas = [...hist.values()].sort((a, b) => String(a.data).localeCompare(String(b.data)));
    if (ex.status === 'baixado' || inc.status === 'baixado') {
      merged.status = 'baixado';
      const src = ex.status === 'baixado' ? ex : inc;
      merged.dataBaixa = src.dataBaixa || inc.dataBaixa || ex.dataBaixa || new Date().toISOString();
      merged.baixadoPor = src.baixadoPor || merged.baixadoPor;
      merged.valorPago = Math.max(merged.valorPago, Number(merged.valor) || 0);
    }
    const same = JSON.stringify(stripOrder(ex)) === JSON.stringify(stripOrder(merged));
    return { merged, kind: same ? ('igual' as const) : ('atualizado' as const) };
  }

  app.post('/api/backup/import', requireGestao, wrap(async (req, res) => {
    const body = req.body;
    const incomingOrders: any[] = Array.isArray(body) ? body : Array.isArray(body?.orders) ? body.orders : null as any;
    if (!incomingOrders) return res.status(400).json({ error: 'Arquivo inválido: não há lista "orders".' });
    const incomingBoletos: any[] = Array.isArray(body?.boletos) ? body.boletos : [];
    const dryRun = body?.dryRun === true;
    const sum = {
      pedidosNovos: 0, pedidosAtualizados: 0, pedidosIguais: 0, pedidosBaixadosPreservados: 0,
      boletosNovos: 0, boletosAtualizados: 0, boletosIguais: 0, fotosImportadas: 0, fotosIgnoradas: 0, erros: [] as string[],
    };
    const ops: WriteOp[] = [];
    const tmpOrders = new Map<string, any>();
    for (const raw of incomingOrders) {
      if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.marca !== 'string' || !raw.marca || isNaN(Number(raw.valor)) || !raw.data) {
        if (sum.erros.length < 20) sum.erros.push(`Pedido inválido: ${JSON.stringify(raw)?.slice(0, 80)}`);
        continue;
      }
      const inc = { ...raw, valor: Number(raw.valor), marca: normalizeBrandName(raw.marca) };
      if (!sellerOk(inc.vendedor)) inc.vendedor = resolveSellerForBrand(inc.marca, state.brandMap, state.ordersList(), 'Ricardo').seller;
      else inc.vendedor = sellerOk(inc.vendedor);
      const photo = inc.imageUrl;
      delete inc.imageUrl;
      if (!inc.status) inc.status = 'em_aberto';
      const ex: any = state.orders.get(inc.id);
      const { merged, kind } = mergeOrder(ex, inc);
      if (kind === 'novo') sum.pedidosNovos++; else if (kind === 'atualizado') sum.pedidosAtualizados++; else sum.pedidosIguais++;
      if (ex?.status === 'baixado' && inc.status !== 'baixado') sum.pedidosBaixadosPreservados++;
      const hadImage = !!ex?.imageUrl;
      merged.imageUrl = hadImage && merged.status !== 'baixado' ? ex.imageUrl : '';
      if (hadImage && merged.status !== 'baixado' && ex.imageUpdatedAt) merged.imageUpdatedAt = ex.imageUpdatedAt;
      if (merged.status === 'baixado') { delete merged.imageUpdatedAt; if (hadImage) ops.push(imgDelOp(merged.id)); }
      if (isDataImage(photo)) {
        if (merged.status === 'baixado' || hadImage) sum.fotosIgnoradas++;
        else if (photo.length > MAX_IMAGE_CHARS) sum.fotosIgnoradas++;
        else {
          const now = new Date().toISOString();
          merged.imageUrl = `/api/orders/${merged.id}/image`; merged.imageUpdatedAt = now;
          sum.fotosImportadas++;
          if (!dryRun) ops.push(imgOp(merged.id, photo, now));
        }
      }
      cleanUndefined(merged);
      if (kind !== 'igual' || merged.imageUrl !== (ex?.imageUrl || '')) ops.push({ type: 'set', col: 'orders', id: merged.id, data: merged });
      tmpOrders.set(merged.id, merged);
    }
    for (const raw of incomingBoletos) {
      if (!raw || typeof raw.id !== 'string' || !raw.marca || isNaN(Number(raw.valor)) || !raw.data) {
        if (sum.erros.length < 20) sum.erros.push(`Boleto inválido: ${JSON.stringify(raw)?.slice(0, 80)}`);
        continue;
      }
      const inc: any = stripBoleto({ ...raw, valor: Number(raw.valor), marca: normalizeBrandName(raw.marca) });
      if (!sellerOk(inc.vendedor)) inc.vendedor = resolveSellerForBrand(inc.marca, state.brandMap, state.ordersList(), 'Ricardo').seller;
      const ex: any = state.boletos.get(inc.id);
      if (!ex) { sum.boletosNovos++; ops.push({ type: 'set', col: 'boletos', id: inc.id, data: cleanUndefined(inc) }); continue; }
      const newer = ts(inc) > ts(ex) ? inc : ex;
      const merged: any = { ...(newer === inc ? ex : inc), ...newer };
      for (const k of ['pdfNFUrl', 'pdfNFName', 'pdfBoletoUrl', 'pdfBoletoName']) if (ex[k]) merged[k] = ex[k]; else delete merged[k];
      if (ex.situacao === 'PAGO' || inc.situacao === 'PAGO') {
        merged.situacao = 'PAGO';
        merged.dataBaixa = ex.dataBaixa || inc.dataBaixa || new Date().toISOString();
        if (ex.situacao !== 'PAGO') {
          delete merged.pdfNFUrl; delete merged.pdfNFName; delete merged.pdfBoletoUrl; delete merged.pdfBoletoName;
          if (!dryRun) ops.push(...(await pdfDeleteOps(ex.id)));
        }
      }
      cleanUndefined(merged);
      if (JSON.stringify(merged) === JSON.stringify(ex)) { sum.boletosIguais++; continue; }
      sum.boletosAtualizados++;
      ops.push({ type: 'set', col: 'boletos', id: merged.id, data: merged });
    }
    if (dryRun) return res.json({ success: true, dryRun: true, resumo: sum });
    if (ops.length) await commit(ops);
    if (body?.brandSellerMap && typeof body.brandSellerMap === 'object') {
      for (const [k, v] of Object.entries(body.brandSellerMap)) {
        const ck = normalizeBrandName(k);
        if (ck && sellerOk(v) && !state.brandMap[ck]) state.brandMap[ck] = sellerOk(v)!;
      }
    }
    for (const o of tmpOrders.values()) {
      const ck = normalizeBrandName(o.marca);
      if (ck && !state.brandMap[ck] && sellerOk(o.vendedor)) state.brandMap[ck] = o.vendedor;
    }
    await saveBrandMap();
    res.json({ success: true, resumo: sum });
  }));

  /* ---------------------- estáticos e erros ---------------------- */
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  const dist = opts.staticDir;
  if (dist && fs.existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof StoreQuotaError || err?.name === 'StoreQuotaError') {
      return res.status(503).json({ error: 'Nuvem temporariamente indisponível (limite de uso do Firestore). Aguarde e tente de novo.', quota: true });
    }
    if (err?.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo grande demais.' });
    console.error('[ERRO]', err?.message || err);
    res.status(503).json({ error: 'Falha ao falar com o banco de dados. Tente novamente.' });
  });

  return { app, state };
}
