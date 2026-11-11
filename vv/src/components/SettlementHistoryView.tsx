import React, { useState } from 'react';
import { Order, OverdueBoleto, User, canUserEdit } from '../types';
import { formatCurrency, formatDateBR } from '../utils/pdfGenerator';
import { matchesOrderSearch, matchesBoletoSearch, normalizeSearchString } from '../utils/searchHelper';
import {
  History,
  Search,
  CheckCircle,
  Eye,
  Download,
  Building,
  Edit3,
  Users,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  List,
  FileText,
  ShoppingBag,
  Filter,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  X,
  Sparkles,
} from 'lucide-react';

interface SettlementHistoryViewProps {
  orders: Order[];
  boletos?: OverdueBoleto[];
  currentUser: User;
  onViewImage: (order: Order) => void;
  onEditOrder?: (order: Order) => void;
  onEstornoOrder?: (orderId: string, motivo: string) => Promise<void> | void;
}

export type UnifiedSettlementItem = {
  id: string;
  tipo: 'pedido' | 'boleto';
  marca: string;
  dataOriginal: string; // Data do pedido ou vencimento do boleto
  valor: number;
  vendedor: string;
  dataBaixa: string;
  baixadoPor: string;
  observacaoBaixa?: string;
  rawOrder?: Order;
  rawBoleto?: OverdueBoleto;
  numeroNF?: string;
  numeroBoleto?: string;
  indexNum?: number;
};

interface ClientGroup {
  marca: string;
  vendedores: string[];
  items: UnifiedSettlementItem[];
  totalValue: number;
}

