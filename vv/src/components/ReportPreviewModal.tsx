import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';
import type { PreviewFile } from '../utils/reportPreview';

interface Props { files: PreviewFile[]; onClose: () => void }

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const saveBlob = (f: PreviewFile) => {
  const url = URL.createObjectURL(f.blob);
  const a = document.createElement('a'); a.href = url; a.download = f.filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
};

export const ReportPreviewModal: React.FC<Props> = ({ files, onClose }) => {
  const [idx, setIdx] = useState(0);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f.blob)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const mobile = isMobile();
  const cur = files[Math.min(idx, files.length - 1)];
  const curUrl = urls[Math.min(idx, files.length - 1)];

  const baixarTodos = async () => { for (let i = 0; i < files.length; i++) { saveBlob(files[i]); if (i < files.length - 1) await new Promise((r) => setTimeout(r, 700)); } };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-6xl h-[94vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900">Conferir antes de baixar</h3>
            <p className="text-xs text-slate-500">Nada foi baixado ainda. Confira o relatório e baixe se estiver certo.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer" aria-label="Fechar"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {files.length > 1 && (
            <ul className="md:w-56 shrink-0 max-h-32 md:max-h-none overflow-y-auto border-b md:border-b-0 md:border-r border-slate-100 p-2 space-y-1 bg-slate-50/60">
              {files.map((f, i) => (
                <li key={i}>
                  <button onClick={() => setIdx(i)} className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${i === idx ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                    <FileText className="w-4 h-4 shrink-0" /><span className="truncate">{f.filename}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex-1 min-w-0 bg-slate-100">
            {mobile ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <FileText className="w-10 h-10 text-slate-400" />
                <p className="text-sm font-bold text-slate-700">{cur.filename}</p>
                <p className="text-xs text-slate-500 max-w-xs">O celular não mostra o PDF aqui dentro. Toque em "Abrir" para ver o relatório e depois volte e baixe.</p>
                <a href={curUrl} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Abrir para conferir</a>
              </div>
            ) : (
              <iframe key={curUrl} title={cur.filename} src={`${curUrl}#view=FitH`} className="w-full h-full border-0" />
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500 mr-auto">{files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}</span>
          {!mobile && <a href={curUrl} target="_blank" rel="noreferrer" className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Abrir em nova aba</a>}
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold text-xs cursor-pointer">Não baixar</button>
          {files.length > 1 && <button onClick={() => saveBlob(cur)} className="px-4 py-2.5 rounded-xl bg-white border-2 border-slate-800 text-slate-900 font-bold text-xs flex items-center gap-2 cursor-pointer"><Download className="w-4 h-4" /> Baixar só este</button>}
          <button onClick={async () => { await baixarTodos(); onClose(); }} className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"><Download className="w-4 h-4" /> {files.length > 1 ? `Baixar os ${files.length}` : 'Baixar'}</button>
        </div>
      </div>
    </div>
  );
};
