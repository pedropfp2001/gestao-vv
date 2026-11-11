import React, { useState, useEffect } from 'react';
import {
  FileWarning,
  Plus,
  Search,
  Download,
  FileText,
  UserCheck,
  CheckCircle,
  Eye,
  Trash2,
  Edit2,
  Calendar,
  AlertTriangle,
  FileCheck,
  Share2,
  Send,
  Layers,
  Files,
  Loader2,
  Table as TableIcon,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { OverdueBoleto, User } from '../types';
import {
  formatCurrency,
  formatDateBR,
  generateOverdueBoletosGridPDF,
  computeBoletoDiasAtraso,
  getFreshestBoletos,
  isBoletoOpen,
  sortBoletosByOldestOverdue,
  parseBoletoDateToTimestamp,
} from '../utils/pdfGenerator';
import { shareRemotePdfFile, shareMultiplePdfFiles } from '../utils/shareUtils';
import { safeFetch } from '../utils/apiClient';
import { matchesBoletoSearch } from '../utils/searchHelper';
import { BoletoUploadModal } from './BoletoUploadModal';
import { BoletoBatchUploadModal } from './BoletoBatchUploadModal';
import { PdfViewerModal } from './PdfViewerModal';
import { BoletosReportModal } from './BoletosReportModal';

interface BoletosViewProps {
  currentUser: User;
  onUpdateBoletos?: () => void;
  initialBoletos?: OverdueBoleto[];
}

export const BoletosView: React.FC<BoletosViewProps> = ({
  currentUser,
  onUpdateBoletos,
  initialBoletos,
}) => {
  const isGestao = currentUser?.role === 'admin';
  const [boletos, setBoletos] = useState<OverdueBoleto[]>(() => (initialBoletos && initialBoletos.length > 0 ? initialBoletos : []));
  const [loading, setLoading] = useState(() => boletos.length === 0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [search, setSearch] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');
  const [sortOrder, setSortOrder] = useState<'oldest' | 'newest'>('oldest');

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isBatchUploadOpen, setIsBatchUploadOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [editingBoleto, setEditingBoleto] = useState<OverdueBoleto | null>(null);

  // PDF Viewer Modal
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfModalTitle, setPdfModalTitle] = useState('');
  const [pdfModalUrl, setPdfModalUrl] = useState('');
  const [pdfModalFileName, setPdfModalFileName] = useState('');

  // Synchronize if parent provides fresh boletos
  useEffect(() => {
    if (initialBoletos && initialBoletos.length > 0) {
      setBoletos(initialBoletos);
    }
  }, [initialBoletos]);

  // Fetch boletos from server and reconcile with fresh calculation
  const fetchBoletos = async () => {
    try {
      const fresh = await getFreshestBoletos(boletos);
      setBoletos(fresh);
      onUpdateBoletos?.();
    } catch (err) {
      console.error('Erro ao buscar boletos em atraso:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoletos();
  }, []);

  const handleExportPDF = async (action: 'download' | 'share' = 'download') => {
    setExportingPdf(true);
    try {
      const freshBoletos = await getFreshestBoletos(boletos);
      setBoletos(freshBoletos);
      const openOnly = freshBoletos.filter(isBoletoOpen);
      await generateOverdueBoletosGridPDF(openOnly, action);
    } catch (err) {
      console.error('Erro ao exportar relatório de boletos:', err);
      alert('Erro ao gerar relatório em PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  };

  const getCacheBustedUrl = (url: string) => {
    if (!url) return '';
    return url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
  };

  const handleOpenPdf = (title: string, url: string, fileName?: string) => {
    setPdfModalTitle(title);
    setPdfModalUrl(getCacheBustedUrl(url));
    setPdfModalFileName(fileName || 'documento.pdf');
    setPdfModalOpen(true);
  };

  const handleBoletoSaved = (saved: OverdueBoleto) => {
    if (!saved || !saved.id) {
      fetchBoletos();
      setIsUploadOpen(false);
      setEditingBoleto(null);
      return;
    }
    setBoletos((prev) => {
      const safe = Array.isArray(prev) ? prev : [];
      const index = safe.findIndex((b) => b.id === saved.id);
      let next: OverdueBoleto[];
      if (index >= 0) {
        next = [...safe];
        next[index] = saved;
      } else {
        next = [saved, ...safe];
      }
      return next;
    });
    setIsUploadOpen(false);
    setEditingBoleto(null);
    onUpdateBoletos?.();
  };

  const handleBatchBoletoSaved = (newBoletos?: OverdueBoleto[]) => {
    if (Array.isArray(newBoletos) && newBoletos.length > 0) {
      setBoletos((prev) => {
        const safe = Array.isArray(prev) ? prev : [];
        const newIds = new Set(newBoletos.map((b) => b.id));
        const filtered = safe.filter((b) => !newIds.has(b.id));
        const next = [...newBoletos, ...filtered];
        return next;
      });
    } else {
      fetchBoletos();
    }
    setIsBatchUploadOpen(false);
    onUpdateBoletos?.();
  };

  const handleBaixa = async (boleto: OverdueBoleto) => {
    if (
      !window.confirm(
        `Deseja confirmar a BAIXA do boleto da marca ${boleto.marca} no valor de ${formatCurrency(
          boleto.valor
        )}?\n\n(Os arquivos em PDF serão excluídos do sistema e o registro da quitação será gravado no Histórico de Baixas).`
      )
    ) {
      return;
    }

    try {
      const res = await safeFetch(`/api/boletos/${boleto.id}/baixa`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baixadoPor: currentUser?.name || 'Admin',
          observacaoBaixa: 'Baixa confirmada no sistema de boletos (PDFs removidos).',
        }),
        actionType: 'boleto_baixa',
        referenceId: boleto.id,
        cliente: boleto.marca,
        valor: boleto.valor,
        actionDescription: `Baixa de Boleto #${boleto.indexNum || boleto.id} (${boleto.marca})`,
      });

      if (res.ok) {
        await fetchBoletos();
        onUpdateBoletos?.();
      } else {
        alert(`❌ Não foi possível registrar a baixa do boleto: ${res.error || 'erro no servidor'}. Nada foi alterado; tente novamente.`);
      }
    } catch (err) {
      console.error('Erro na baixa:', err);
    }
  };

  const handleShareNF = async (b: OverdueBoleto) => {
    if (!b.pdfNFUrl) return;
    const msg = `*Distribuidora de Frutas Traviu*\n📄 *Nota Fiscal*\n*Marca:* ${b.marca}\n*Número NF:* ${b.numeroNF || 'S/N'}\n*Valor:* ${formatCurrency(b.valor)}`;
    await shareRemotePdfFile(getCacheBustedUrl(b.pdfNFUrl), b.pdfNFName || `NF_${b.marca}_${b.numeroNF || 'doc'}.pdf`, msg);
  };

  const handleShareBoleto = async (b: OverdueBoleto) => {
    if (!b.pdfBoletoUrl) return;
    const msg = `*Distribuidora de Frutas Traviu*\n💳 *Boleto Bancário*\n*Marca:* ${b.marca}\n*Vencimento:* ${formatDateBR(b.data)}\n*Valor:* ${formatCurrency(b.valor)}`;
    await shareRemotePdfFile(getCacheBustedUrl(b.pdfBoletoUrl), b.pdfBoletoName || `Boleto_${b.marca}.pdf`, msg);
  };

  const handleShareBothDocuments = async (b: OverdueBoleto) => {
    const filesToShare: Array<{ url: string; filename: string }> = [];
    if (b.pdfNFUrl) {
      filesToShare.push({
        url: getCacheBustedUrl(b.pdfNFUrl),
        filename: b.pdfNFName || `NF_${b.marca}.pdf`,
      });
    }
    if (b.pdfBoletoUrl) {
      filesToShare.push({
        url: getCacheBustedUrl(b.pdfBoletoUrl),
        filename: b.pdfBoletoName || `Boleto_${b.marca}.pdf`,
      });
    }

    if (filesToShare.length === 0) return;

    const msg = `*Distribuidora de Frutas Traviu*\n📑 *Cobrança / Documentos*\n*Marca:* ${b.marca}\n*Valor:* ${formatCurrency(b.valor)}\n*Vencimento:* ${formatDateBR(b.data)}\n\nSeguem anexos da Nota Fiscal e Boleto Bancário.`;
    await shareMultiplePdfFiles(filesToShare, msg);
  };

  const handleDelete = async (boleto: OverdueBoleto) => {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir o boleto #${boleto.indexNum || boleto.id} da marca ${
          boleto.marca
        }?`
      )
    ) {
      return;
    }

    try {
      const res = await safeFetch(`/api/boletos/${boleto.id}`, {
        method: 'DELETE',
        actionDescription: `Exclusão de Boleto #${boleto.indexNum || boleto.id} (${boleto.marca})`,
        referenceId: boleto.id,
        cliente: boleto.marca,
      });

      if (res.ok) {
        await fetchBoletos();
        onUpdateBoletos?.();
      } else {
        alert('Não foi possível excluir o boleto. Nada foi alterado; tente novamente.');
      }
    } catch (err) {
      console.error('Erro ao deletar:', err);
    }
  };

  // Filter items (hides paid boletos from the list - they are kept exclusively in the Settlement History)
  const openBoletos = boletos.filter(isBoletoOpen);

  const filteredBoletos = openBoletos.filter((b) => {
    const matchSearch = matchesBoletoSearch(b, search);
    const matchVendedor =
      vendedorFilter === 'todos' ||
      (b.vendedor && b.vendedor.trim().toLowerCase() === vendedorFilter.trim().toLowerCase());

    return matchSearch && matchVendedor;
  });

  // Sort boletos: from oldest overdue (earliest due date / highest delay) to most recent
  const sortedBoletos = sortBoletosByOldestOverdue(filteredBoletos, sortOrder);

  // Calculate Metrics
  const totalEmAtraso = openBoletos.reduce((sum, b) => sum + (b.valor || 0), 0);
  const totalTitulosAbertos = openBoletos.length;
  const uniqueBrands = new Set(openBoletos.map((b) => b.marca));
  const totalMarcasDevedoras = uniqueBrands.size;
  const avgDiasAtraso =
    totalTitulosAbertos > 0
      ? Math.round(
          openBoletos.reduce(
            (sum, b) => sum + computeBoletoDiasAtraso(b.data, b.situacao, b.dataBaixa),
            0
          ) / totalTitulosAbertos
        )
      : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-red-950 via-red-900 to-red-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 text-white shadow-xl border border-red-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1 sm:space-y-2">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-red-800/80 border border-red-700 text-red-200 text-[10px] sm:text-xs font-bold uppercase tracking-wider">
              <FileWarning className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-300" />
              Controle de Boletos Vencidos
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight">
              Boletos em Atraso
            </h1>
            <p className="text-xs sm:text-sm text-red-200 max-w-2xl hidden sm:block">
              Lançamento manual de boletos em atraso com anexo de 2 PDFs (Nota Fiscal e Boleto Bancário) e controle de baixas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {boletos.length > 0 && (
              <>
                <button
                  onClick={() => setIsReportModalOpen(true)}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl sm:rounded-2xl font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all shadow-xs active:scale-95 cursor-pointer"
                  title="Visualizar Grade Analítica de Boletos por Marca"
                >
                  <TableIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-200" />
                  <span>Grade Analítica</span>
                </button>

                <button
                  onClick={() => handleExportPDF('download')}
                  disabled={exportingPdf}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl sm:rounded-2xl font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                  title="Baixar Relatório de Boletos em Atraso em PDF (sempre atualizado)"
                >
                  {exportingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-200 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-200" />
                  )}
                  <span>Exportar PDF</span>
                </button>

                <button
                  onClick={() => handleExportPDF('share')}
                  disabled={exportingPdf}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-700/80 hover:bg-emerald-600 border border-emerald-500/50 text-white rounded-xl sm:rounded-2xl font-bold text-xs flex items-center gap-1.5 sm:gap-2 transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                  title="Enviar Relatório Geral de Boletos no WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-200" />
                  <span className="hidden sm:inline">Enviar no WhatsApp</span>
                  <span className="sm:hidden">WhatsApp</span>
                </button>
              </>
            )}

            {isGestao && (
              <>
            <button
              onClick={() => setIsBatchUploadOpen(true)}
              className="px-3 sm:px-4 py-2 sm:py-2.5 bg-white/15 hover:bg-white/25 border border-white/30 text-white rounded-xl sm:rounded-2xl font-black text-xs flex items-center gap-1.5 sm:gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
              title="Carregar múltiplos PDFs de boletos e notas fiscais de uma só vez (sem IA)"
            >
              <Files className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-200" />
              <span>Lote (PDFs)</span>
            </button>

            <button
              onClick={() => {
                setEditingBoleto(null);
                setIsUploadOpen(true);
              }}
              className="px-3.5 sm:px-5 py-2 sm:py-2.5 bg-white hover:bg-red-50 text-red-900 rounded-xl sm:rounded-2xl font-black text-xs flex items-center gap-1.5 sm:gap-2 transition-all shadow-lg active:scale-98 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-900 stroke-[3]" />
              <span className="hidden sm:inline">Lançar Boleto Individual</span>
              <span className="sm:hidden">+ Boleto</span>
            </button>
              </>
            )}
          </div>
        </div>

        {/* Metrics Row (Compact on mobile) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mt-4 sm:mt-8 pt-4 sm:pt-6 border-t border-red-800/60">
          <div className="bg-white/10 backdrop-blur-xs rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-white/10">
            <span className="text-[10px] sm:text-xs text-red-200 font-semibold block">Total em Atraso</span>
            <span className="text-base sm:text-2xl font-black text-white mt-0.5 sm:mt-1 block">
              {formatCurrency(totalEmAtraso)}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-xs rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-white/10">
            <span className="text-[10px] sm:text-xs text-red-200 font-semibold block">Títulos Pendentes</span>
            <span className="text-base sm:text-2xl font-black text-white mt-0.5 sm:mt-1 block">
              {totalTitulosAbertos}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-xs rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-white/10">
            <span className="text-[10px] sm:text-xs text-red-200 font-semibold block">Marcas Devedoras</span>
            <span className="text-base sm:text-2xl font-black text-white mt-0.5 sm:mt-1 block">
              {totalMarcasDevedoras}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-xs rounded-xl sm:rounded-2xl p-2.5 sm:p-4 border border-white/10">
            <span className="text-[10px] sm:text-xs text-red-200 font-semibold block">Média de Atraso</span>
            <span className="text-base sm:text-2xl font-black text-white mt-0.5 sm:mt-1 block">
              {avgDiasAtraso} {avgDiasAtraso === 1 ? 'dia' : 'dias'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por marca, NF, vendedor..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-red-600 focus:bg-white"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Ordenação */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'oldest' | 'newest')}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              title="Ordem dos boletos na tabela"
            >
              <option value="oldest">Vencido mais antigo ➔ recente</option>
              <option value="newest">Vencido mais recente ➔ antigo</option>
            </select>
          </div>

          {/* Vendedor Filter */}
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-slate-400" />
            <select
              value={vendedorFilter}
              onChange={(e) => setVendedorFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
            >
              <option value="todos">Todos os Vendedores</option>
              <option value="ricardo">Ricardo</option>
              <option value="wanderley">Wanderley</option>
              <option value="pedro">Pedro</option>
              <option value="daniel">Daniel</option>
              <option value="igor">Igor</option>
            </select>
          </div>

          {/* Status info badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span>Apenas Pendentes ({openBoletos.length})</span>
          </div>
        </div>
      </div>

      {/* Main List Table */}
      {loading ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
          <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-500">Carregando boletos...</p>
        </div>
      ) : sortedBoletos.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 space-y-3 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <FileWarning className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Nenhum boleto em atraso cadastrado</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Utilize o botão abaixo para fazer o lançamento manual de boletos em atraso com os 2 PDFs (Nota Fiscal e Boleto).
          </p>
{isGestao && (          <button
            onClick={() => {
              setEditingBoleto(null);
              setIsUploadOpen(true);
            }}
            className="mt-2 px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold text-xs inline-flex items-center gap-2 shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            Lançar Boleto em Atraso
          </button>)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Marca</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => setSortOrder((prev) => (prev === 'oldest' ? 'newest' : 'oldest'))}
                      className="inline-flex items-center gap-1.5 hover:text-red-700 font-bold uppercase transition-colors group cursor-pointer"
                      title={
                        sortOrder === 'oldest'
                          ? 'Ordenação atual: Vencido mais antigo ➔ recente. Clique para inverter.'
                          : 'Ordenação atual: Vencido mais recente ➔ antigo. Clique para inverter.'
                      }
                    >
                      <span>Vencimento</span>
                      {sortOrder === 'oldest' ? (
                        <ArrowUp className="w-3.5 h-3.5 text-red-600" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-red-600" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => setSortOrder((prev) => (prev === 'oldest' ? 'newest' : 'oldest'))}
                      className="inline-flex items-center gap-1.5 hover:text-red-700 font-bold uppercase transition-colors group mx-auto cursor-pointer"
                      title={
                        sortOrder === 'oldest'
                          ? 'Ordenação atual: Maior atraso primeiro. Clique para inverter.'
                          : 'Ordenação atual: Menor atraso primeiro. Clique para inverter.'
                      }
                    >
                      <span>Dias Atraso</span>
                      {sortOrder === 'oldest' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-red-600" />
                      ) : (
                        <ArrowUp className="w-3.5 h-3.5 text-red-600" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Vendedor</th>
                  <th className="py-3 px-4">Anexos PDF</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {sortedBoletos.map((b, idx) => (
                  <tr
                    key={b.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3 px-4 font-bold text-slate-500">
                      {b.indexNum || idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-extrabold text-slate-900">{b.marca}</div>
                      {b.numeroNF && (
                        <div className="text-[11px] text-slate-500">NF: {b.numeroNF}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">
                      {formatCurrency(b.valor)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {formatDateBR(b.data)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {(() => {
                        const dias = computeBoletoDiasAtraso(b.data, b.situacao, b.dataBaixa);
                        return (
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg font-extrabold text-xs shadow-2xs ${
                              dias > 15
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : dias > 5
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {dias} {dias === 1 ? 'dia' : 'dias'}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700 uppercase">
                      {b.vendedor}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 flex-wrap">
                        {/* Nota Fiscal Button Group */}
                        {b.pdfNFUrl ? (
                          <div className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50/80 overflow-hidden shadow-2xs">
                            <button
                              onClick={() =>
                                handleOpenPdf(`Nota Fiscal - ${b.marca}`, b.pdfNFUrl!, b.pdfNFName)
                              }
                              className="px-2 py-1 hover:bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center gap-1 transition-colors"
                              title="Visualizar PDF da Nota Fiscal"
                            >
                              <FileText className="w-3.5 h-3.5 text-blue-600" />
                              <span>NF</span>
                            </button>
                            <button
                              onClick={() => handleShareNF(b)}
                              className="px-1.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-l border-blue-200 text-[11px] transition-colors"
                              title="Enviar PDF da NF no WhatsApp"
                            >
                              <Share2 className="w-3 h-3 text-emerald-600" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sem NF</span>
                        )}

                        {/* Boleto Button Group */}
                        {b.pdfBoletoUrl ? (
                          <div className="inline-flex items-center rounded-lg border border-red-200 bg-red-50/80 overflow-hidden shadow-2xs">
                            <button
                              onClick={() =>
                                handleOpenPdf(`Boleto - ${b.marca}`, b.pdfBoletoUrl!, b.pdfBoletoName)
                              }
                              className="px-2 py-1 hover:bg-red-100 text-red-700 text-[11px] font-bold flex items-center gap-1 transition-colors"
                              title="Visualizar PDF do Boleto Bancário"
                            >
                              <FileWarning className="w-3.5 h-3.5 text-red-600" />
                              <span>Boleto</span>
                            </button>
                            <button
                              onClick={() => handleShareBoleto(b)}
                              className="px-1.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-l border-red-200 text-[11px] transition-colors"
                              title="Enviar PDF do Boleto no WhatsApp"
                            >
                              <Share2 className="w-3 h-3 text-emerald-600" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sem Boleto</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          b.situacao === 'EM ABERTO'
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {b.situacao}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {(b.pdfNFUrl || b.pdfBoletoUrl) && (
                          <button
                            onClick={() => handleShareBothDocuments(b)}
                            title="Enviar PDF(s) da NF e Boleto pelo WhatsApp"
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors border border-emerald-200"
                          >
                            <Share2 className="w-4 h-4 text-emerald-600" />
                          </button>
                        )}
                        {isGestao && b.situacao === 'EM ABERTO' && (
                          <button
                            onClick={() => handleBaixa(b)}
                            title="Dar Baixa (Marcar como Pago)"
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors border border-emerald-200"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {isGestao && (
                          <>
                        <button
                          onClick={() => {
                            setEditingBoleto(b);
                            setIsUploadOpen(true);
                          }}
                          title="Editar Boleto"
                          className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors border border-slate-200"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(b)}
                          title="Excluir Boleto"
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors border border-red-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Boleto Upload / Edit Modal */}
      <BoletoUploadModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setEditingBoleto(null);
        }}
        onSuccess={handleBoletoSaved}
        onBoletoSaved={handleBoletoSaved}
        initialData={editingBoleto}
        editingBoleto={editingBoleto}
        currentUser={currentUser}
      />

      {/* Batch Boleto Upload Modal (Fast multi-PDF without AI) */}
      <BoletoBatchUploadModal
        isOpen={isBatchUploadOpen}
        onClose={() => setIsBatchUploadOpen(false)}
        onSuccess={handleBatchBoletoSaved}
        currentUser={currentUser}
      />

      {/* PDF Viewer Modal */}
      <PdfViewerModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        title={pdfModalTitle}
        pdfUrl={pdfModalUrl}
        fileName={pdfModalFileName}
      />

      {/* Boletos Analytical Grid Report Modal */}
      <BoletosReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        boletos={boletos}
      />
    </div>
  );
};
