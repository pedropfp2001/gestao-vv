import React, { useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Trash2, CheckSquare, Square } from 'lucide-react';
import { formatCurrency, formatDateBR } from '../utils/pdfGenerator';

interface Copia { id: string; indexNum?: number; createdAt: string; cadastradoPor: string; manter: boolean }
interface Grupo {
  marca: string; valor: number; data: string; situacao: string; vendedor: string; numeroNF: string; numeroBoleto: string;
  confianca: 'alta' | 'baixa'; manter: string; copias: Copia[];
}

interface Props { onClose: () => void; onChanged?: () => void | Promise<void> }

const quando = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const DuplicateBoletosModal: React.FC<Props> = ({ onClose, onChanged }) => {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const carregar = async () => {
    setMsg(null);
    try {
      const r = await fetch('/api/boletos/duplicados', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
      setGrupos(d.grupos);
      // já vem marcado o que quase certamente é repetido por erro; os "talvez" ficam desmarcados para você decidir
      setMarcados(new Set(d.grupos.filter((g: Grupo) => g.confianca === 'alta').flatMap((g: Grupo) => g.copias.filter((c) => !c.manter).map((c) => c.id))));
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Não foi possível verificar.' }); setGrupos([]); }
  };
  useEffect(() => { void carregar(); }, []);

  const toggle = (id: string) => setMarcados((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const totalExtras = (grupos || []).reduce((s, g) => s + g.copias.length - 1, 0);
  const valorRemover = (grupos || []).reduce((s, g) => s + g.copias.filter((c) => marcados.has(c.id)).length * g.valor, 0);

  const remover = async () => {
    if (!marcados.size) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/boletos/duplicados/remover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...marcados] }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
      setMsg({ ok: true, text: `${d.removidos} boleto(s) repetido(s) removido(s). Ficou sempre o lançamento mais antigo de cada grupo.` });
      await onChanged?.();
      await carregar();
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Não foi possível remover.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">Remover boletos duplicados</h3>
            <p className="text-xs text-slate-500 mt-0.5">Boletos com a mesma marca, valor, data, NF e nº do boleto. Fica o mais antigo; você escolhe o que apagar.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Fechar"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {msg && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-start gap-2 ${msg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-red-50 border border-red-200 text-red-900'}`}>
              {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}<span>{msg.text}</span>
            </div>
          )}
          {grupos === null ? (
            <div className="py-10 text-center text-slate-500 text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Procurando repetidos…</div>
          ) : grupos.length === 0 ? (
            <div className="py-10 text-center text-slate-600 text-sm font-bold">Nenhum boleto duplicado encontrado.</div>
          ) : (
            grupos.map((g, gi) => (
              <div key={gi} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-black text-slate-900 text-sm">{g.marca}</span>
                  <span className="font-black text-red-800">{formatCurrency(g.valor)}</span>
                  <span className="text-slate-500">vence/emitido {formatDateBR(g.data)}</span>
                  {g.numeroNF && <span className="text-slate-500">NF {g.numeroNF}</span>}
                  <span className={`ml-auto px-2 py-0.5 rounded-full font-bold text-[10px] ${g.confianca === 'alta' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                    {g.confianca === 'alta' ? 'repetido por erro' : 'pode ser legítimo: confira'}
                  </span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {g.copias.map((c) => (
                    <li key={c.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                      {c.manter ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black text-[10px] w-16 text-center">FICA</span>
                      ) : (
                        <button onClick={() => toggle(c.id)} className="cursor-pointer" aria-label="Marcar para remover">
                          {marcados.has(c.id) ? <CheckSquare className="w-5 h-5 text-red-700" /> : <Square className="w-5 h-5 text-slate-300" />}
                        </button>
                      )}
                      <span className="font-bold text-slate-800">#{c.indexNum ?? '—'}</span>
                      <span className="text-slate-500">lançado em {quando(c.createdAt)}{c.cadastradoPor ? ` por ${c.cadastradoPor}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50/60 flex items-center gap-3">
          <div className="text-xs font-bold text-slate-600 flex-1">
            {grupos && grupos.length > 0 ? `${grupos.length} grupo(s) · ${totalExtras} cópia(s) a mais · marcados: ${marcados.size} (${formatCurrency(valorRemover)})` : ' '}
          </div>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer">Fechar</button>
          <button disabled={!marcados.size || busy} onClick={remover} className="px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-2 cursor-pointer">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remover {marcados.size || ''} marcado(s)
          </button>
        </div>
      </div>
    </div>
  );
};
