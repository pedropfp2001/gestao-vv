import React, { useMemo, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Trash2, Plus, ImageIcon, Download } from 'lucide-react';
import { ItemPedido, Order } from '../types';
import { formatCurrency } from '../utils/pdfGenerator';

export type ItensMap = Map<string, { itens: ItemPedido[]; bilhete?: string; vencimento?: string }>;

interface Props {
  /** pedidos agrupados por marca, na ordem em que os PDFs serão gerados */
  grupos: { marca: string; orders: Order[] }[];
  itens: ItensMap;
  /** só a gestão corrige (e a correção fica salva para os próximos relatórios) */
  canEdit: boolean;
  aviso?: string;
  onCancel: () => void;
  onConfirm: (itens: ItensMap) => void | Promise<void>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string) => { const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '');

export const ConferenciaItensModal: React.FC<Props> = ({ grupos, itens, canEdit, aviso, onCancel, onConfirm }) => {
  const [dados, setDados] = useState<Map<string, ItemPedido[]>>(() => {
    const m = new Map<string, ItemPedido[]>();
    grupos.forEach((g) => g.orders.forEach((o) => m.set(o.id, (itens.get(o.id)?.itens || []).map((i) => ({ ...i })))));
    return m;
  });
  const original = useMemo(() => JSON.stringify([...dados.entries()]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [soProblemas, setSoProblemas] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const soma = (id: string) => r2((dados.get(id) || []).reduce((s, i) => s + (i.total || 0), 0));
  const estado = (o: Order): 'ok' | 'dif' | 'vazio' => {
    const l = dados.get(o.id) || [];
    if (!l.length) return 'vazio';
    return Math.abs(soma(o.id) - (o.valor || 0)) < 0.015 ? 'ok' : 'dif';
  };
  const todos = grupos.flatMap((g) => g.orders);
  const cont = { ok: 0, dif: 0, vazio: 0 };
  todos.forEach((o) => { cont[estado(o)]++; });

  const setItem = (id: string, idx: number, patch: Partial<ItemPedido>) =>
    setDados((p) => { const n = new Map<string, ItemPedido[]>(p); const l = [...(n.get(id) || [])]; l[idx] = { ...l[idx], ...patch }; n.set(id, l); return n; });
  const editQtdPreco = (id: string, idx: number, campo: 'quantidade' | 'preco', v: string) =>
    setDados((p) => {
      const n = new Map<string, ItemPedido[]>(p); const l = [...(n.get(id) || [])]; const cur = { ...l[idx], [campo]: num(v) } as ItemPedido;
      cur.total = r2((cur.quantidade || 0) * (cur.preco || 0)); l[idx] = cur; n.set(id, l); return n;
    });
  const delItem = (id: string, idx: number) => setDados((p) => { const n = new Map<string, ItemPedido[]>(p); n.set(id, (n.get(id) || []).filter((_, i) => i !== idx)); return n; });
  const addItem = (id: string) => setDados((p) => { const n = new Map<string, ItemPedido[]>(p); n.set(id, [...(n.get(id) || []), { mercadoria: '', un: '', quantidade: 0, preco: 0, total: 0 }]); return n; });

  const confirmar = async () => {
    setSaving(true); setErro(null);
    try {
      const out: ItensMap = new Map();
      const changed: string[] = [];
      const orig = new Map<string, ItemPedido[]>(JSON.parse(original) as [string, ItemPedido[]][]);
      for (const o of todos) {
        const l = (dados.get(o.id) || []).filter((i) => i.mercadoria.trim());
        out.set(o.id, { itens: l, bilhete: itens.get(o.id)?.bilhete, vencimento: itens.get(o.id)?.vencimento });
        if (JSON.stringify(orig.get(o.id) || []) !== JSON.stringify(dados.get(o.id) || []) && l.length) changed.push(o.id);
      }
      if (canEdit) {
        for (const id of changed) {
          const r = await fetch(`/api/orders/${encodeURIComponent(id)}/itens`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens: out.get(id)!.itens, bilhete: out.get(id)!.bilhete }) });
          if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `Não foi possível salvar a correção (${r.status}).`);
        }
      }
      await onConfirm(out);
    } catch (e: any) { setErro(e?.message || 'Não foi possível continuar.'); setSaving(false); }
  };

  const inp = 'w-full px-1.5 py-1 border border-slate-200 rounded-md text-xs bg-white focus:outline-none focus:ring-1 focus:ring-slate-400';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-900/70 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
      <div className="bg-white w-full max-w-5xl max-h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">Conferir a leitura antes de gerar</h3>
            <p className="text-xs text-slate-500 mt-0.5">Compare cada foto com os itens lidos pela IA. {canEdit ? 'Corrija o que estiver errado: a correção fica salva e não será lida de novo.' : 'Só a Gestão pode corrigir; aqui você confere.'}</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Fechar"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">{cont.ok} batem com o valor</span>
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">{cont.dif} com diferença</span>
          <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800">{cont.vazio} sem leitura</span>
          <label className="ml-auto flex items-center gap-2 text-slate-600 cursor-pointer">
            <input type="checkbox" checked={soProblemas} onChange={(e) => setSoProblemas(e.target.checked)} /> Mostrar só os com problema
          </label>
        </div>
        {aviso && <div className="mx-5 mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>{aviso}</span></div>}

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {grupos.map((g) => {
            const lista = g.orders.filter((o) => !soProblemas || estado(o) !== 'ok');
            if (!lista.length) return null;
            return (
              <section key={g.marca} className="space-y-3">
                <h4 className="text-sm font-black text-slate-900 border-b border-slate-200 pb-1">{g.marca}</h4>
                {lista.map((o) => {
                  const st = estado(o); const l = dados.get(o.id) || []; const s = soma(o.id);
                  return (
                    <div key={o.id} className={`rounded-2xl border ${st === 'ok' ? 'border-slate-200' : st === 'dif' ? 'border-amber-300' : 'border-red-300'} overflow-hidden`}>
                      <div className="px-3 py-2 bg-slate-50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="font-black text-slate-800">{itens.get(o.id)?.bilhete || o.id}</span>
                        <span className="text-slate-500">{o.data.split('-').reverse().join('/')}</span>
                        <span className="text-slate-600">Pedido: <b>{formatCurrency(o.valor || 0)}</b></span>
                        <span className="text-slate-600">Soma dos itens: <b>{formatCurrency(s)}</b></span>
                        {st === 'ok' && <span className="ml-auto flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> bate</span>}
                        {st === 'dif' && <span className="ml-auto flex items-center gap-1 text-amber-700 font-bold"><AlertTriangle className="w-3.5 h-3.5" /> diferença de {formatCurrency(Math.abs(s - (o.valor || 0)))}</span>}
                        {st === 'vazio' && <span className="ml-auto flex items-center gap-1 text-red-700 font-bold"><AlertTriangle className="w-3.5 h-3.5" /> itens não lidos{canEdit ? ' (digite abaixo)' : ''}</span>}
                      </div>
                      <div className="p-3 flex flex-col md:flex-row gap-3">
                        <a href={o.imageUrl || undefined} target="_blank" rel="noreferrer" className="md:w-48 shrink-0 block rounded-xl overflow-hidden border border-slate-200 bg-slate-100 self-start" title="Abrir a foto em tamanho grande">
                          {o.imageUrl ? <img src={o.imageUrl} alt="Foto do pedido" className="w-full max-h-64 object-contain" loading="lazy" /> : <div className="h-24 flex items-center justify-center text-slate-400 text-xs gap-1"><ImageIcon className="w-4 h-4" /> sem foto</div>}
                        </a>
                        <div className="flex-1 min-w-0 overflow-x-auto">
                          <table className="w-full text-xs min-w-[460px]">
                            <thead><tr className="text-left text-slate-500 text-[10px] uppercase"><th className="pb-1 pr-1">Mercadoria</th><th className="pb-1 px-1 w-12">Un</th><th className="pb-1 px-1 w-20 text-right">Qtde</th><th className="pb-1 px-1 w-24 text-right">Preço</th><th className="pb-1 px-1 w-24 text-right">Total</th><th className="w-6" /></tr></thead>
                            <tbody>
                              {l.map((it, idx) => (
                                <tr key={idx}>
                                  <td className="pr-1 py-0.5">{canEdit ? <input className={inp} value={it.mercadoria} onChange={(e) => setItem(o.id, idx, { mercadoria: e.target.value.toUpperCase() })} /> : <span className="font-bold">{it.mercadoria}</span>}</td>
                                  <td className="px-1">{canEdit ? <input className={inp} value={it.un || ''} onChange={(e) => setItem(o.id, idx, { un: e.target.value.toUpperCase() })} /> : it.un}</td>
                                  <td className="px-1 text-right">{canEdit ? <input className={`${inp} text-right`} defaultValue={fmt(it.quantidade)} onBlur={(e) => editQtdPreco(o.id, idx, 'quantidade', e.target.value)} /> : fmt(it.quantidade)}</td>
                                  <td className="px-1 text-right">{canEdit ? <input className={`${inp} text-right`} defaultValue={fmt(it.preco)} onBlur={(e) => editQtdPreco(o.id, idx, 'preco', e.target.value)} /> : fmt(it.preco)}</td>
                                  <td className="px-1 text-right">{canEdit ? <input className={`${inp} text-right`} key={it.total} defaultValue={fmt(it.total)} onBlur={(e) => setItem(o.id, idx, { total: r2(num(e.target.value)) })} /> : <b>{fmt(it.total)}</b>}</td>
                                  <td>{canEdit && <button onClick={() => delItem(o.id, idx)} className="p-1 text-slate-400 hover:text-red-700 cursor-pointer" aria-label="Remover linha"><Trash2 className="w-3.5 h-3.5" /></button>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {canEdit && <button onClick={() => addItem(o.id)} className="mt-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Adicionar linha</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-3">
          {erro && <span className="text-xs font-bold text-red-700 flex-1 min-w-[200px]">{erro}</span>}
          <span className="flex-1" />
          <button onClick={onCancel} disabled={saving} className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer">Voltar</button>
          <button onClick={confirmar} disabled={saving} className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 cursor-pointer">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {cont.dif + cont.vazio > 0 ? 'Gerar mesmo assim' : 'Tudo certo: gerar PDFs'}
          </button>
        </div>
      </div>
    </div>
  );
};
