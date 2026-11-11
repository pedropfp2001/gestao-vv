import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User, Order } from '../types';
import { findBestSellerForBrand } from '../utils/brandSellerHelper';
import { compressImageFile } from '../utils/imageCompressor';
import { safeFetch } from '../utils/apiClient';
import { X, Camera, Upload, Plus, Trash2, Loader2, CheckCircle2, AlertCircle, ZoomIn, Building, Sparkles } from 'lucide-react';

interface OrderUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  orders?: Order[];
  onOrderCreated: (newOrder: Order) => void;
}

type Seller = 'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley';
const SELLERS: Seller[] = ['Pedro', 'Daniel', 'Igor', 'Ricardo', 'Wanderley'];
const MAX_BATCH_SIZE = 30;

interface Item {
  id: string;
  previewUrl: string; // foto já comprimida (1280px, JPEG 0.7)
  marca: string;
  data: string;
  valor: string;
  vendedor: Seller;
  sellerFromMap: boolean;
  status: 'idle' | 'saving' | 'error';
  error?: string;
  ai?: 'reading' | 'ok' | 'fail';
  aiMsg?: string;
}

const today = () => new Date().toISOString().split('T')[0];
const cleanBrand = (s: string) =>
  s.replace(/^MARCA\s*:\s*/i, '').replace(/^VV\s*-\s*/i, '').replace(/^VV\s*/i, '').replace(/\*/g, '').trim().toUpperCase();

