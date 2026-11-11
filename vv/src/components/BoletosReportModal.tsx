import React, { useState } from 'react';
import {
  X,
  FileText,
  Download,
  Share2,
  Calendar,
  Building,
  DollarSign,
  Clock,
  Printer,
  Table as TableIcon,
  Filter,
} from 'lucide-react';
import { OverdueBoleto } from '../types';
import {
  formatCurrency,
  formatDateBR,
  generateOverdueBoletosGridPDF,
  computeBoletoDiasAtraso,
  getFreshestBoletos,
  isBoletoOpen,
  sortBoletosByOldestOverdue,
} from '../utils/pdfGenerator';

interface BoletosReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  boletos: OverdueBoleto[];
}

export const BoletosReportModal: React.FC<BoletosReportModalProps> = ({
  isOpen,
  onClose,
  boletos,
}) => {
  const [selectedVendedor, setSelectedVendedor] = useState<string>('todos');
  const [downloading, setDownloading] = useState(false);

  if (!isOpen) return null;

  // Filter genuinely active/open boletos
  let filtered = boletos.filter(isBoletoOpen);
  if (selectedVendedor !== 'todos') {
    filtered = filtered.filter((b) => b.vendedor.toLowerCase() === selectedVendedor.toLowerCase());
  }

  // Sort boletos from oldest overdue to most recent
  const sortedFiltered = sortBoletosByOldestOverdue(filtered, 'oldest');

  // Group by Marca
  const brandMap = new Map<string, OverdueBoleto[]>();
  sortedFiltered.forEach((b) => {
    const list = brandMap.get(b.marca) || [];
    list.push(b);
    brandMap.set(b.marca, list);
  });

  const totalValor = filtered.reduce((sum, b) => sum + (b.valor || 0), 0);
  const totalTitulos = filtered.length;
  const avgDias =
    totalTitulos > 0
      ? Math.round(
          filtered.reduce(
            (sum, b) => sum + computeBoletoDiasAtraso(b.data, b.situacao, b.dataBaixa),
            0
          ) / totalTitulos
        )
      : 0;

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const fresh = await getFreshestBoletos(boletos);
      let targetList = fresh.filter(isBoletoOpen);
      if (selectedVendedor !== 'todos') {
        targetList = targetList.filter((b) => b.vendedor.toLowerCase() === selectedVendedor.toLowerCase());
      }
      await generateOverdueBoletosGridPDF(targetList, 'download');
    } finally {
      setDownloading(false);
    }
  };

  const handleSharePDF = async () => {
    setDownloading(true);
    try {
      const fresh = await getFreshestBoletos(boletos);
      let targetList = fresh.filter(isBoletoOpen);
      if (selectedVendedor !== 'todos') {
        targetList = targetList.filter((b) => b.vendedor.toLowerCase() === selectedVendedor.toLowerCase());
      }
      await generateOverdueBoletosGridPDF(targetList, 'share');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-red-950 via-red-900 to-red-800 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-red-200 border border-white/20">
              <TableIcon className="w-6 h-6 text-red-100" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                Relatório de Boletos em Atraso (Planilha Consolidada)
              </h2>
              <p className="text-xs text-red-200">
                Visualização analítica dos títulos vencidos agrupados por marca com dias de inadimplência
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors"
              title="Imprimir visualização"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <button
              onClick={handleSharePDF}
              disabled={downloading}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors"
              title="Compartilhar PDF"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-red-900 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              <span>Exportar PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/80 hover:text-white ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Metric Summary Bar */}
        <div className="p-4 px-6 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Filtrar Vendedor:</span>
            <select
              value={selectedVendedor}
              onChange={(e) => setSelectedVendedor(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs"
            >
              <option value="todos">Todos os Vendedores</option>
              <option value="ricardo">Ricardo</option>
              <option value="wanderley">Wanderley</option>
              <option value="pedro">Pedro</option>
              <option value="daniel">Daniel</option>
              <option value="igor">Igor</option>
            </select>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-4 text-xs">
            <div className="px-3 py-1.5 bg-red-100/80 border border-red-200 rounded-xl text-red-900 font-bold">
              Total em Atraso: <span className="text-red-700 font-extrabold">{formatCurrency(totalValor)}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-200/80 rounded-xl text-slate-800 font-bold">
              Títulos: <span className="text-slate-900 font-extrabold">{totalTitulos}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-200/80 rounded-xl text-slate-800 font-bold">
              Marcas: <span className="text-slate-900 font-extrabold">{brandMap.size}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-200/80 rounded-xl text-slate-800 font-bold">
              Média Atraso: <span className="text-slate-900 font-extrabold">{avgDias} dias</span>
            </div>
          </div>
        </div>

        {/* Report Content: Grid of Grouped Brand Tables (Matching Image) */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-100/60 space-y-6">
          {brandMap.size === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
              Nenhum boleto em atraso encontrado com os filtros selecionados.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Array.from(brandMap.entries()).map(([marca, items]) => {
                const subtotal = items.reduce((sum, item) => sum + (item.valor || 0), 0);
                return (
                  <div
                    key={marca}
                    className="bg-white rounded-2xl border border-red-200 shadow-xs overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      {/* Table Header Styled in Burgundy matching image */}
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#9c3838] text-white text-[11px] font-black uppercase tracking-wider text-center">
                            <th className="py-2.5 px-2 w-10 border-r border-red-800">#</th>
                            <th className="py-2.5 px-3 border-r border-red-800 text-left">Marca</th>
                            <th className="py-2.5 px-3 border-r border-red-800 text-right">Valor (R$)</th>
                            <th className="py-2.5 px-3 border-r border-red-800">Data</th>
                            <th className="py-2.5 px-3 border-r border-red-800">Dias em atraso</th>
                            <th className="py-2.5 px-3 border-r border-red-800">Situação</th>
                            <th className="py-2.5 px-3">Vendedor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100 text-[11px]">
                          {items.map((b) => (
                            <tr
                              key={b.id}
                              className="bg-[#fce8e8] hover:bg-[#fad8d8] text-slate-900 transition-colors text-center font-medium"
                            >
                              <td className="py-2 px-2 border-r border-red-200 font-bold text-slate-700">
                                {b.indexNum || '-'}
                              </td>
                              <td className="py-2 px-3 border-r border-red-200 text-left font-black text-slate-900">
                                {b.marca}
                              </td>
                              <td className="py-2 px-3 border-r border-red-200 text-right font-black text-slate-900">
                                {formatCurrency(b.valor)}
                              </td>
                              <td className="py-2 px-3 border-r border-red-200 text-slate-700">
                                {formatDateBR(b.data)}
                              </td>
                              <td className="py-2 px-3 border-r border-red-200 font-extrabold text-red-700">
                                {computeBoletoDiasAtraso(b.data, b.situacao, b.dataBaixa)}
                              </td>
                              <td className="py-2 px-3 border-r border-red-200 font-bold text-red-800">
                                {b.situacao}
                              </td>
                              <td className="py-2 px-3 font-bold text-slate-800 uppercase">
                                {b.vendedor}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Subtotal Footer */}
                    <div className="bg-[#f5d0d0] px-4 py-2 border-t border-red-300 flex items-center justify-between text-xs font-bold text-red-950">
                      <span>Total {marca} ({items.length} títulos):</span>
                      <span className="font-black text-sm text-red-900">{formatCurrency(subtotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Grand Consolidated Total Box */}
          <div className="p-4 px-6 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
            <div>
              <h4 className="font-bold text-sm">TOTAL GERAL CONSOLIDADO DE INADIMPLÊNCIA</h4>
              <p className="text-xs text-slate-400">
                {totalTitulos} títulos vencidos distribuídos em {brandMap.size} marcas
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-red-300 font-semibold block">Valor Total Devedor</span>
              <span className="text-2xl font-black text-red-400">{formatCurrency(totalValor)}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Relatório baseado na base de boletos em atraso - Distribuidora Traviu</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
