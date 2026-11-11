import React, { useRef, useState } from 'react';
import { Order, OverdueBoleto, User } from '../types';
import { formatCurrency } from '../utils/pdfGenerator';
import { safeFetch } from '../utils/apiClient';
import { X, Download, Upload, Archive, Loader2, CheckCircle2, AlertTriangle, FileJson, ShieldCheck } from 'lucide-react';

interface BackupModalProps {
  orders: Order[];
  boletos?: OverdueBoleto[];
  currentUser: User;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ARCHIVE_DAYS = 90;
const CHUNK = 25;

const todayStr = () => new Date().toISOString().split('T')[0];

function saveJson(obj: any, filename: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/** Comprime foto em base64 para 1280px / JPEG 0.7 antes de enviar ao servidor. */
function compressDataUrl(dataUrl: string, maxSide = 1280, quality = 0.7): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

interface Preview {
  resumo: any;
  fileName: string;
  orders: any[];
  boletos: any[];
  brandSellerMap?: Record<string, string>;
  comFotos: number;
}

export const BackupModal: React.FC<BackupModalProps> = ({ orders, boletos = [], currentUser, onClose, onChanged }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState('');
  const [archiveOk, setArchiveOk] = useState(false);

  const open = orders.filter((o) => o.status === 'em_aberto');
  const settled = orders.filter((o) => o.status === 'baixado');
  const openValue = open.reduce((s, o) => s + Math.max(0, o.valor - (o.valorPago || 0)), 0);
  const limit = Date.now() - ARCHIVE_DAYS * 86400000;
  const archiveCandidates = settled.filter((o) => o.dataBaixa && new Date(o.dataBaixa).getTime() < limit);

  const download = async (tipo: 'completo' | 'abertos') => {
    setBusy(tipo); setMsg(null);
    try {
      const res = await fetch(`/api/backup/export?tipo=${tipo}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Erro ${res.status}`);
      const data = await res.json();
      saveJson(data, tipo === 'completo' ? `Backup_Pedidos_VV_${todayStr()}.json` : `Backup_Em_Aberto_VV_${todayStr()}.json`);
      try { localStorage.setItem('vv_last_backup_reminder_date', todayStr()); } catch {}
      setMsg({ type: 'ok', text: `Backup ${tipo === 'completo' ? 'completo' : 'só com os pedidos em aberto'} baixado (${data.orders?.length ?? 0} pedidos, ${data.boletos?.length ?? 0} boletos).` });
    } catch (e: any) {
      setMsg({ type: 'err', text: `Não foi possível gerar o backup: ${e?.message || e}` });
    } finally { setBusy(null); }
  };

  const onFile = async (file: File) => {
    setMsg(null); setPreview(null);
    if (file.size > MAX_FILE_BYTES) return setMsg({ type: 'err', text: 'Arquivo maior que 50 MB. Use o backup só com pedidos em aberto.' });
    setBusy('lendo');
    try {
      const parsed = JSON.parse(await file.text());
      const ords: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.orders) ? parsed.orders : null as any;
      if (!ords) throw new Error('o arquivo não tem a lista "orders". Use um backup gerado por este sistema.');
      const bols: any[] = Array.isArray(parsed?.boletos) ? parsed.boletos : [];
      const comFotos = ords.filter((o) => typeof o?.imageUrl === 'string' && o.imageUrl.startsWith('data:image/')).length;
      // prévia sem fotos (leve): o servidor compara com o que já existe e só conta
      const light = ords.map((o) => { const c = { ...o }; delete c.imageUrl; return c; });
      const res = await safeFetch<any>('/api/backup/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: light, boletos: bols, dryRun: true }), silent: true, retries: 0, timeoutMs: 60000,
      });
      if (!res.ok || !res.data?.resumo) throw new Error(res.error || 'falha ao analisar o arquivo.');
      setPreview({ resumo: res.data.resumo, fileName: file.name, orders: ords, boletos: bols, brandSellerMap: parsed?.brandSellerMap, comFotos });
    } catch (e: any) {
      setMsg({ type: 'err', text: `Arquivo não aceito: ${e?.message || e}` });
    } finally { setBusy(null); }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setBusy('importando'); setMsg(null);
    try {
      let totals = { novos: 0, atualizados: 0, fotos: 0, fotosIgn: 0, erros: 0 };
      const all = preview.orders;
      for (let i = 0; i < all.length; i += CHUNK) {
        setProgress(`Importando ${Math.min(i + CHUNK, all.length)} de ${all.length} pedidos...`);
        const slice = [];
        for (const o of all.slice(i, i + CHUNK)) {
          const c = { ...o };
          if (typeof c.imageUrl === 'string' && c.imageUrl.startsWith('data:image/') && c.status !== 'baixado') {
            const small = await compressDataUrl(c.imageUrl);
            if (small) c.imageUrl = small; else delete c.imageUrl;
          } else delete c.imageUrl; // baixados não guardam foto; URLs antigas não servem
          slice.push(c);
        }
        const first = i === 0;
        const res = await safeFetch<any>('/api/backup/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders: slice, boletos: first ? preview.boletos : [], brandSellerMap: first ? preview.brandSellerMap : undefined }),
          retries: 1, timeoutMs: 120000, actionType: 'backup_import', actionDescription: 'Importação de backup',
        });
        if (!res.ok) throw new Error(res.error || 'o servidor recusou parte do arquivo');
        const r = res.data?.resumo || {};
        totals.novos += r.pedidosNovos || 0; totals.atualizados += r.pedidosAtualizados || 0;
        totals.fotos += r.fotosImportadas || 0; totals.fotosIgn += r.fotosIgnoradas || 0; totals.erros += (r.erros || []).length;
      }
      if (all.length === 0 && preview.boletos.length) {
        await safeFetch('/api/backup/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orders: [], boletos: preview.boletos }), retries: 1 });
      }
      setMsg({ type: 'ok', text: `Importação concluída: ${totals.novos} pedidos novos, ${totals.atualizados} atualizados, ${totals.fotos} fotos salvas${totals.erros ? `, ${totals.erros} registros ignorados por erro` : ''}.` });
      setPreview(null);
      await onChanged?.();
    } catch (e: any) {
      setMsg({ type: 'err', text: `A importação parou: ${e?.message || e}. Nada foi apagado; você pode importar de novo o mesmo arquivo.` });
      await onChanged?.();
    } finally { setBusy(null); setProgress(''); }
  };