export const SettlementHistoryView: React.FC<SettlementHistoryViewProps> = ({
  orders,
  boletos = [],
  currentUser,
  onViewImage,
  onEditOrder,
  onEstornoOrder,
}) => {
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'todos' | 'pedidos' | 'boletos'>('todos');
  const [viewMode, setViewMode] = useState<'grouped' | 'timeline'>('grouped');
  const [collapsedClients, setCollapsedClients] = useState<Record<string, boolean>>({});

  // Estorno modal state
  const [orderToEstornar, setOrderToEstornar] = useState<Order | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState('');
  const [isEstornando, setIsEstornando] = useState(false);

  const handleConfirmEstorno = async () => {
    if (!orderToEstornar || !onEstornoOrder) return;
    setIsEstornando(true);
    try {
      await onEstornoOrder(orderToEstornar.id, motivoEstorno || 'Baixa estornada pelo usuário');
      setOrderToEstornar(null);
      setMotivoEstorno('');
    } catch (err) {
      console.error('Erro no estorno:', err);
    } finally {
      setIsEstornando(false);
    }
  };

  // 1. Build unified list of settlements from settled orders
  const settledOrdersItems: UnifiedSettlementItem[] = orders
    .filter((o) => o.status === 'baixado')
    .map((o) => ({
      id: o.id,
      tipo: 'pedido',
      marca: o.marca,
      dataOriginal: o.data,
      valor: o.valor,
      vendedor: o.vendedor,
      dataBaixa: o.dataBaixa || o.createdAt,
      baixadoPor: o.baixadoPor || 'Pedro',
      observacaoBaixa: o.observacaoBaixa,
      rawOrder: o,
    }));

  // 2. Build unified list of settlements from settled boletos (situacao === 'PAGO')
  const settledBoletosItems: UnifiedSettlementItem[] = boletos
    .filter((b) => b.situacao === 'PAGO')
    .map((b) => ({
      id: b.id,
      tipo: 'boleto',
      marca: b.marca,
      dataOriginal: b.data,
      valor: b.valor,
      vendedor: b.vendedor,
      dataBaixa: b.dataBaixa || b.createdAt,
      baixadoPor: b.baixadoPor || 'Admin',
      observacaoBaixa: b.observacaoBaixa,
      numeroNF: b.numeroNF,
      numeroBoleto: b.numeroBoleto,
      indexNum: b.indexNum,
      rawBoleto: b,
    }));

  // Combined and sorted newest first
  const allSettledItems = [...settledOrdersItems, ...settledBoletosItems].sort((a, b) => {
    const dateA = new Date(a.dataBaixa).getTime();
    const dateB = new Date(b.dataBaixa).getTime();
    return dateB - dateA;
  });

  // Filter by search and type
  const filteredItems = allSettledItems.filter((item) => {
    // Type filter
    if (tipoFilter === 'pedidos' && item.tipo !== 'pedido') return false;
    if (tipoFilter === 'boletos' && item.tipo !== 'boleto') return false;

    // Search query with full tolerance
    if (!search || !search.trim()) return true;

    if (item.tipo === 'pedido' && item.rawOrder) {
      return matchesOrderSearch(item.rawOrder, search);
    }
    if (item.tipo === 'boleto' && item.rawBoleto) {
      return matchesBoletoSearch(item.rawBoleto, search);
    }

    const normQ = normalizeSearchString(search);
    const tokens = normQ.split(' ').filter(Boolean);
    const combined = [
      normalizeSearchString(item.marca),
      normalizeSearchString(item.vendedor),
      normalizeSearchString(item.id),
      normalizeSearchString(item.baixadoPor),
      normalizeSearchString(item.numeroNF),
      normalizeSearchString(item.numeroBoleto),
      String(item.valor || ''),
    ].join(' ');

    return tokens.every((t) => combined.includes(t));
  });

  // Global totals
  const totalQuitadoGeral = allSettledItems.reduce((sum, i) => sum + i.valor, 0);
  const totalQuitadoPedidos = settledOrdersItems.reduce((sum, i) => sum + i.valor, 0);
  const totalQuitadoBoletos = settledBoletosItems.reduce((sum, i) => sum + i.valor, 0);

  // Group filtered items by client/marca
  const clientGroupsMap: Record<string, ClientGroup> = filteredItems.reduce((acc, item) => {
    const key = item.marca.trim().toUpperCase();
    if (!acc[key]) {
      acc[key] = {
        marca: item.marca,
        vendedores: [],
        items: [],
        totalValue: 0,
      };
    }
    acc[key].items.push(item);
    acc[key].totalValue += item.valor;
    if (!acc[key].vendedores.includes(item.vendedor)) {
      acc[key].vendedores.push(item.vendedor);
    }
    return acc;
  }, {} as Record<string, ClientGroup>);

  const clientGroups: ClientGroup[] = (Object.values(clientGroupsMap) as ClientGroup[]).sort(
    (a: ClientGroup, b: ClientGroup) => a.marca.localeCompare(b.marca)
  );

  const toggleClientCollapse = (marcaKey: string) => {
    setCollapsedClients((prev) => ({
      ...prev,
      [marcaKey]: !prev[marcaKey],
    }));
  };

  const formatDateTime = (isoOrDateStr?: string) => {
    if (!isoOrDateStr) return 'Não registrada';
    try {
      const d = new Date(isoOrDateStr);
      if (isNaN(d.getTime())) return isoOrDateStr;
      const dataStr = d.toLocaleDateString('pt-BR');
      const horaStr = d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `${dataStr} às ${horaStr}`;
    } catch (e) {
      return isoOrDateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Stats */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shrink-0">
            <History className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Histórico Geral de Baixas e Quitações
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Registro consolidado de Pedidos de Frutas e Boletos quitados, com data, hora e responsável
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-800/90 p-3 rounded-2xl border border-slate-700/80">
          <div className="px-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Clientes Atendidos
            </span>
            <span className="text-lg sm:text-xl font-black text-slate-100">{clientGroups.length}</span>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div className="px-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total de Baixas
            </span>
            <span className="text-lg sm:text-xl font-black text-slate-100">{allSettledItems.length}</span>
          </div>
          <div className="w-px h-8 bg-slate-700" />
          <div className="px-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Volume Liquidado
            </span>
            <span className="text-lg sm:text-xl font-black text-emerald-400">
              {formatCurrency(totalQuitadoGeral)}
            </span>
          </div>
        </div>
      </div>

      {/* Mini Segment Stats Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-blue-50/80 border border-blue-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-blue-900 block">Pedidos de Frutas Baixados</span>
              <span className="text-xs text-blue-700">{settledOrdersItems.length} pedidos quitados</span>
            </div>
          </div>
          <span className="text-base font-black text-blue-950">{formatCurrency(totalQuitadoPedidos)}</span>
        </div>

        <div className="bg-red-50/80 border border-red-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-800 text-white flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-red-950 block">Boletos Bancários Baixados</span>
              <span className="text-xs text-red-700">{settledBoletosItems.length} boletos quitados (PDFs expurgados)</span>
            </div>
          </div>
          <span className="text-base font-black text-red-950">{formatCurrency(totalQuitadoBoletos)}</span>
        </div>
      </div>

      {/* Filter and View mode Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por Cliente, Vendedor, NF, ID ou Responsável..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs shadow-2xs"
          />
        </div>

        {/* Tipo Filter */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Filter className="w-4 h-4 text-slate-400 ml-1" />
          <span className="text-xs font-bold text-slate-600">Tipo:</span>
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 shadow-2xs focus:ring-2 focus:ring-amber-500"
          >
            <option value="todos">Todos ({allSettledItems.length})</option>
            <option value="pedidos">Apenas Pedidos ({settledOrdersItems.length})</option>
            <option value="boletos">Apenas Boletos ({settledBoletosItems.length})</option>
          </select>
        </div>

        {/* Toggle View Mode */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0 self-end sm:self-auto">
          <button
            onClick={() => setViewMode('grouped')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'grouped'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Agrupado por Cliente
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'timeline'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Linha do Tempo
          </button>
        </div>
      </div>

      {/* Content area */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-2">
          <History className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="font-bold text-slate-700">Nenhum registro de baixa encontrado.</p>
          <p className="text-xs text-slate-500">
            Quando um pedido ou boleto for quitado, seu registro de baixa aparecerá automaticamente aqui.
          </p>
        </div>
      ) : viewMode === 'grouped' ? (
        /* MODE 1: Grouped by Client */
        <div className="space-y-4">
          {clientGroups.map((group) => {
            const groupKey = group.marca.trim().toUpperCase();
            const isCollapsed = collapsedClients[groupKey];

            return (
              <div
                key={groupKey}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs transition-all hover:border-slate-300"
              >
                {/* Client Header */}
                <div
                  onClick={() => toggleClientCollapse(groupKey)}
                  className="p-4 sm:p-5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between gap-4 border-b border-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center font-black text-sm shrink-0">
                      <Building className="w-5 h-5 text-amber-700" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base sm:text-lg flex items-center gap-2">
                        <span>{group.marca}</span>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                          {group.items.length} {group.items.length === 1 ? 'baixa' : 'baixas'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Vendedor(es): <strong className="text-slate-700">{group.vendedores.join(', ')}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Total Liquidado
                      </span>
                      <span className="font-extrabold text-emerald-600 text-base">
                        {formatCurrency(group.totalValue)}
                      </span>
                    </div>

                    <button className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900">
                      {isCollapsed ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronUp className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Items under this client */}
                {!isCollapsed && (
                  <div className="p-4 space-y-3 bg-slate-100/30">
                    {group.items.map((item) => (
                      <div
                        key={`${item.tipo}-${item.id}`}
                        className={`bg-white rounded-xl border p-4 shadow-xs space-y-3 transition-colors ${
                          item.tipo === 'boleto'
                            ? 'border-red-200/80 hover:border-red-300'
                            : 'border-slate-200 hover:border-amber-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Type Badge */}
                            {item.tipo === 'boleto' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-100 text-red-900 border border-red-200">
                                <FileText className="w-3 h-3 text-red-700" /> Boleto Bancário
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                                <ShoppingBag className="w-3 h-3 text-blue-700" /> Pedido de Venda
                              </span>
                            )}

                            <span className="font-mono text-xs font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                              {item.id}
                            </span>

                            {item.numeroNF && (
                              <span className="text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                                NF: <strong>{item.numeroNF}</strong>
                              </span>
                            )}

                            <span className="text-[11px] font-bold text-slate-500">
                              {item.tipo === 'boleto' ? 'Vencimento' : 'Data'}: {formatDateBR(item.dataOriginal)}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-extrabold text-slate-800">
                              Valor Quitado: <strong className="text-emerald-600 text-sm">{formatCurrency(item.valor)}</strong>
                            </span>
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Baixado
                            </span>
                          </div>
                        </div>

                        {/* Detailed Baixa Box with Date and Exact Time */}
                        <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-1.5">
                            <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                              <Clock className="w-4 h-4 text-emerald-700" />
                              <span>Data e Horário da Baixa:</span>
                              <span className="font-mono text-emerald-900 bg-emerald-200/70 px-2 py-0.5 rounded">
                                {formatDateTime(item.dataBaixa)}
                              </span>
                            </div>

                            <span className="text-emerald-900 font-bold">
                              Responsável: <strong>{item.baixadoPor || 'Admin'}</strong>
                            </span>
                          </div>

                          {/* Partial payment log history if order has them */}
                          {item.rawOrder?.historicoBaixas && item.rawOrder.historicoBaixas.length > 0 ? (
                            <div className="space-y-1.5 pt-1">
                              <span className="font-bold text-emerald-900 block text-[11px] uppercase tracking-wider">
                                Histórico Detalhado de Lançamentos desta Baixa:
                              </span>
                              <div className="space-y-1">
                                {item.rawOrder.historicoBaixas.map((h, idx) => (
                                  <div
                                    key={h.id || idx}
                                    className="p-2 bg-white/90 rounded-lg border border-emerald-200/80 text-[11px] flex items-center justify-between gap-2"
                                  >
                                    <div>
                                      <span className="font-bold text-slate-800">
                                        {h.tipo === 'parcial' ? 'Baixa Parcial' : 'Quitação Total'}:
                                      </span>{' '}
                                      <strong className="text-emerald-700">{formatCurrency(h.valor)}</strong> por{' '}
                                      <span className="font-semibold">{h.baixadoPor}</span>
                                      {h.observacao && (
                                        <span className="italic text-slate-600 block">
                                          "{h.observacao}"
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-mono text-[10px] text-slate-500 shrink-0">
                                      {formatDateTime(h.dataHora || h.data)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            item.observacaoBaixa && (
                              <p className="text-emerald-900 italic text-xs">
                                Observação: "{item.observacaoBaixa}"
                              </p>
                            )
                          )}
                        </div>

                        {/* Actions & Information Badges */}
                        <div className="flex items-center justify-between gap-2 pt-1">
                          {item.tipo === 'boleto' ? (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>PDFs removidos do sistema após a baixa • Registro permanente preservado</span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">
                              Vendedor: <strong className="text-slate-600">{item.vendedor}</strong>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            {item.tipo === 'pedido' && item.rawOrder && (
                              <>
                                <button
                                  onClick={() => onViewImage(item.rawOrder!)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5 text-blue-600" /> Ver Comprovante
                                </button>

                                {canUserEdit(currentUser) && onEditOrder && (
                                  <button
                                    onClick={() => onEditOrder(item.rawOrder!)}
                                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border border-blue-200/60"
                                    title="Editar dados deste pedido"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-blue-600" /> Editar
                                  </button>
                                )}

                                {canUserEdit(currentUser) && onEstornoOrder && (
                                  <button
                                    onClick={() => {
                                      setOrderToEstornar(item.rawOrder!);
                                      setMotivoEstorno('');
                                    }}
                                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border border-amber-300"
                                    title="Estornar baixa e reabrir pedido com registro de auditoria seguro"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Estornar
                                  </button>
                                )}

                                <a
                                  href={item.rawOrder.imageUrl}
                                  download={`Comprovante_Baixado_${item.rawOrder.id}.png`}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5 text-slate-600" /> Baixar
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* MODE 2: Timeline list cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={`${item.tipo}-${item.id}`}
              className={`bg-white rounded-2xl border p-4 shadow-xs space-y-3 transition-colors ${
                item.tipo === 'boleto'
                  ? 'border-red-200/80 hover:border-red-300'
                  : 'border-slate-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5">
                  {item.tipo === 'boleto' ? (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-900 border border-red-200">
                      <FileText className="w-2.5 h-2.5 text-red-700" /> Boleto
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                      <ShoppingBag className="w-2.5 h-2.5 text-blue-700" /> Pedido
                    </span>
                  )}
                  <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {item.id}
                  </span>
                </div>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-600" /> Baixado
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Cliente / Marca
                </span>
                <h4 className="font-extrabold text-slate-900 text-base">
                  {item.marca}
                </h4>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded-xl">
                <div>
                  <span className="text-slate-500 block">Valor Quitado:</span>
                  <span className="font-extrabold text-emerald-600">
                    {formatCurrency(item.valor)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Vendedor:</span>
                  <span className="font-bold text-slate-800">{item.vendedor}</span>
                </div>
              </div>

              {/* Settlement metadata with exact timestamp */}
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                <p className="font-bold text-emerald-900">
                  Baixado por: <strong>{item.baixadoPor || 'Admin'}</strong>
                </p>
                <p className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-700" />
                  <span>
                    Data/Hora:{' '}
                    <strong className="font-mono">{formatDateTime(item.dataBaixa)}</strong>
                  </span>
                </p>
                {item.observacaoBaixa && (
                  <p className="text-[11px] text-emerald-800 italic">
                    "{item.observacaoBaixa}"
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-1 pt-1">
                {item.tipo === 'boleto' ? (
                  <span className="text-[10px] text-slate-400 italic">
                    PDFs expurgados na baixa
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => item.rawOrder && onViewImage(item.rawOrder)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-600" /> Ver
                    </button>

                    {canUserEdit(currentUser) && onEditOrder && item.rawOrder && (
                      <button
                        onClick={() => onEditOrder(item.rawOrder!)}
                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                        title="Editar dados deste pedido"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-blue-600" /> Editar
                      </button>
                    )}

                    {canUserEdit(currentUser) && onEstornoOrder && item.rawOrder && (
                      <button
                        onClick={() => {
                          setOrderToEstornar(item.rawOrder!);
                          setMotivoEstorno('');
                        }}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors border border-amber-300"
                        title="Estornar baixa e reabrir pedido com segurança"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Estornar
                      </button>
                    )}

                    {item.rawOrder && (
                      <a
                        href={item.rawOrder.imageUrl}
                        download={`Comprovante_Baixado_${item.rawOrder.id}.png`}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-600" /> Baixar
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE ESTORNO DE BAIXA */}
      {orderToEstornar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 bg-amber-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 text-white flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg">
                    Estornar / Reabrir Baixa
                  </h3>
                  <p className="text-xs text-amber-100">
                    Pedido #{orderToEstornar.id} • {orderToEstornar.marca}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOrderToEstornar(null)}
                className="p-1 hover:bg-white/20 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Atenção na Reabertura</p>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    O pedido voltará para o status <strong>"Em Aberto"</strong> com saldo devedor original de {formatCurrency(orderToEstornar.valor)}. Esta ação será gravada no livro-razão permanente para auditoria.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-bold text-slate-800">{orderToEstornar.marca}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vendedor:</span>
                  <span className="font-bold text-slate-800">{orderToEstornar.vendedor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Valor a Reabrir:</span>
                  <span className="font-extrabold text-slate-900">{formatCurrency(orderToEstornar.valor)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">
                  Motivo do Estorno / Reabertura:
                </label>
                <input
                  type="text"
                  value={motivoEstorno}
                  onChange={(e) => setMotivoEstorno(e.target.value)}
                  placeholder="Ex: Baixa dada por engano, cliente pediu reanálise..."
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOrderToEstornar(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isEstornando}
                onClick={handleConfirmEstorno}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl transition-colors shadow-md text-xs flex items-center gap-2 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isEstornando ? 'Estornando...' : 'Confirmar Estorno e Reabrir'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
