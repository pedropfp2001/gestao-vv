import React, { useEffect, useState } from 'react';
import { Loader2, Play, Settings2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Janela { inicio: number; fim: number }
interface Status {
  ativo: boolean; total: number; lidos: number; pendentes: number; rodando: boolean; fila: number; feitos: number;
  ultimaExecucao: string | null; lidosNaUltima: number; motivo: string; naJanela: boolean;
  usoHoje: number; limiteDia: number; esgotado: boolean; chaveSeparada: boolean;
  config: { semana: Janela; sabado: Janela; domingo: boolean; limiteDia: number };
}

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—');

export const PreleituraPainel: React.FC = () => {
  const [st, setSt] = useState<Status | null>(null);
  const [erro, setErro] = useState(false);
  const [editando, setEditando] = useState(false);
  const [cfg, setCfg] = useState<Status['config'] | null>(null);
  const [salvando, setSalvando] = useState(false);

  const load = async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const r = await fetch('/api/prefetch/status', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setSt(await r.json()); setErro(false);
    } catch { setErro(true); }
  };
  useEffect(() => { void load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const lerAgora = async () => { await fetch('/api/prefetch/run', { method: 'POST' }); setTimeout(load, 600); };
  const salvar = async () => {
    if (!cfg) return; setSalvando(true);
    try { await fetch('/api/prefetch/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) }); setEditando(false); await load(); }
    finally { setSalvando(false); }
  };

  if (erro && !st) return null;
  if (!st) return <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pré-leitura…</div>;

  const pct = st.total ? Math.round((st.lidos / st.total) * 100) : 100;
  const rodadaPct = st.fila ? Math.round((st.feitos / st.fila) * 100) : 0;
  const num = 'w-12 px-1.5 py-1 border border-slate-300 rounded-md text-xs text-center bg-white';
  const setJ = (k: 'semana' | 'sabado', f: 'inicio' | 'fim', v: string) => setCfg((c) => (c ? { ...c, [k]: { ...c[k], [f]: Number(v) } } : c));

  return (
    <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2" title="Visível só para o seu usuário">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Pré-leitura (mercadorias)</h4>
        <button onClick={() => { setCfg(st.config); setEditando((v) => !v); }} className="p-1 rounded-md hover:bg-slate-200 cursor-pointer" aria-label="Horários"><Settings2 className="w-3.5 h-3.5 text-slate-500" /></button>
      </div>

      {!st.ativo ? (
        <p className="text-[11px] font-bold text-amber-800 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> IA desligada (falta a chave do Gemini no Render).</p>
      ) : (
        <>
          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-700 mb-1"><span>{st.lidos} de {st.total} prontos</span><span>{pct}%</span></div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-emerald-600 transition-all duration-500" style={{ width: `${pct}%` }} /></div>
          </div>
          {st.rodando ? (
            <div>
              <p className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo agora: {st.feitos} de {st.fila}</p>
              <div className="h-1 mt-1 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${rodadaPct}%` }} /></div>
            </div>
          ) : st.pendentes === 0 ? (
            <p className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Tudo pronto. Os relatórios saem na hora.</p>
          ) : (
            <p className="text-[11px] text-slate-600">{st.naJanela ? `Faltam ${st.pendentes}. A próxima rodada é automática (a cada 10 min).` : `Faltam ${st.pendentes}. Fora do horário automático.`}</p>
          )}
          {st.motivo && <p className="text-[11px] font-bold text-amber-800 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>Parou: {st.motivo}</span></p>}
          <div>
            <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1"><span>Leituras de hoje</span><span>{st.usoHoje} de {st.limiteDia}</span></div>
            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className={`h-full transition-all ${st.usoHoje >= st.limiteDia || st.esgotado ? 'bg-amber-500' : 'bg-slate-500'}`} style={{ width: `${Math.min(100, st.limiteDia ? Math.round((st.usoHoje / st.limiteDia) * 100) : 100)}%` }} /></div>
            <p className="text-[10px] text-slate-400 mt-1">{st.chaveSeparada ? 'Chave própria dos relatórios: o lançamento por IA não é afetado.' : 'Usa a mesma chave do lançamento por IA.'}</p>
          </div>
          {st.esgotado && <p className="text-[11px] font-bold text-amber-800 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>O Gemini avisou que o limite do dia acabou. A pré-leitura volta amanhã.</span></p>}
          <p className="text-[10px] text-slate-400">Última rodada: {hhmm(st.ultimaExecucao)}{st.ultimaExecucao ? ` (${st.lidosNaUltima} lidos)` : ''}</p>
          <button disabled={st.rodando || st.pendentes === 0} onClick={lerAgora} className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40 text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"><Play className="w-3 h-3" /> Ler agora</button>
        </>
      )}

      {editando && cfg && (
        <div className="pt-2 border-t border-slate-200 space-y-2 text-[11px] text-slate-700">
          <p className="font-bold">Horário automático (hora cheia)</p>
          <div className="flex items-center gap-1.5">Seg–sex: <input className={num} type="number" min={0} max={23} value={cfg.semana.inicio} onChange={(e) => setJ('semana', 'inicio', e.target.value)} /> às <input className={num} type="number" min={0} max={23} value={cfg.semana.fim} onChange={(e) => setJ('semana', 'fim', e.target.value)} /> h</div>
          <div className="flex items-center gap-1.5">Sábado: <input className={num} type="number" min={0} max={23} value={cfg.sabado.inicio} onChange={(e) => setJ('sabado', 'inicio', e.target.value)} /> às <input className={num} type="number" min={0} max={23} value={cfg.sabado.fim} onChange={(e) => setJ('sabado', 'fim', e.target.value)} /> h</div>
          <div className="flex items-center gap-1.5">Teto por dia: <input className={num} type="number" min={0} max={2000} value={cfg.limiteDia} onChange={(e) => setCfg({ ...cfg, limiteDia: Number(e.target.value) })} /> leituras</div>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={cfg.domingo} onChange={(e) => setCfg({ ...cfg, domingo: e.target.checked })} /> Rodar também no domingo</label>
          <button onClick={salvar} disabled={salvando} className="w-full px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold cursor-pointer disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar horários'}</button>
        </div>
      )}
    </div>
  );
};
