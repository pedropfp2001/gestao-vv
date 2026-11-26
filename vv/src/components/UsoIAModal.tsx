import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';

interface Origem { chamadas: number; ok: number; f429: number; f503: number; fOutros: number; tokensIn: number; tokensOut: number }
interface Dia { dia: string; origens: Record<string, Origem> }
interface Dados { dias: Dia[]; hoje: string; limiteDia: number; contadorHoje: number; esgotado: boolean; chaveSeparada: boolean }

const ORIGENS: { id: string; nome: string; cor: string }[] = [
  { id: 'lancamento', nome: 'Lançamento por IA', cor: '#2563eb' },
  { id: 'ao_lancar', nome: 'Leitura ao lançar', cor: '#059669' },
  { id: 'preleitura', nome: 'Pré-leitura', cor: '#d97706' },
  { id: 'relatorio', nome: 'Relatórios (na hora)', cor: '#7c3aed' },
];
const vazio = (): Origem => ({ chamadas: 0, ok: 0, f429: 0, f503: 0, fOutros: 0, tokensIn: 0, tokensOut: 0 });
const fmt = (n: number) => n.toLocaleString('pt-BR');
const ddmm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const tokensDe = (o?: Origem) => (o ? o.tokensIn + o.tokensOut : 0);

export const UsoIAModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [metrica, setMetrica] = useState<'chamadas' | 'tokens'>('chamadas');
  const [periodo, setPeriodo] = useState<14 | 30>(14);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/ai-usage', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || 'Não foi possível carregar.');
        setD(j);
      } catch (e: any) { setErro(e?.message || 'Não foi possível carregar.'); }
    })();
  }, []);

  const dias = useMemo(() => (d ? d.dias.slice(-periodo) : []), [d, periodo]);
  const valor = (o?: Origem) => (metrica === 'chamadas' ? o?.chamadas || 0 : tokensDe(o));
  const totalDia = (x: Dia) => ORIGENS.reduce((s, o) => s + valor(x.origens[o.id]), 0);
  const maxV = Math.max(1, ...dias.map(totalDia));

  const somar = (lista: Dia[]) => {
    const t = vazio();
    lista.forEach((x) => Object.values(x.origens).forEach((o) => {
      t.chamadas += o.chamadas; t.ok += o.ok; t.f429 += o.f429; t.f503 += o.f503; t.fOutros += o.fOutros; t.tokensIn += o.tokensIn; t.tokensOut += o.tokensOut;
    }));
    return t;
  };
  const hojeDia = d?.dias.find((x) => x.dia === d.hoje);
  const hoje = somar(hojeDia ? [hojeDia] : []);
  const per = somar(dias);

  let frase = '';
  if (d) {
    if (d.esgotado) frase = 'O Gemini avisou que o limite do dia acabou. A pré-leitura e a leitura ao lançar voltam amanhã.';
    else if (hoje.f429 > 0) frase = `Hoje o Gemini recusou ${hoje.f429} chamada(s) por limite de uso.`;
    else if (hoje.f503 > 0) frase = `Hoje: ${fmt(hoje.chamadas)} chamadas. ${hoje.f503} falha(s) por sobrecarga do Google (instabilidade dele, não é o seu limite).`;
    else if (hoje.chamadas === 0) frase = 'Hoje ainda não houve nenhuma chamada à IA.';
    else frase = `Hoje: ${fmt(hoje.chamadas)} chamadas, tudo normal.`;
  }

  // gráfico
  const W = 640, H = 220, PL = 40, PB = 26, PT = 10, PR = 8;
  const bw = dias.length ? (W - PL - PR) / dias.length : 0;
  const escalaY = (v: number) => PT + (H - PT - PB) * (1 - v / maxV);
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxV * f));

  // fora do menu lateral (que fica "grudado" e criaria uma camada abaixo do cabeçalho)
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">Uso da IA (Gemini)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Só o que este sistema usou, desde que o medidor foi ligado. O painel do Google pode mostrar mais se a chave for usada em outros lugares.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Fechar"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!d && !erro && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>}
          {erro && <p className="text-sm font-bold text-red-700">{erro}</p>}
          {d && (
            <>
              <p className={`text-sm font-bold rounded-xl px-4 py-3 ${d.esgotado || hoje.f429 > 0 ? 'bg-red-50 text-red-800' : hoje.f503 > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>{frase}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[
                  ['Chamadas hoje', fmt(hoje.chamadas)],
                  ['Tokens hoje', fmt(hoje.tokensIn + hoje.tokensOut)],
                  ['Teto da pré-leitura', `${d.contadorHoje} de ${d.limiteDia}`],
                  ['Chave dos relatórios', d.chaveSeparada ? 'própria' : 'a mesma'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k}</div>
                    <div className="text-base font-black text-slate-900 tabular-nums">{v}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2 text-xs font-bold">
                  <span className="text-slate-600">Mostrar:</span>
                  {(['chamadas', 'tokens'] as const).map((m) => (
                    <button key={m} onClick={() => setMetrica(m)} className={`px-3 py-1.5 rounded-lg cursor-pointer ${metrica === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{m === 'chamadas' ? 'Chamadas' : 'Tokens'}</button>
                  ))}
                  <span className="ml-auto flex gap-2">
                    {([14, 30] as const).map((p) => (
                      <button key={p} onClick={() => setPeriodo(p)} className={`px-3 py-1.5 rounded-lg cursor-pointer ${periodo === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{p} dias</button>
                    ))}
                  </span>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Uso da IA por dia, em ${metrica}`}>
                  {ticks.map((t) => (
                    <g key={t}>
                      <line x1={PL} x2={W - PR} y1={escalaY(t)} y2={escalaY(t)} stroke="#e2e8f0" strokeWidth="1" />
                      <text x={PL - 6} y={escalaY(t) + 3} textAnchor="end" fontSize="10" fill="#64748b">{fmt(t)}</text>
                    </g>
                  ))}
                  {dias.map((x, i) => {
                    let acc = 0;
                    const bx = PL + i * bw + bw * 0.15, w = bw * 0.7;
                    return (
                      <g key={x.dia}>
                        <title>{`${ddmm(x.dia)}: ${ORIGENS.map((o) => `${o.nome} ${fmt(valor(x.origens[o.id]))}`).join(' · ')}`}</title>
                        {ORIGENS.map((o) => {
                          const v = valor(x.origens[o.id]);
                          if (!v) return null;
                          const y1 = escalaY(acc + v), y0 = escalaY(acc);
                          acc += v;
                          return <rect key={o.id} x={bx} y={y1} width={w} height={Math.max(0, y0 - y1)} fill={o.cor} />;
                        })}
                        {(dias.length <= 14 || i % 2 === 0) && <text x={bx + w / 2} y={H - 8} textAnchor="middle" fontSize="9.5" fill="#64748b">{ddmm(x.dia)}</text>}
                      </g>
                    );
                  })}
                </svg>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] font-bold text-slate-600">
                  {ORIGENS.map((o) => <span key={o.id} className="flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: o.cor }} />{o.nome}</span>)}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 pr-2 font-bold">Origem</th>
                      <th className="py-1.5 px-2 font-bold text-right">Chamadas hoje</th>
                      <th className="py-1.5 px-2 font-bold text-right">Tokens hoje</th>
                      <th className="py-1.5 px-2 font-bold text-right">Chamadas ({periodo} dias)</th>
                      <th className="py-1.5 pl-2 font-bold text-right">Tokens ({periodo} dias)</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {ORIGENS.map((o) => {
                      const h = hojeDia?.origens[o.id];
                      const p = somar(dias.map((x) => ({ dia: x.dia, origens: x.origens[o.id] ? { [o.id]: x.origens[o.id] } : {} })));
                      return (
                        <tr key={o.id} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2 font-bold text-slate-800">{o.nome}</td>
                          <td className="py-1.5 px-2 text-right">{fmt(h?.chamadas || 0)}</td>
                          <td className="py-1.5 px-2 text-right">{fmt(tokensDe(h))}</td>
                          <td className="py-1.5 px-2 text-right">{fmt(p.chamadas)}</td>
                          <td className="py-1.5 pl-2 text-right">{fmt(p.tokensIn + p.tokensOut)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-700 space-y-1">
                <p className="font-black text-slate-900">Falhas nos últimos {periodo} dias</p>
                <p><b>{fmt(per.f429)}</b> por limite de uso (429): é o seu limite acabando.</p>
                <p><b>{fmt(per.f503)}</b> por sobrecarga (503): instabilidade do Google, pagar não resolve.</p>
                <p><b>{fmt(per.fOutros)}</b> outras (chave recusada, tempo esgotado etc.).</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