/** Aceita "1.234,56", "1234,56" e "1234.56". */
export function parseValorBR(raw: string): number {
  let t = String(raw).trim().replace(/[^\d.,-]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  else if (/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', '');
  return parseFloat(t);
}

export const OrderUploadModal: React.FC<OrderUploadModalProps> = ({ isOpen, onClose, currentUser, orders = [], onOrderCreated }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [brandMap, setBrandMap] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiAuto, setAiAuto] = useState(true);
  const aiChain = useRef<Promise<void>>(Promise.resolve());
  const brandMapRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/brand-sellers')
      .then((r) => r.json())
      .then((d) => { if (d && typeof d === 'object') { setBrandMap(d); brandMapRef.current = d; } })
      .catch(() => {});
    fetch('/api/extract-order/status')
      .then((r) => r.json())
      .then((d) => setAiEnabled(!!d?.enabled))
      .catch(() => setAiEnabled(false));
  }, [isOpen]);

  const knownBrands = useMemo(() => {
    const set = new Set<string>(Object.keys(brandMap));
    orders.forEach((o) => o.marca && set.add(o.marca));
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [brandMap, orders]);

  if (!isOpen) return null;

  const history = orders.map((o) => ({ marca: o.marca, vendedor: o.vendedor }));
  const patch = (id: string, p: Partial<Item>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const applyBrandSeller = (id: string, marcaRaw: string) => {
    const match = findBestSellerForBrand(cleanBrand(marcaRaw), brandMap, history);
    if (match) patch(id, { vendedor: match.seller as Seller, sellerFromMap: true });
  };

  // Lê a foto com IA e preenche os campos (você confere antes de lançar; nada é salvo sozinho).
  const readAI = async (id: string, imageUrl: string) => {
    if (!imageUrl) return;
    patch(id, { ai: 'reading', aiMsg: undefined });
    try {
      const r = await fetch('/api/extract-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: imageUrl }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { patch(id, { ai: 'fail', aiMsg: d?.error || 'A IA não conseguiu ler. Preencha manualmente.' }); return; }
      const marca = cleanBrand(String(d.marca || ''));
      const match = findBestSellerForBrand(marca, brandMapRef.current, history);
      patch(id, {
        ai: 'ok',
        marca,
        data: d.data || today(),
        valor: Number(d.valor).toFixed(2).replace('.', ','),
        vendedor: ((match?.seller || d.vendedor) as Seller) || 'Ricardo',
        sellerFromMap: !!match,
        error: undefined,
        status: 'idle',
      });
    } catch {
      patch(id, { ai: 'fail', aiMsg: 'Sem conexão com a IA. Preencha manualmente.' });
    }
  };
  // fila: uma foto por vez, com pausa, para não estourar o limite gratuito da IA
  const queueAI = (id: string, imageUrl: string) => {
    aiChain.current = aiChain.current.then(() => readAI(id, imageUrl)).then(() => new Promise<void>((res) => setTimeout(res, 1200)));
  };

  const addFiles = async (files: File[]) => {
    const room = MAX_BATCH_SIZE - items.length;
    if (room <= 0) return alert(`O limite é de ${MAX_BATCH_SIZE} fotos por lote.`);
    const chosen = files.slice(0, room);
    if (files.length > room) alert(`Só cabem ${room} fotos neste lote; as demais foram ignoradas.`);
    for (const file of chosen) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let previewUrl = '';
      try {
        previewUrl = await compressImageFile(file, 1280, 1280, 0.7);
      } catch {
        previewUrl = '';
      }
      setItems((prev) => [
        ...prev,
        { id, previewUrl, marca: '', data: today(), valor: '', vendedor: (currentUser.name as Seller) || 'Ricardo', sellerFromMap: false, status: 'idle', ai: aiEnabled && aiAuto && previewUrl ? 'reading' : undefined },
      ]);
      if (aiEnabled && aiAuto && previewUrl) queueAI(id, previewUrl);
    }
  };

  const addBlank = () =>
    setItems((prev) =>
      prev.length >= MAX_BATCH_SIZE
        ? prev
        : [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, previewUrl: '', marca: '', data: today(), valor: '', vendedor: 'Ricardo', sellerFromMap: false, status: 'idle' }]
    );

  const missing = (i: Item) => !cleanBrand(i.marca) || !i.data || !(parseValorBR(i.valor) > 0);

  const saveOne = async (item: Item): Promise<boolean> => {
    if (missing(item)) {
      patch(item.id, { error: 'Preencha marca, data e valor.', status: 'error' });
      return false;
    }
    patch(item.id, { status: 'saving', error: undefined });
    const valor = parseValorBR(item.valor);
    const marca = cleanBrand(item.marca);
    const res = await safeFetch<Order>('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marca, data: item.data, valor, vendedor: item.vendedor, imageUrl: item.previewUrl || '' }),
      actionType: 'order_create',
      cliente: marca,
      valor,
      actionDescription: `Cadastro de Pedido ${marca}`,
      retries: 1,
    });
    if (res.ok && res.data) {
      onOrderCreated(res.data);
      setItems((prev) => prev.filter((i) => i.id !== item.id)); // só sai da lista o que foi salvo
      return true;
    }
    patch(item.id, { status: 'error', error: res.error || 'Não foi possível salvar. A foto continua aqui; tente de novo.' });
    return false;
  };

  const lancarUm = async (item: Item) => {
    if (saving || item.status === 'saving') return;
    await saveOne(item);
  };

  // Salva todos os pedidos completos; os incompletos continuam na lista para você preencher.
  const saveAll = async () => {
    setSaving(true);
    const snapshot = items.filter((i) => i.status !== 'saving');
    let pulados = 0;
    for (const item of snapshot) {
      if (missing(item)) { pulados++; patch(item.id, { error: 'Preencha marca, data e valor.', status: 'error' }); continue; }
      await saveOne(item);
    }
    setSaving(false);
    if (pulados > 0) alert(`${pulados} pedido(s) ficaram na lista porque faltam dados (marca, data ou valor).`);
  };

  const close = () => {
    if (items.length > 0 && !saving && !confirm('Há pedidos ainda não salvos neste lote. Fechar mesmo assim? As fotos serão descartadas.')) return;
    setItems([]);
    onClose();
  };

  const input = 'w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">Lançar Pedidos</h2>
                <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Até {MAX_BATCH_SIZE} fotos por vez
                </span>
              </div>
              <p className="text-xs text-slate-300">Escolha as fotos: a IA (se ativada) preenche marca, data e valor; você confere e lança. Também dá para digitar à mão.</p>
            </div>
          </div>
          <button onClick={close} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" /> Escolher fotos
            </button>
            <button onClick={() => camRef.current?.click()} className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
              <Camera className="w-4 h-4" /> Tirar foto
            </button>
            <button onClick={addBlank} className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
              <Plus className="w-4 h-4" /> Pedido sem foto
            </button>
            {aiEnabled && (
              <label className="px-3 py-2 bg-violet-50 border border-violet-200 text-violet-800 font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={aiAuto} onChange={(e) => setAiAuto(e.target.checked)} />
                <Sparkles className="w-4 h-4" /> Ler com IA ao adicionar
              </label>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ''; }} />
          </div>

          <datalist id="vv-brands">{knownBrands.map((b) => <option key={b} value={b} />)}</datalist>

          {items.length === 0 ? (
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center text-slate-500">
              <Building className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-slate-700 text-sm">Nenhum pedido no lote</p>
              <p className="text-xs mt-1">Use "Escolher fotos" para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={it.id} className={`rounded-2xl border p-3 flex flex-col sm:flex-row gap-3 ${it.status === 'error' ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
                  <div className="shrink-0">
                    {it.previewUrl ? (
                      <button type="button" onClick={() => setZoom(it.previewUrl)} className="relative block w-full sm:w-32 h-40 sm:h-36 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer">
                        <img src={it.previewUrl} alt={`Pedido ${idx + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 right-1 bg-black/60 text-white rounded p-1"><ZoomIn className="w-3.5 h-3.5" /></span>
                      </button>
                    ) : (
                      <div className="w-full sm:w-32 h-20 sm:h-36 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[11px] font-bold text-slate-400">Sem foto</div>
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2.5 content-start">
                    <label className="col-span-2 text-[11px] font-bold text-slate-500 uppercase">
                      Marca / Cliente
                      <input list="vv-brands" value={it.marca} onChange={(e) => patch(it.id, { marca: e.target.value, error: undefined, status: 'idle' })} onBlur={(e) => applyBrandSeller(it.id, e.target.value)} placeholder="Ex.: RIVA" className={`${input} mt-1 uppercase`} />
                    </label>
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Data
                      <input type="date" value={it.data} onChange={(e) => patch(it.id, { data: e.target.value })} className={`${input} mt-1`} />
                    </label>
                    <label className="text-[11px] font-bold text-slate-500 uppercase">
                      Valor (R$)
                      <input inputMode="decimal" value={it.valor} onChange={(e) => patch(it.id, { valor: e.target.value, error: undefined, status: 'idle' })} placeholder="0,00" className={`${input} mt-1`} />
                    </label>
                    <label className="col-span-2 text-[11px] font-bold text-slate-500 uppercase">
                      Vendedor {it.sellerFromMap && <span className="ml-1 normal-case text-emerald-600">preenchido pela marca</span>}
                      <select value={it.vendedor} onChange={(e) => patch(it.id, { vendedor: e.target.value as Seller, sellerFromMap: false })} className={`${input} mt-1`}>
                        {SELLERS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    {it.ai === 'reading' && <p className="col-span-2 text-xs font-bold text-violet-700 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />IA lendo a foto…</p>}
                    {it.ai === 'ok' && <p className="col-span-2 text-xs font-bold text-violet-700 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />Preenchido pela IA — confira antes de lançar.</p>}
                    {it.ai === 'fail' && <p className="col-span-2 text-xs font-bold text-amber-700 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{it.aiMsg}</p>}
                    {it.error && <p className="col-span-2 text-xs font-bold text-red-700 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{it.error}</p>}
                  </div>
                  <div className="flex sm:flex-col items-center justify-between sm:justify-start gap-2">
                    {it.status === 'saving' ? <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> : (
                      <button disabled={saving} onClick={() => lancarUm(it)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer" title="Lançar só este pedido"><CheckCircle2 className="w-4 h-4" />Lançar</button>
                    )}
                    {aiEnabled && it.previewUrl && it.ai !== 'reading' && (
                      <button disabled={saving} onClick={() => queueAI(it.id, it.previewUrl)} className="px-3 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg flex items-center gap-1 cursor-pointer" title="Ler esta foto com IA"><Sparkles className="w-4 h-4" />IA</button>
                    )}
                    <button disabled={saving} onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer disabled:opacity-40" title="Remover do lote"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs font-semibold text-slate-500">{items.length} pedido(s) no lote</span>
          <div className="flex gap-2">
            <button onClick={close} className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl cursor-pointer">Fechar</button>
            <button onClick={saveAll} disabled={saving || items.length === 0} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Lançar todos {items.length > 0 ? `(${items.length})` : ''}
            </button>
          </div>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Foto do pedido" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
};
