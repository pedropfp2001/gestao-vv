import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { MemoryStore } from '../server/store';

let server: Server;
let base = '';
let store: MemoryStore;
let stateRef: any;

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%fake test pdf\n%%EOF').toString('base64');

class Client {
  cookie = '';
  async req(method: string, url: string, body?: any) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b?: any) => this.req('POST', u, b ?? {});
  put = (u: string, b?: any) => this.req('PUT', u, b ?? {});
  del = (u: string) => this.req('DELETE', u);
  async login(name: string, password: string) {
    return this.post('/api/auth/login', { name, password });
  }
}
const as = async (name: string, pw: string) => { const c = new Client(); const r = await c.login(name, pw); assert.equal(r.status, 200, `login ${name}`); return c; };

before(async () => {
  store = new MemoryStore();
  const { app, state } = createApp(store, { sessionSecret: 'segredo-de-teste' });
  stateRef = state;
  await state.load();
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => server.close());

test('login: senha errada recusa, certa entra; rotas exigem sessão', async () => {
  const anon = new Client();
  assert.equal((await anon.get('/api/orders')).status, 401);
  assert.equal((await anon.login('Pedro', '0000')).status, 401);
  assert.equal((await anon.login('Pedro', '3220')).status, 200);
  assert.equal((await anon.get('/api/auth/me')).data.name, 'Pedro');
  const ric = new Client();
  assert.equal((await ric.login('Ricardo', '1234')).status, 200);
  assert.equal((await ric.login('Fulano', '1234')).status, 401);
});

test('Ricardo e Wanderley não gravam nada (só consultam)', async () => {
  const ric = await as('Ricardo', '1234');
  assert.equal((await ric.post('/api/orders', { marca: 'X', data: '2026-10-01', valor: 10 })).status, 403);
  assert.equal((await ric.post('/api/orders/PED-1/baixa')).status, 403);
  assert.equal((await ric.post('/api/orders/baixa-lote', { orderIds: ['a'] })).status, 403);
  assert.equal((await ric.post('/api/boletos', { marca: 'X', valor: 1, data: '2026-10-01' })).status, 403);
  assert.equal((await ric.get('/api/backup/export')).status, 403);
  assert.equal((await ric.post('/api/backup/import', { orders: [] })).status, 403);
  assert.equal((await ric.get('/api/baixas/ledger')).status, 403);
  assert.equal((await ric.post('/api/brand-sellers', { marca: 'X', vendedor: 'Ricardo' })).status, 403);
});

test('pedido com foto: Igor vê, vendedor dono vê, outro vendedor não vê (nem pela URL)', async () => {
  const pedro = await as('Pedro', '3220');
  const igor = await as('Igor', '3220');
  const ric = await as('Ricardo', '1234');
  const wan = await as('Wanderley', '1234');
  const r = await pedro.post('/api/orders', { marca: 'vv - Teste Foto', data: '2026-10-10', valor: 100, vendedor: 'Ricardo', imageUrl: PNG });
  assert.equal(r.status, 201);
  const id = r.data.id;
  assert.equal(r.data.marca, 'TESTE FOTO');
  // outro usuário vê o pedido imediatamente, sem o autor conectado
  assert.ok((await igor.get('/api/orders')).data.some((o: any) => o.id === id));
  assert.equal((await igor.get(`/api/orders/${id}/image`)).status, 200);
  const imgRic = await ric.get(`/api/orders/${id}/image`);
  assert.equal(imgRic.status, 200);
  assert.equal(imgRic.headers.get('content-type'), 'image/png');
  assert.equal((await wan.get(`/api/orders/${id}/image`)).status, 404);
  assert.ok(!(await wan.get('/api/orders')).data.some((o: any) => o.id === id));
  assert.ok((await ric.get('/api/orders')).data.some((o: any) => o.id === id));
});

test('baixa total apaga a foto, nunca é recriada e vendedor não dá baixa', async () => {
  const pedro = await as('Pedro', '3220');
  const id = (await pedro.post('/api/orders', { marca: 'BAIXA1', data: '2026-10-11', valor: 200, vendedor: 'Ricardo', imageUrl: PNG })).data.id;
  assert.ok(await store.get('orderImages', id));
  const b = await pedro.post(`/api/orders/${id}/baixa`, { observacaoBaixa: 'pix' });
  assert.equal(b.status, 200);
  assert.equal(b.data.status, 'baixado');
  assert.ok(b.data.dataBaixa);
  assert.equal(b.data.baixadoPor, 'Pedro');
  assert.equal(b.data.imageUrl, '');
  assert.equal(await store.get('orderImages', id), null);
  assert.equal((await pedro.put(`/api/orders/${id}/image`, { imageUrl: PNG })).status, 409);
  assert.equal(await store.get('orderImages', id), null);
  assert.equal((await pedro.post(`/api/orders/${id}/baixa`)).status, 409);
});

test('baixa parcial mantém a foto e acumula; lote baixa vários e apaga fotos; ledger registra', async () => {
  const pedro = await as('Pedro', '3220');
  const a = (await pedro.post('/api/orders', { marca: 'PARC', data: '2026-10-11', valor: 300, vendedor: 'Wanderley', imageUrl: PNG })).data.id;
  const p = await pedro.post(`/api/orders/${a}/baixa`, { valorBaixa: 100, tipo: 'parcial' });
  assert.equal(p.data.status, 'em_aberto');
  assert.equal(p.data.valorPago, 100);
  assert.ok(await store.get('orderImages', a));
  const b1 = (await pedro.post('/api/orders', { marca: 'LOTE', data: '2026-10-11', valor: 50, vendedor: 'Ricardo', imageUrl: PNG })).data.id;
  const b2 = (await pedro.post('/api/orders', { marca: 'LOTE', data: '2026-10-12', valor: 70, vendedor: 'Ricardo', imageUrl: PNG })).data.id;
  const l = await pedro.post('/api/orders/baixa-lote', { orderIds: [a, b1, b2], observacaoBaixa: 'lote' });
  assert.equal(l.data.updatedOrders.length, 3);
  for (const id of [a, b1, b2]) assert.equal(await store.get('orderImages', id), null);
  const total = l.data.updatedOrders.find((o: any) => o.id === a);
  assert.equal(total.valorPago, 300);
  assert.equal(total.historicoBaixas.length, 2);
  const led = (await pedro.get('/api/baixas/ledger')).data;
  assert.ok(led.count >= 4);
});

test('estorno reabre sem foto e registra no histórico', async () => {
  const pedro = await as('Pedro', '3220');
  const id = (await pedro.post('/api/orders', { marca: 'EST', data: '2026-10-11', valor: 80, vendedor: 'Ricardo' })).data.id;
  await pedro.post(`/api/orders/${id}/baixa`);
  const e = await pedro.post(`/api/orders/${id}/estorno`, { motivo: 'erro' });
  assert.equal(e.data.updatedOrder.status, 'em_aberto');
  assert.equal(e.data.updatedOrder.valorPago, 0);
  assert.equal(e.data.updatedOrder.imageUrl, '');
  assert.equal(e.data.updatedOrder.historicoBaixas.length, 2);
});

test('trocar foto: nova versão na URL; foto inválida/grande recusada', async () => {
  const pedro = await as('Pedro', '3220');
  const id = (await pedro.post('/api/orders', { marca: 'TROCA', data: '2026-10-11', valor: 80, vendedor: 'Ricardo' })).data.id;
  assert.equal((await pedro.put(`/api/orders/${id}/image`, { imageUrl: 'lixo' })).status, 400);
  assert.equal((await pedro.put(`/api/orders/${id}/image`, { imageUrl: 'data:image/jpeg;base64,' + 'A'.repeat(500000) })).status, 413);
  const r = await pedro.put(`/api/orders/${id}/image`, { imageUrl: PNG });
  assert.equal(r.status, 200);
  assert.match(r.data.imageUrl, new RegExp(`^/api/orders/${id}/image\\?v=`));
});

test('boletos: PDFs guardados em partes, vendedor só vê os seus, baixa apaga PDFs', async () => {
  const pedro = await as('Pedro', '3220');
  const ric = await as('Ricardo', '1234');
  const wan = await as('Wanderley', '1234');
  const big = 'data:application/pdf;base64,' + Buffer.alloc(900_000, 7).toString('base64'); // força várias partes
  const r = await pedro.post('/api/boletos', { marca: 'BOL A', valor: 500, data: '2026-09-01', vendedor: 'Ricardo', pdfNFUrl: PDF, pdfBoletoUrl: big });
  assert.equal(r.status, 201);
  const id = r.data.id;
  assert.ok((await store.queryWhere('boletoPdfs', 'boletoId', id)).length >= 3);
  assert.equal((await ric.get(`/api/boletos/${id}/pdf/nf`)).status, 200);
  const bol = await ric.get(`/api/boletos/${id}/pdf/boleto`);
  assert.equal(bol.status, 200);
  assert.equal(bol.data.length, 900_000);
  assert.equal((await wan.get(`/api/boletos/${id}/pdf/nf`)).status, 404);
  assert.ok(!(await wan.get('/api/boletos')).data.some((b: any) => b.id === id));
  const baixa = await pedro.put(`/api/boletos/${id}/baixa`, { observacaoBaixa: 'ok' });
  assert.equal(baixa.data.situacao, 'PAGO');
  assert.equal((await store.queryWhere('boletoPdfs', 'boletoId', id)).length, 0);
  assert.equal((await pedro.get(`/api/boletos/${id}/pdf/nf`)).status, 404);
  const r2 = await pedro.post('/api/boletos', { marca: 'BOL B', valor: 5, data: '2026-09-01', vendedor: 'Ricardo', pdfNFUrl: PDF });
  await pedro.del(`/api/boletos/${r2.data.id}`);
  assert.equal((await store.queryWhere('boletoPdfs', 'boletoId', r2.data.id)).length, 0);
  assert.equal((await pedro.post('/api/boletos', { marca: 'X', valor: 1, data: '2026-09-01', pdfNFUrl: 'data:text/html;base64,AAAA' })).status, 400);
});

test('senha: troca vale em outro aparelho, derruba sessão antiga, só Pedro restaura', async () => {
  const igor1 = await as('Igor', '3220');
  const igor2 = await as('Igor', '3220'); // outro aparelho
  assert.equal((await igor1.post('/api/auth/change-password', { currentPassword: 'errada', newPassword: '9999' })).status, 400);
  assert.equal((await igor1.post('/api/auth/change-password', { currentPassword: '3220', newPassword: '9999' })).status, 200);
  assert.equal((await igor1.get('/api/orders')).status, 200); // a sessão que trocou continua
  assert.equal((await igor2.get('/api/orders')).status, 401); // a antiga cai
  assert.equal((await new Client().login('Igor', '3220')).status, 401);
  assert.equal((await new Client().login('Igor', '9999')).status, 200);
  const dan = await as('Daniel', '3220');
  assert.equal((await dan.post('/api/auth/reset-password', { name: 'Igor' })).status, 403);
  const pedro = await as('Pedro', '3220');
  assert.equal((await pedro.post('/api/auth/reset-password', { name: 'Igor' })).status, 200);
  assert.equal((await new Client().login('Igor', '3220')).status, 200);
  assert.equal((await store.get('users', 'Igor')).hash.includes('3220'), false);
});

test('marca→vendedor: vínculo atualiza pedidos em aberto e novos pedidos herdam', async () => {
  const pedro = await as('Pedro', '3220');
  await pedro.post('/api/brand-sellers', { marca: 'vv - HERDA', vendedor: 'Wanderley' });
  const o = await pedro.post('/api/orders', { marca: 'herda', data: '2026-10-12', valor: 9 });
  assert.equal(o.data.vendedor, 'Wanderley');
});

test('importação: não reabre baixado, não reduz valorPago, une histórico, pré-visualiza sem gravar', async () => {
  const pedro = await as('Pedro', '3220');
  const id = (await pedro.post('/api/orders', { marca: 'IMP', data: '2026-10-01', valor: 100, vendedor: 'Ricardo', imageUrl: PNG })).data.id;
  await pedro.post(`/api/orders/${id}/baixa`);
  const now = stateRef.orders.get(id);
  const stale = { ...now, status: 'em_aberto', valorPago: 10, dataBaixa: undefined, updatedAt: '2030-01-01T00:00:00.000Z', historicoBaixas: [{ id: 'bx-antigo', data: '2026-09-01T00:00:00Z', valor: 10, baixadoPor: 'Pedro' }], campoNovo: 'preservar', imageUrl: PNG };
  const dry = await pedro.post('/api/backup/import', { orders: [stale], dryRun: true });
  assert.equal(dry.data.dryRun, true);
  assert.equal(stateRef.orders.get(id).campoNovo, undefined);
  const r = await pedro.post('/api/backup/import', { orders: [stale] });
  assert.equal(r.status, 200);
  const after = stateRef.orders.get(id);
  assert.equal(after.status, 'baixado');
  assert.equal(after.valorPago, 100);
  assert.equal(after.campoNovo, 'preservar');
  assert.ok(after.historicoBaixas.some((h: any) => h.id === 'bx-antigo'));
  assert.equal(await store.get('orderImages', id), null); // foto de baixado não volta
  assert.equal((await pedro.post('/api/backup/import', { foo: 1 })).status, 400);
});

test('importação grava pedido novo em aberto com foto comprimida e aceita formato de lista pura', async () => {
  const pedro = await as('Pedro', '3220');
  const r = await pedro.post('/api/backup/import', { orders: [{ id: 'PED-9001', marca: 'NOVO', data: '2026-10-02', valor: 55.5, vendedor: 'Ricardo', status: 'em_aberto', createdAt: '2026-10-02T10:00:00Z', imageUrl: PNG }] });
  assert.equal(r.data.resumo.pedidosNovos, 1);
  assert.equal(r.data.resumo.fotosImportadas, 1);
  assert.ok(await store.get('orderImages', 'PED-9001'));
  const r2 = await pedro.post('/api/backup/import', { orders: [{ id: 'PED-9001', marca: 'NOVO', data: '2026-10-02', valor: 55.5, vendedor: 'Ricardo', status: 'em_aberto', createdAt: '2026-10-02T10:00:00Z' }] });
  assert.equal(r2.data.resumo.pedidosIguais, 1);
});

test('backup: completo e só em aberto, sem fotos nem PDFs', async () => {
  const pedro = await as('Pedro', '3220');
  const full = (await pedro.get('/api/backup/export?tipo=completo')).data;
  const open = (await pedro.get('/api/backup/export?tipo=abertos')).data;
  for (const k of ['app', 'version', 'exportedAt', 'exportedBy', 'totalOrders', 'openOrders', 'settledOrders', 'totalBoletos', 'openBoletos', 'orders', 'boletos']) assert.ok(k in full, k);
  assert.equal(full.exportedBy, 'Pedro');
  assert.equal(full.totalOrders, full.orders.length);
  assert.equal(open.orders.length, full.openOrders);
  assert.ok(open.orders.every((o: any) => o.status === 'em_aberto'));
  assert.ok(!JSON.stringify(full).includes('data:image'));
  assert.ok(full.orders.every((o: any) => !('imageUrl' in o)));
});

test('arquivar: só baixados com mais de 90 dias, exige confirmação', async () => {
  const pedro = await as('Pedro', '3220');
  const old = { id: 'PED-OLD', marca: 'VELHO', data: '2026-01-01', valor: 10, valorPago: 10, vendedor: 'Ricardo', status: 'baixado', dataBaixa: '2026-01-05T10:00:00.000Z', createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-05T10:00:00Z' };
  await pedro.post('/api/backup/import', { orders: [old] });
  const fresh = (await pedro.post('/api/orders', { marca: 'RECENTE', data: '2026-10-12', valor: 5, vendedor: 'Ricardo' })).data.id;
  await pedro.post(`/api/orders/${fresh}/baixa`);
  assert.equal((await pedro.post('/api/orders/archive', { ids: ['PED-OLD'] })).status, 400);
  const r = await pedro.post('/api/orders/archive', { ids: ['PED-OLD', fresh], confirm: true });
  assert.equal(r.data.archived, 1);
  assert.equal(r.data.ignored, 1);
  assert.ok(!stateRef.orders.has('PED-OLD'));
  assert.ok(stateRef.orders.has(fresh));
});

test('cota esgotada: grava nada, avisa com 503, estado em memória intacto', async () => {
  const pedro = await as('Pedro', '3220');
  const before = stateRef.orders.size;
  store.simulateQuota = true;
  const r = await pedro.post('/api/orders', { marca: 'SEMCOTA', data: '2026-10-12', valor: 5, vendedor: 'Ricardo' });
  assert.equal(r.status, 503);
  assert.match(r.data.error, /nuvem|limite|cota/i);
  assert.equal(stateRef.orders.size, before);
  const list = await pedro.get('/api/orders');
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('x-store-status'), 'quota');
  store.simulateQuota = false;
  assert.equal((await pedro.post('/api/orders', { marca: 'COMCOTA', data: '2026-10-12', valor: 5, vendedor: 'Ricardo' })).status, 201);
});

test('sem dados de exemplo: sistema novo começa sem pedidos', async () => {
  const s2 = new MemoryStore();
  const { state } = createApp(s2, { sessionSecret: 'x' });
  await state.load();
  assert.equal(state.orders.size, 0);
  assert.equal(state.boletos.size, 0);
  assert.equal(state.users.size, 5);
});

test('IA opcional: sem chave avisa e não quebra; com extrator só a gestão usa', async () => {
  // servidor sem IA
  const off = createApp(new MemoryStore(), { sessionSecret: 'x', extractor: null });
  await off.state.load();
  const srvOff = await new Promise<any>((r) => { const s = off.app.listen(0, () => r(s)); });
  const baseOff = `http://127.0.0.1:${srvOff.address().port}`;
  const lg = await fetch(baseOff + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pedro', password: '3220' }) });
  const ck = (lg.headers.get('set-cookie') || '').split(';')[0];
  const st = await (await fetch(baseOff + '/api/extract-order/status', { headers: { cookie: ck } })).json();
  assert.equal(st.enabled, false);
  const r0 = await fetch(baseOff + '/api/extract-order', { method: 'POST', headers: { cookie: ck, 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: PNG }) });
  assert.equal(r0.status, 503);
  srvOff.close();

  // servidor com extrator simulado
  const on = createApp(new MemoryStore(), { sessionSecret: 'x', extractor: async () => ({ marca: 'RIVA', data: '2026-11-03', valor: 1234.5, vendedor: 'Igor' }) });
  await on.state.load();
  const srvOn = await new Promise<any>((r) => { const s = on.app.listen(0, () => r(s)); });
  const baseOn = `http://127.0.0.1:${srvOn.address().port}`;
  const login = async (name: string, pw: string) => {
    const l = await fetch(baseOn + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password: pw }) });
    return (l.headers.get('set-cookie') || '').split(';')[0];
  };
  const call = (cookie: string, body: any) => fetch(baseOn + '/api/extract-order', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const pc = await login('Pedro', '3220');
  const ok = await call(pc, { imageBase64: PNG });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).marca, 'RIVA');
  assert.equal((await call(pc, { imageBase64: 'lixo' })).status, 400);
  assert.equal((await call(await login('Ricardo', '1234'), { imageBase64: PNG })).status, 403);
  assert.equal((await call('', { imageBase64: PNG })).status, 401);
  srvOn.close();
});

test('extrator Gemini: pula modelo com limite excedido e valida a resposta', async () => {
  const { makeGeminiExtractor, ExtractError } = await import('../server/extract');
  assert.equal(makeGeminiExtractor({} as any), null);
  const calls: string[] = [];
  const fake: any = async (url: string) => {
    calls.push(url);
    if (calls.length === 1) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ marca: 'BSM', data: '2026-08-04', valor: 5730, vendedor: 'ricardo' }) }] } }] }) };
  };
  const ex = makeGeminiExtractor({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1,m2' } as any, fake)!;
  const out = await ex(PNG, []);
  assert.deepEqual(out, { marca: 'BSM', data: '2026-08-04', valor: 5730, vendedor: 'Ricardo' });
  assert.equal(calls.length, 2);
  const bad: any = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const ex2 = makeGeminiExtractor({ GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1' } as any, bad)!;
  await assert.rejects(() => ex2(PNG, []), (e: any) => e instanceof ExtractError && e.status === 429);
});
