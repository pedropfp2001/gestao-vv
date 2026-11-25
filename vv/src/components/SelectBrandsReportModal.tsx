import React, { useMemo, useState } from 'react';
import { X, Search, Download, Share2, CheckSquare, Square, Save } from 'lucide-react';
import { Order } from '../types';
import { formatCurrency, generateSelectedBrandsPDF, generateExtratoClientesPDF, carregarItens } from '../utils/pdfGenerator';
import { runReport } from '../utils/reportPreview';
import { ConferenciaItensModal, ItensMap } from './ConferenciaItensModal';

interface Props {
  orders: Order[];
  onClose: () => void;
  /** nome de quem gera o relatório (aparece no cabeçalho do PDF) */
  onBeforeGenerate?: () => void;
  /** lista salva no sistema (vale para todos) */
  savedBrands?: string[];
  /** só a gestão pode salvar a lista */
  canSave?: boolean;
  onSaved?: (brands: string[]) => void;
  /** 'extrato' = um PDF por marca, com as mercadorias lidas das fotos pela IA */
  mode?: 'resumo' | 'extrato';
  /** só a Gestão corrige os itens na conferência */
  canEditItens?: boolean;
}

const saldo = (o: Order) => Math.max(0, (o.valor || 0) - (o.valorPago || 0));
const brandOf = (o: Order) => (o.marca || 'SEM MARCA').trim() || 'SEM MARCA';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const SelectBrandsReportModal: React.FC<Props> = ({ orders, onClose, onBeforeGenerate, savedBrands: savedProp = [], canSave: canSaveProp = false, onSaved, mode = 'resumo', canEditItens = false }) => {
  const extrato = mode === 'extrato';
  const savedBrands = extrato ? [] : savedProp;
  const canSave = extrato ? false : canSaveProp;
  const [progress, setProgress] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [revisao, setRevisao] = useState<{ grupos: { marca: string; orders: Order[] }[]; itens: ItensMap; aviso?: string } | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(savedBrands.map((b) => b.trim().toUpperCase())));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);

  const brands = useMemo(() => {
    const map = new Map<string, { marca: string; pedidos: number; valor: number }>();
    orders.filter((o) => o.status === 'em_aberto' && saldo(o) > 0).forEach((o) => {
      const k = brandOf(o).toUpperCase();
      const cur = map.get(k) || { marca: brandOf(o), pedidos: 0, valor: 0 };
      cur.pedidos += 1;
      cur.valor += saldo(o);
      map.set(k, cur);
    });
    // marcas salvas que hoje não têm pedido em aberto continuam na lista (para poder desmarcar)
    savedBrands.forEach((b) => {
      const k = b.trim().toUpperCase();
      if (k && !map.has(k)) map.set(k, { marca: b.trim(), pedidos: 0, valor: 0 });
    });
    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.marca.localeCompare(b.marca, 'pt-BR'));
  }, [orders, savedBrands]);

  const visible = brands.filter((b) => !query.trim() || norm(b.marca).includes(norm(query)));
  const chosen = brands.filter((b) => selected.has(b.key));
  const totalPedidos = chosen.reduce((s, b) => s + b.pedidos, 0);
  // quantos dos pedidos escolhidos já têm os itens lidos (saem na hora, sem chamar a IA)
  const chosenKeys = new Set(chosen.map((b) => b.key));
  const escolhidos = orders.filter((o) => o.status === 'em_aberto' && saldo(o) > 0 && chosenKeys.has(brandOf(o).toUpperCase()));
  const jaLidos = escolhidos.filter((o) => Array.isArray(o.itens) && o.itens.length).length;
  const totalValor = chosen.reduce((s, b) => s + b.valor, 0);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const selectVisible = () => setSelected((prev) => new Set([...prev, ...visible.map((b) => b.key)]));
  const clearAll = () => setSelected(new Set());

  const saveList = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const r = await fetch('/api/report-brands', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brands: chosen.map((b) => b.marca) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Não foi possível salvar.');
      onSaved?.(d.brands || []);
      setSaveMsg(`Lista salva (${(d.brands || []).length} marcas). Agora o botão "Marcas salvas" baixa direto.`);
    } catch (e: any) {
      setSaveMsg(e?.message || 'Não foi possível salvar.');
    } finally { setSaving(false); }
  };

  const generate = async (action: 'download' | 'share') => {
    if (!chosen.length) return;
    setBusy(action);
    try {
      onBeforeGenerate?.();
      if (extrato) {
        // 1) lê os itens (só os que ainda não foram lidos) e 2) abre a conferência antes de gerar os PDFs
        setProgress('Preparando…');
        const wanted = new Set(chosen.map((b) => b.key));
        const abertos = orders.filter((o) => o.status === 'em_aberto' && saldo(o) > 0 && wanted.has(brandOf(o).toUpperCase()));
        const grupos = chosen
          .map((b) => ({ marca: b.marca, orders: abertos.filter((o) => brandOf(o).toUpperCase() === b.key).sort((x, y) => x.data.localeCompare(y.data) || x.id.localeCompare(y.id)) }))
          .filter((g) => g.orders.length);
        const r = await carregarItens(grupos.flatMap((g) => g.orders), (d, t) => { setProgress(`Lendo itens ${d} de ${t}…`); setPct(t ? Math.round((d / t) * 100) : 0); });
        setRevisao({
          grupos, itens: r.itens,
          aviso: r.falhas > 0 ? `${r.falhas} pedido(s) não puderam ser lidos pela IA.${r.motivo ? ' Motivo: ' + r.motivo : ''} Eles saem só com o valor total, ou você pode digitar os itens (Gestão).` : undefined,
        });
      } else {
        await runReport(() => generateSelectedBrandsPDF(orders, chosen.map((b) => b.marca), action));
      }
    } catch (e: any) {
      alert('Não foi possível gerar o relatório: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setBusy(null);
      setProgress(null);
      setPct(0);
    }
  };

  const select3 = () => setSelected(new Set(brands.filter((b) => b.pedidos >= 3).map((b) => b.key)));

  const confirmarConferencia = async (itensFinal: ItensMap) => {
    if (!revisao) return;
    setBusy('download');
    try {
      setProgress('Gerando PDFs…');
      await runReport(() => generateExtratoClientesPDF(orders, 'download', revisao.grupos.map((g) => g.marca), undefined, itensFinal));
      setRevisao(null);
    } finally { setBusy(null); setProgress(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      {revisao && (
        <ConferenciaItensModal grupos={revisao.grupos} itens={revisao.itens} canEdit={canEditItens} aviso={revisao.aviso} onCancel={() => setRevisao(null)} onConfirm={confirmarConferencia} />
      )}
      <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">{extrato ? 'Extratos com mercadorias (IA)' : 'Relatório das marcas escolhidas'}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{extrato ? 'Marque as marcas: sai um PDF para cada uma (sem .zip), com as mercadorias lidas das fotos.' : 'Marque as marcas e baixe o PDF no mesmo modelo de "Marcas com 1 Pedido".'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Fechar"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="px-5 pt-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar marca..."
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div className="flex items-center gap-2 text-xs font-bold">
            <button onClick={selectVisible} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">
              {query.trim() ? 'Marcar as encontradas' : 'Marcar todas'}
            </button>
            {extrato && <button onClick={select3} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">Só 3+ pedidos</button>}
            <button onClick={clearAll} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">Limpar</button>
            <span className="ml-auto text-slate-500">{brands.length} marcas com pedido em aberto</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[160px]">
          {visible.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Nenhuma marca encontrada.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((b) => {
                const on = selected.has(b.key);
                return (
                  <li key={b.key}>
                    <button onClick={() => toggle(b.key)} className="w-full flex items-center gap-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 rounded-lg px-1">
                      {on ? <CheckSquare className="w-5 h-5 text-red-700 shrink-0" /> : <Square className="w-5 h-5 text-slate-300 shrink-0" />}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-slate-900 truncate">{b.marca}</span>
                        <span className="block text-[11px] text-slate-500">{b.pedidos === 0 ? 'sem pedido em aberto agora' : `${b.pedidos} ${b.pedidos === 1 ? 'pedido' : 'pedidos'} em aberto`}</span>
                      </span>
                      <span className="text-sm font-black text-slate-800 tabular-nums">{formatCurrency(b.valor)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50/60 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600">
            <span>{chosen.length} {chosen.length === 1 ? 'marca' : 'marcas'} · {totalPedidos} {totalPedidos === 1 ? 'pedido' : 'pedidos'}</span>
            <span className="text-red-800 text-sm font-black">{formatCurrency(totalValor)}</span>
          </div>
          {extrato && busy === 'download' && progress && (
            <div>
              <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1"><span>{progress}</span><span>{pct}%</span></div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${pct}%` }} /></div>
            </div>
          )}
          {extrato && escolhidos.length > 0 && (
            <p className="text-[11px] text-slate-500 px-1">
              {jaLidos} de {escolhidos.length} pedidos já estão lidos (saem na hora){escolhidos.length - jaLidos > 0 ? `; ${escolhidos.length - jaLidos} ainda vão passar pela IA agora.` : '.'}
            </p>
          )}
          {canSave && (
            <div>
              <button
                disabled={saving}
                onClick={saveList}
                className="w-full px-4 py-2 bg-white border-2 border-slate-300 hover:border-slate-500 disabled:opacity-50 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" /> {saving ? 'Salvando…' : 'Salvar esta lista para o envio diário'}
              </button>
              {saveMsg && <p className="text-[11px] font-bold text-slate-600 mt-1.5">{saveMsg}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <button
              disabled={!chosen.length || !!busy}
              onClick={() => generate('download')}
              className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" /> {busy === 'download' ? (progress || 'Gerando…') : extrato ? `Ler e conferir (${chosen.length})` : 'Baixar PDF'}
            </button>
            {!extrato && (            <button
                disabled={!chosen.length || !!busy}
              onClick={() => generate('share')}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Share2 className="w-4 h-4" /> {busy === 'share' ? 'Gerando…' : 'Enviar por WhatsApp'}
            </button>)}
          </div>
        </div>
      </div>
    </div>
  );
};