  const archiveNow = async () => {
    if (!archiveOk || archiveCandidates.length === 0) return;
    setBusy('arquivando'); setMsg(null);
    try {
      saveJson(
        { app: 'Gestao VV', version: '2.0', tipo: 'arquivo_baixados', exportedAt: new Date().toISOString(), exportedBy: currentUser.name, totalOrders: archiveCandidates.length, orders: archiveCandidates },
        `Arquivo_Baixados_VV_${todayStr()}.json`
      );
      const res = await safeFetch<any>('/api/orders/archive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: archiveCandidates.map((o) => o.id), confirm: true }), retries: 0, timeoutMs: 60000,
      });
      if (!res.ok) throw new Error(res.error || 'falha no servidor');
      setMsg({ type: 'ok', text: `${res.data?.archived ?? 0} pedidos baixados foram arquivados (o arquivo JSON foi baixado antes).` });
      setArchiveOk(false);
      await onChanged?.();
    } catch (e: any) {
      setMsg({ type: 'err', text: `Não foi possível arquivar: ${e?.message || e}` });
    } finally { setBusy(null); }
  };

  const r = preview?.resumo;
  const btn = 'px-4 py-2.5 font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Backup e Restauração</h2>
              <p className="text-xs text-slate-300">Somente Gestão Total. Fotos e PDFs não entram nos arquivos de backup.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><div className="text-lg font-black text-slate-900">{orders.length}</div><div className="text-[11px] font-bold text-slate-500">pedidos no sistema</div></div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200"><div className="text-lg font-black text-amber-800">{open.length}</div><div className="text-[11px] font-bold text-amber-700">em aberto ({formatCurrency(openValue)})</div></div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><div className="text-lg font-black text-emerald-800">{settled.length}</div><div className="text-[11px] font-bold text-emerald-700">baixados · {boletos.length} boletos</div></div>
          </div>

          {msg && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-start gap-2 ${msg.type === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-red-50 border border-red-200 text-red-900'}`}>
              {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-black text-slate-800">1. Fazer backup</h3>
            <div className="flex flex-wrap gap-2">
              <button disabled={!!busy} onClick={() => download('completo')} className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`}>
                {busy === 'completo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Backup completo
              </button>
              <button disabled={!!busy} onClick={() => download('abertos')} className={`${btn} bg-white hover:bg-slate-50 text-slate-800 border border-slate-300`}>
                {busy === 'abertos' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />} Só pedidos e boletos em aberto
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-black text-slate-800">2. Importar backup (.json até 50 MB)</h3>
            <p className="text-xs text-slate-500">Aceita o backup completo e o diário. Antes de gravar você vê um resumo. Pedido baixado nunca é reaberto e o valor pago nunca diminui.</p>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
            <button disabled={!!busy} onClick={() => fileRef.current?.click()} className={`${btn} bg-slate-800 hover:bg-slate-700 text-white`}>
              {busy === 'lendo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Escolher arquivo
            </button>

            {preview && r && (
              <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/50 space-y-3">
                <p className="text-xs font-black text-blue-900">Resumo de {preview.fileName}</p>
                <ul className="text-xs text-slate-800 grid grid-cols-2 gap-x-4 gap-y-1 font-semibold">
                  <li>Pedidos novos: <b>{r.pedidosNovos}</b></li>
                  <li>Pedidos que serão atualizados: <b>{r.pedidosAtualizados}</b></li>
                  <li>Pedidos já iguais: <b>{r.pedidosIguais}</b></li>
                  <li>Baixas preservadas (não reabre): <b>{r.pedidosBaixadosPreservados}</b></li>
                  <li>Boletos novos: <b>{r.boletosNovos}</b></li>
                  <li>Boletos atualizados: <b>{r.boletosAtualizados}</b></li>
                  <li>Fotos no arquivo: <b>{preview.comFotos}</b></li>
                  <li>Registros inválidos: <b>{(r.erros || []).length}</b></li>
                </ul>
                {(r.erros || []).length > 0 && <p className="text-[11px] text-red-700">{r.erros.slice(0, 3).join(' · ')}</p>}
                <div className="flex gap-2">
                  <button disabled={!!busy} onClick={confirmImport} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                    {busy === 'importando' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirmar importação
                  </button>
                  <button disabled={!!busy} onClick={() => setPreview(null)} className={`${btn} bg-white text-slate-700 border border-slate-300`}>Cancelar</button>
                </div>
                {progress && <p className="text-xs font-bold text-blue-800">{progress}</p>}
              </div>
            )}
          </section>

          <section className="space-y-2 pt-3 border-t border-slate-200">
            <h3 className="text-sm font-black text-slate-800">3. Arquivar baixados antigos (mais de {ARCHIVE_DAYS} dias)</h3>
            <p className="text-xs text-slate-500">Libera espaço na nuvem. O arquivo JSON desses pedidos é baixado primeiro; depois eles saem do sistema. O histórico de baixas (livro-razão) continua guardado.</p>
            <p className="text-xs font-bold text-slate-700">{archiveCandidates.length} pedido(s) baixado(s) há mais de {ARCHIVE_DAYS} dias.</p>
            {archiveCandidates.length > 0 && (
              <>
                <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={archiveOk} onChange={(e) => setArchiveOk(e.target.checked)} className="mt-0.5" />
                  Entendo que esses {archiveCandidates.length} pedidos serão removidos do sistema depois do download do arquivo.
                </label>
                <button disabled={!archiveOk || !!busy} onClick={archiveNow} className={`${btn} bg-amber-500 hover:bg-amber-600 text-amber-950`}>
                  {busy === 'arquivando' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />} Baixar arquivo e arquivar
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
