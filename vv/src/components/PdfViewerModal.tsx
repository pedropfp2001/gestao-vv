import React, { useState } from 'react';
import { X, Download, ExternalLink, FileText, Share2, Check } from 'lucide-react';
import { shareRemotePdfFile } from '../utils/shareUtils';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  pdfUrl: string;
  fileName?: string;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  title,
  pdfUrl,
  fileName = 'documento.pdf',
}) => {
  const [sharing, setSharing] = useState(false);

  if (!isOpen || !pdfUrl) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareWhatsApp = async () => {
    setSharing(true);
    try {
      await shareRemotePdfFile(pdfUrl, fileName, `Documento: ${title} - Distribuidora Traviu`);
    } catch (err) {
      console.error('Erro ao compartilhar PDF:', err);
    } finally {
      setSharing(false);
    }
  };

  const handleOpenNewTab = () => {
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/30 text-red-300 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">{title}</h3>
              <p className="text-xs text-slate-300 truncate max-w-md">{fileName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              disabled={sharing}
              title="Enviar PDF pelo WhatsApp / Compartilhar"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold shadow-xs"
            >
              <Share2 className="w-4 h-4" />
              <span>{sharing ? 'Enviando...' : 'Enviar no WhatsApp'}</span>
            </button>
            <button
              onClick={handleDownload}
              title="Baixar PDF"
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Baixar</span>
            </button>
            <button
              onClick={handleOpenNewTab}
              title="Abrir em Nova Aba"
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Expandir</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content viewer */}
        <div className="flex-1 bg-slate-100 p-2 min-h-[500px]">
          <iframe
            src={pdfUrl.includes('?') ? `${pdfUrl}&_t=${Date.now()}` : `${pdfUrl}?_t=${Date.now()}`}
            title={title}
            className="w-full h-full min-h-[550px] rounded-xl border border-slate-300 bg-white"
          />
        </div>

        {/* Footer */}
        <div className="p-3 px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Visualizador de PDF - Distribuidora Traviu</span>
            <span className="text-slate-300">•</span>
            <button
              onClick={handleShareWhatsApp}
              className="text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1"
            >
              <Share2 className="w-3.5 h-3.5" />
              Enviar este PDF via WhatsApp
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

