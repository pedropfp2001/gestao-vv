import React, { useState } from 'react';
import {
  X,
  FileText,
  Download,
  Share2,
  Printer,
  Table as TableIcon,
  Filter,
  Calendar,
  Building,
  DollarSign,
  Clock,
  User as UserIcon,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Order } from '../types';
import {
  formatCurrency,
  formatDateBR,
  computeOrderDiasAtraso,
  generateOpenOrdersGridPDF,
  generateBothOpenOrdersReports,
} from '../utils/pdfGenerator';
import { Layers, CheckCircle2, Loader2 } from 'lucide-react';

interface OpenOrdersReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
}

export const OpenOrdersReportModal: React.FC<OpenOrdersReportModalProps> = ({
  isOpen,
  onClose,
  orders,
}) => {
  const [selectedVendedor, setSelectedVendedor] = useState<string>('todos');
  const [minOrdersFilter, setMinOrdersFilter] = useState<'2+' | '1_only' | '3+' | 'all'>('2+');
  const [viewStyle, setViewStyle] = useState<'ledger' | 'table'>('ledger');
  const [downloading, setDownloading] = useState(false);
  const [downloadingBoth, setDownloadingBoth] = useState(false);
  const [bothStatusMsg, setBothStatusMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter only open orders
  let openOrders = orders.filter((o) => o.status === 'em_aberto');

  if (selectedVendedor !== 'todos') {
    openOrders = openOrders.filter(
      (o) => o.vendedor?.toLowerCase() === selectedVendedor.toLowerCase()
    );
  }

  // Sort orders by brand, then by date
  const sortedOrders = [...openOrders].sort((a, b) => {
    const marcaCompare = (a.marca || '').localeCompare(b.marca || '');
    if (marcaCompare !== 0) return marcaCompare;
    return new Date(a.data || 0).getTime() - new Date(b.data || 0).getTime();
  });

  // Group orders by brand
  const allBrandGroups = new Map<string, Order[]>();
  sortedOrders.forEach((o) => {
    const key = o.marca || 'SEM MARCA';
    const list = allBrandGroups.get(key) || [];
    list.push(o);
    allBrandGroups.set(key, list);
  });

  // Filter brands based on the active filter mode
  const brandGroups = new Map<string, Order[]>();
  const filteredOrders: Order[] = [];

  allBrandGroups.forEach((items, brand) => {
    if (minOrdersFilter === '1_only') {
      if (items.length === 1) {
        brandGroups.set(brand, items);
        filteredOrders.push(...items);
      }
    } else if (minOrdersFilter === '3+') {
      if (items.length >= 3) {
        brandGroups.set(brand, items);
        filteredOrders.push(...items);
      }
    } else if (minOrdersFilter === 'all') {
      if (items.length >= 1) {
        brandGroups.set(brand, items);
        filteredOrders.push(...items);
      }
    } else {
      // Default: '2+'
      if (items.length >= 2) {
        brandGroups.set(brand, items);
        filteredOrders.push(...items);
      }
    }
  });

  // Totals based on filtered brands
  const totalOpenValue = filteredOrders.reduce(
    (sum, o) => sum + Math.max(0, o.valor - (o.valorPago || 0)),
    0
  );
  const totalOrdersCount = filteredOrders.length;
  const totalBrandsCount = brandGroups.size;

  const avgDias =
    totalOrdersCount > 0
      ? Math.round(
          filteredOrders.reduce((sum, o) => sum + computeOrderDiasAtraso(o.data), 0) /
            totalOrdersCount
        )
      : 0;

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      await generateOpenOrdersGridPDF(openOrders, 'download', minOrdersFilter);
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadBothReports = async () => {
    setDownloadingBoth(true);
    setBothStatusMsg('Iniciando geração dos 3 relatórios (1 Pedido, 2+ Pedidos e Boletos em Atraso)...');
    try {
      await generateBothOpenOrdersReports(openOrders, 'download', (msg) => {
        setBothStatusMsg(msg);
      });
      setBothStatusMsg('✅ 3 Relatórios baixados com sucesso (1 Pedido, 2+ Pedidos e Boletos em Atraso)!');
      setTimeout(() => setBothStatusMsg(null), 5000);
    } catch (err) {
      console.error('Erro ao gerar os relatórios:', err);
      setBothStatusMsg('❌ Erro ao gerar os relatórios. Tente novamente.');
      setTimeout(() => setBothStatusMsg(null), 4000);
    } finally {
      setDownloadingBoth(false);
    }
  };

  const handleSharePDF = async () => {
    setDownloading(true);
    try {
      await generateOpenOrdersGridPDF(openOrders, 'share', minOrdersFilter);
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Global sequential order index generator
  let globalOrderIdx = 1;

  const getFilterBadgeLabel = () => {
    switch (minOrdersFilter) {
      case '1_only':
        return 'Marcas com SOMENTE 1 Pedido em Aberto';
      case '3+':
        return 'Marcas com 3 ou mais Pedidos em Aberto';
      case 'all':
        return 'Todas as Marcas com Pedidos em Aberto';
      case '2+':
      default:
        return 'Marcas com 2 ou mais Pedidos em Aberto';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-4">
        {/* Header with deep wine/burgundy theme */}
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#5a1818] via-[#7d2020] to-[#9c2828] text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-red-200 border border-white/20 shrink-0">
              <TableIcon className="w-6 h-6 text-red-100" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-red-800/90 border border-red-600/80 text-red-100 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                {getFilterBadgeLabel()}
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                Relatório de Pedidos em Aberto por Marca
              </h2>
              <p className="text-xs text-red-200/90 mt-0.5">
                Visualização estruturada: Cabeçalho com a Marca, código sequencial (#marca-0001), Data, Valor e Vendedor
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Automatic 3-Reports Button */}
            <button
              onClick={handleDownloadBothReports}
              disabled={downloading || downloadingBoth}
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-amber-950 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 border border-amber-300 animate-pulse hover:animate-none"
              title="Baixa automaticamente 3 relatórios separados: marcas com 1 pedido, marcas com 2 ou mais pedidos e boletos em atraso"
            >
              {downloadingBoth ? (
                <Loader2 className="w-4 h-4 text-amber-950 animate-spin" />
              ) : (
                <Layers className="w-4 h-4 text-amber-950" />
              )}
              <span>Baixar os 3 Relatórios (1, 2+ e Boletos)</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors"
              title="Imprimir relatório"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            <button
              onClick={handleSharePDF}
              disabled={downloading || downloadingBoth}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors"
              title="Compartilhar PDF"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Compartilhar</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={downloading || downloadingBoth}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-red-950 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
              title="Exportar PDF do filtro ativo atual"
            >
              <Download className="w-4 h-4 text-red-900" />
              <span>Exportar PDF Atual</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/80 hover:text-white ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status notification for automatic dual-download */}
        {bothStatusMsg && (
          <div className="bg-amber-500 text-amber-950 px-6 py-2.5 text-xs font-bold flex items-center justify-between animate-fade-in border-b border-amber-600">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 animate-bounce" />
              <span>{bothStatusMsg}</span>
            </div>
            <button
              onClick={() => setBothStatusMsg(null)}
              className="text-amber-950/70 hover:text-amber-950 font-black text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter & Metric Summary Bar */}
        <div className="p-4 px-6 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Filter by Qtd/Tipo de Pedidos por Marca */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-700">Filtro de Marcas:</span>
              <select
                value={minOrdersFilter}
                onChange={(e) => setMinOrdersFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-red-950 shadow-2xs focus:ring-2 focus:ring-red-600"
              >
                <option value="2+">2 ou mais pedidos (Padrão)</option>
                <option value="1_only">Somente marcas com 1 pedido</option>
                <option value="3+">3 ou mais pedidos</option>
                <option value="all">Todas as marcas (1 ou mais)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700">Vendedor:</span>
              <select
                value={selectedVendedor}
                onChange={(e) => setSelectedVendedor(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs"
              >
                <option value="todos">Todos os Vendedores</option>
                <option value="pedro">Pedro</option>
                <option value="daniel">Daniel</option>
                <option value="igor">Igor</option>
                <option value="ricardo">Ricardo</option>
                <option value="wanderley">Wanderley</option>
              </select>
            </div>

            {/* Layout view toggle */}
            <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg ml-1">
              <button
                onClick={() => setViewStyle('ledger')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                  viewStyle === 'ledger'
                    ? 'bg-white text-red-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List className="w-3.5 h-3.5" /> Modelo Ledger
              </button>
              <button
                onClick={() => setViewStyle('table')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                  viewStyle === 'table'
                    ? 'bg-white text-red-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Grade Planilha
              </button>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="px-3 py-1.5 bg-red-100/80 border border-red-200 rounded-xl text-red-900 font-bold">
              Total em Aberto: <span className="text-red-700 font-extrabold">{formatCurrency(totalOpenValue)}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-200/80 rounded-xl text-slate-800 font-bold">
              Pedidos: <span className="text-slate-900 font-extrabold">{totalOrdersCount}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-200/80 rounded-xl text-slate-800 font-bold">
              Marcas: <span className="text-slate-900 font-extrabold">{totalBrandsCount}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-200/80 rounded-xl text-slate-800 font-bold">
              Média Atraso: <span className="text-slate-900 font-extrabold">{avgDias} dias</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-100/70 space-y-6">
          {brandGroups.size === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 space-y-2 shadow-xs">
              <Building className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700 text-base">Nenhuma marca encontrada com o filtro selecionado.</p>
              <p className="text-xs text-slate-400">Tente ajustar o filtro de marcas ou selecionar outro vendedor.</p>
            </div>
          ) : minOrdersFilter === '1_only' ? (
            /* CLEAN UNIFIED TABLE / LIST FOR SINGLE-ORDER BRANDS (No individual cards) */
            <div className="bg-white rounded-2xl border border-red-200/90 shadow-sm overflow-hidden">
              {/* Header Banner */}
              <div className="bg-gradient-to-r from-[#7a1c1c] via-[#8c2222] to-[#9c2828] text-white px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center font-black text-xs text-red-100">
                    <List className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-base tracking-tight uppercase">
                      Lista Consolidada de Pedidos Únicos por Marca
                    </h3>
                    <p className="text-xs text-red-200">
                      Exibindo {filteredOrders.length} marcas que possuem somente 1 pedido em aberto
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-red-200 font-bold uppercase tracking-wider block">
                    Total Acumulado
                  </span>
                  <span className="font-black text-base text-white tracking-tight">
                    {formatCurrency(totalOpenValue)}
                  </span>
                </div>
              </div>

              {/* Unified Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[620px]">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-600 text-center select-none">
                      <th className="py-3 px-4 text-left">Código</th>
                      <th className="py-3 px-4 text-left">Marca / Cliente</th>
                      <th className="py-3 px-4">Data do Pedido</th>
                      <th className="py-3 px-4">Dias em Atraso</th>
                      <th className="py-3 px-4 text-right">Valor em Aberto</th>
                      <th className="py-3 px-4">Vendedor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredOrders.map((o, idx) => {
                      const cleanBrand = (o.marca || 'PED').trim().toUpperCase().replace(/\s+/g, '-');
                      const formattedCode = `#${cleanBrand}-${String(idx + 1).padStart(4, '0')}`;
                      const dias = computeOrderDiasAtraso(o.data);
                      const valorPendente = Math.max(0, o.valor - (o.valorPago || 0));

                      return (
                        <tr
                          key={o.id}
                          className="hover:bg-red-50/60 transition-colors text-center font-medium group"
                        >
                          <td className="py-2.5 px-4 text-left font-mono font-black text-red-900">
                            <span className="bg-red-50 group-hover:bg-white border border-red-200 px-2 py-0.5 rounded-md text-[11px]">
                              {formattedCode}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-left font-black text-slate-900 text-xs uppercase">
                            {o.marca || 'SEM MARCA'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 font-bold">
                            {formatDateBR(o.data)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md ${
                                dias > 15
                                  ? 'bg-red-100 text-red-700 border border-red-200'
                                  : dias > 5
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {dias} dias
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-black text-slate-900 text-xs">
                            {formatCurrency(valorPendente)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 group-hover:bg-red-100 group-hover:text-red-900 transition-colors">
                              {o.vendedor}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#fcedec] border-t-2 border-red-200 text-xs font-black text-red-950">
                      <td colSpan={2} className="py-3 px-4 text-left">
                        TOTAL ({filteredOrders.length} MARCAS):
                      </td>
                      <td className="py-3 px-4 text-center text-slate-700">
                        {filteredOrders.length} pedidos
                      </td>
                      <td className="py-3 px-4 text-center text-red-900">
                        Média: {avgDias} dias
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-red-950">
                        {formatCurrency(totalOpenValue)}
                      </td>
                      <td className="py-3 px-4"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : viewStyle === 'ledger' ? (
            /* EXECUTIVE LEDGER STYLE: Brand Header on Top, Clean Rows with Data, Valor, Vendedor below */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from(brandGroups.entries()).map(([marca, items]) => {
                const subtotal = items.reduce(
                  (sum, item) => sum + Math.max(0, item.valor - (item.valorPago || 0)),
                  0
                );

                return (
                  <div
                    key={marca}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col justify-between hover:border-red-300 transition-all hover:shadow-md"
                  >
                    {/* Brand Header Banner */}
                    <div className="bg-gradient-to-r from-[#7a1c1c] to-[#9c2828] text-white px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center font-black text-xs text-red-100">
                          <Building className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-black text-base sm:text-lg tracking-tight uppercase">
                            {marca}
                          </h3>
                          <span className="text-[11px] text-red-200 font-medium">
                            {items.length} {items.length === 1 ? 'pedido pendente' : 'pedidos pendentes'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-red-200 font-bold uppercase tracking-wider block">
                          Total da Marca
                        </span>
                        <span className="font-black text-base text-white tracking-tight">
                          {formatCurrency(subtotal)}
                        </span>
                      </div>
                    </div>

                    {/* Column Headers Guide */}
                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 w-1/3">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>Código / Data / Atraso</span>
                      </div>
                      <div className="text-right w-1/3 flex items-center justify-end gap-1">
                        <DollarSign className="w-3 h-3 text-slate-400" />
                        <span>Valor (R$)</span>
                      </div>
                      <div className="text-right w-1/3 flex items-center justify-end gap-1">
                        <UserIcon className="w-3 h-3 text-slate-400" />
                        <span>Vendedor</span>
                      </div>
                    </div>

                    {/* Order Items with elegant dot leaders and clean typography */}
                    <div className="p-4 px-5 space-y-2.5 flex-1 bg-white">
                      {items.map((o, idx) => {
                        const cleanBrand = (marca || 'PED').trim().toUpperCase().replace(/\s+/g, '-');
                        const formattedCode = `#${cleanBrand}-${String(idx + 1).padStart(4, '0')}`;
                        const dias = computeOrderDiasAtraso(o.data);
                        const valorPendente = Math.max(0, o.valor - (o.valorPago || 0));

                        return (
                          <div
                            key={o.id}
                            className="group flex items-baseline justify-between gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-red-50/50 transition-colors"
                          >
                            {/* CÓDIGO + DATA + DIAS */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-[10px] font-black text-red-900 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                {formattedCode}
                              </span>
                              <span className="font-bold text-slate-800 text-xs">
                                {formatDateBR(o.data)}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-md ${
                                  dias > 15
                                    ? 'bg-red-100 text-red-700 border border-red-200'
                                    : dias > 5
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {dias}d
                              </span>
                            </div>

                            {/* Dot Leader Line */}
                            <div className="flex-1 border-b border-dotted border-slate-300 mx-1 opacity-70 group-hover:opacity-100" />

                            {/* VALOR */}
                            <div className="font-black text-slate-900 shrink-0 text-right">
                              {formatCurrency(valorPendente)}
                            </div>

                            {/* Dot Leader Line 2 */}
                            <div className="w-8 border-b border-dotted border-slate-300 mx-1 opacity-70 group-hover:opacity-100 hidden sm:block" />

                            {/* VENDEDOR */}
                            <div className="shrink-0 text-right">
                              <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 group-hover:bg-red-100 group-hover:text-red-900 transition-colors">
                                {o.vendedor}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Subtotal Footer */}
                    <div className="bg-[#fcedec] px-5 py-2.5 border-t border-red-200 flex items-center justify-between text-xs font-bold text-red-950">
                      <span className="text-red-900 font-extrabold">
                        Subtotal {marca}:
                      </span>
                      <span className="font-black text-sm text-red-950">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* SPREADSHEET TABLE GRID STYLE */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Array.from(brandGroups.entries()).map(([marca, items]) => {
                const subtotal = items.reduce(
                  (sum, item) => sum + Math.max(0, item.valor - (item.valorPago || 0)),
                  0
                );

                return (
                  <div
                    key={marca}
                    className="bg-white rounded-2xl border border-red-200 shadow-xs overflow-hidden flex flex-col justify-between"
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[440px]">
                        <thead>
                          <tr className="bg-[#7a1c1c] text-white text-[11px] font-black uppercase tracking-wider text-center select-none">
                            <th className="py-2.5 px-2 border-r border-red-800">Código</th>
                            <th className="py-2.5 px-3 border-r border-red-800 text-left">Marca</th>
                            <th className="py-2.5 px-3 border-r border-red-800 text-right">Valor (R$)</th>
                            <th className="py-2.5 px-3 border-r border-red-800">Data</th>
                            <th className="py-2.5 px-3 border-r border-red-800">Dias Atraso</th>
                            <th className="py-2.5 px-3 border-r border-red-800">Situação</th>
                            <th className="py-2.5 px-3">Vendedor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-red-100 text-[11px]">
                          {items.map((o, idx) => {
                            const cleanBrand = (marca || 'PED').trim().toUpperCase().replace(/\s+/g, '-');
                            const formattedCode = `#${cleanBrand}-${String(idx + 1).padStart(4, '0')}`;
                            const dias = computeOrderDiasAtraso(o.data);
                            const valorPendente = Math.max(0, o.valor - (o.valorPago || 0));

                            return (
                              <tr
                                key={o.id}
                                className="bg-[#fce8e8] hover:bg-[#fad8d8] text-slate-900 transition-colors text-center font-medium"
                              >
                                <td className="py-2 px-2 border-r border-red-200 font-mono font-bold text-slate-700">
                                  {formattedCode}
                                </td>
                                <td className="py-2 px-3 border-r border-red-200 text-left font-black text-slate-900">
                                  {o.marca}
                                </td>
                                <td className="py-2 px-3 border-r border-red-200 text-right font-black text-slate-900">
                                  {formatCurrency(valorPendente)}
                                </td>
                                <td className="py-2 px-3 border-r border-red-200 text-slate-700">
                                  {formatDateBR(o.data)}
                                </td>
                                <td className="py-2 px-3 border-r border-red-200 font-extrabold text-red-700">
                                  {dias}
                                </td>
                                <td className="py-2 px-3 border-r border-red-200 font-bold text-red-800 text-[10px]">
                                  EM ABERTO
                                </td>
                                <td className="py-2 px-3 font-bold text-slate-800 uppercase">
                                  {o.vendedor}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Subtotal Footer */}
                    <div className="bg-[#fcedec] px-4 py-2 border-t border-red-300 flex items-center justify-between text-xs font-bold text-red-950">
                      <span>Total {marca} ({items.length} pedidos):</span>
                      <span className="font-black text-sm text-red-900">{formatCurrency(subtotal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Grand Consolidated Total Box */}
          <div className="p-5 px-6 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 text-white rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg border border-slate-800">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center font-black text-sm shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-base tracking-tight">TOTAL GERAL CONSOLIDADO DE PEDIDOS EM ABERTO</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  {totalOrdersCount} pedidos em atraso distribuídos em {brandGroups.size} marcas
                </p>
              </div>
            </div>
            <div className="text-right sm:border-l sm:border-slate-800 sm:pl-6">
              <span className="text-xs text-red-300 font-semibold uppercase tracking-wider block">Valor Total Devedor</span>
              <span className="text-2xl sm:text-3xl font-black text-red-400 tracking-tight">{formatCurrency(totalOpenValue)}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Relatório baseado nos pedidos em aberto cadastrados no sistema - Distribuidora Traviu</span>
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
