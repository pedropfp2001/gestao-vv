import React, { useState } from 'react';
import { Order, CustomerSummary, User } from '../types';
import {
  formatCurrency,
  formatDateBR,
  generateFinancialSummaryPDF,
} from '../utils/pdfGenerator';
import {
  Download,
  Building,
  DollarSign,
  Clock,
  FileSpreadsheet,
  Share2,
  Bell,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { SendAlertDialogModal } from './SendAlertDialogModal';

interface FinancialSummaryModalProps {
  orders: Order[];
  currentUser: User;
  onSendNotification?: (data: {
    senderName: string;
    targetUser: 'Ricardo' | 'Wanderley' | 'Pedro' | 'Daniel' | 'Igor' | 'Todos';
    cliente: string;
    valorPendente?: number;
    message?: string;
  }) => void;
}

export const FinancialSummaryModal: React.FC<FinancialSummaryModalProps> = ({
  orders,
  currentUser,
  onSendNotification,
}) => {
  const [alertCustomer, setAlertCustomer] = useState<{
    marca: string;
    totalPendente: number;
    vendedor?: string;
  } | null>(null);

  // Users permitted to see and send alert buttons
  const canSendAlert = ['Pedro', 'Igor', 'Daniel'].includes(currentUser.name);

  // Helper to parse order dates (ISO or DD/MM/YYYY)
  const parseOrderDate = (dStr: string) => {
    if (!dStr) return 0;
    if (dStr.includes('/')) {
      const parts = dStr.split('/');
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`).getTime() || 0;
      }
    }
    return new Date(dStr).getTime() || 0;
  };

  // Only look at open pending orders
  const openOrders = orders.filter((o) => o.status === 'em_aberto');

  // Group by Marca
  const summariesMap = new Map<string, CustomerSummary>();

  openOrders.forEach((order) => {
    const orderSaldo = Math.max(0, order.valor - (order.valorPago || 0));
    const existing = summariesMap.get(order.marca);
    if (!existing) {
      summariesMap.set(order.marca, {
        marca: order.marca,
        dataMaisAntiga: order.data,
        totalPendente: orderSaldo,
        qtdPedidos: 1,
        pedidos: [order],
      });
    } else {
      existing.pedidos.push(order);
      existing.totalPendente += orderSaldo;
      existing.qtdPedidos += 1;
      // Compare dates to keep the oldest
      if (parseOrderDate(order.data) < parseOrderDate(existing.dataMaisAntiga)) {
        existing.dataMaisAntiga = order.data;
      }
    }
  });

  // Sort by oldest order date (dataMaisAntiga) ascending
  const summaries = Array.from(summariesMap.values()).sort((a, b) => {
    const diff = parseOrderDate(a.dataMaisAntiga) - parseOrderDate(b.dataMaisAntiga);
    if (diff !== 0) return diff;
    return a.marca.localeCompare(b.marca);
  });

  const totalGeralPendente = summaries.reduce((sum, s) => sum + s.totalPendente, 0);

  const handleDownloadPDF = async () => {
    await generateFinancialSummaryPDF(summaries, 'download');
  };

  const handleSharePDF = async () => {
    await generateFinancialSummaryPDF(summaries, 'share');
  };

  const handleTestNotification = () => {
    if (onSendNotification) {
      onSendNotification({
        senderName: 'Pedro',
        targetUser: 'Ricardo',
        cliente: 'HORTIFRUTI TESTE (Pedro)',
        valorPendente: 5000,
        message: '⚡ NOTIFICAÇÃO DE TESTE ENVIADA POR PEDRO: Cobrança do cliente HORTIFRUTI TESTE no valor de R$ 5.000,00.',
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Relatório de Gestão Financeira por Cliente
            </h3>
            <p className="text-xs text-slate-500">
              Listagem consolidada com data do pedido mais antigo, valor pendente e envio de alertas aos vendedores
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={handleDownloadPDF}
            disabled={summaries.length === 0}
            className="px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-800 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5"
            title="Baixar arquivo PDF"
          >
            <Download className="w-4 h-4" />
            <span>Baixar PDF</span>
          </button>

          <button
            onClick={handleSharePDF}
            disabled={summaries.length === 0}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-extrabold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
            title="Enviar relatório geral em PDF diretamente pelo WhatsApp / Compartilhar"
          >
            <Share2 className="w-4 h-4" />
            <span>Enviar PDF (WhatsApp)</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Clientes Inadimplentes / Abertos
          </span>
          <p className="text-2xl font-black text-slate-900">{summaries.length}</p>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Total de Pedidos Pendentes
          </span>
          <p className="text-2xl font-black text-blue-600">{openOrders.length}</p>
        </div>

        <div className="p-4 bg-red-50/60 border border-red-200/80 rounded-xl space-y-1">
          <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">
            Valor Total Geral Pendente
          </span>
          <p className="text-2xl font-black text-red-600">
            {formatCurrency(totalGeralPendente)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900 text-white font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="p-3.5">Marca / Cliente</th>
              <th className="p-3.5 text-center">Pedido Mais Antigo</th>
              <th className="p-3.5 text-center">Qtd. Pedidos</th>
              <th className="p-3.5 text-right">Valor Total Pendente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {summaries.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-slate-500 font-medium">
                  Nenhum pedido pendente registrado no momento.
                </td>
              </tr>
            ) : (
              summaries.map((s) => (
                <tr key={s.marca} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-bold text-slate-900">
                    {s.marca}
                  </td>
                  <td className="p-3.5 text-center font-medium text-slate-700">
                    {formatDateBR(s.dataMaisAntiga)}
                  </td>
                  <td className="p-3.5 text-center">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-bold rounded-full">
                      {s.qtdPedidos}
                    </span>
                  </td>
                  <td className="p-3.5 text-right font-black text-emerald-600 text-sm">
                    {formatCurrency(s.totalPendente)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {summaries.length > 0 && (
            <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
              <tr>
                <td className="p-3.5">TOTAL GERAL PENDENTE</td>
                <td className="p-3.5 text-center">-</td>
                <td className="p-3.5 text-center">{openOrders.length}</td>
                <td className="p-3.5 text-right text-red-600 text-base font-black">
                  {formatCurrency(totalGeralPendente)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Alert Dialog Modal */}
      {alertCustomer && (
        <SendAlertDialogModal
          isOpen={!!alertCustomer}
          onClose={() => setAlertCustomer(null)}
          customerMarca={alertCustomer.marca}
          totalPendente={alertCustomer.totalPendente}
          defaultSeller={alertCustomer.vendedor}
          senderName={currentUser.name}
          onSendAlert={(data) => {
            if (onSendNotification) {
              onSendNotification({
                senderName: currentUser.name,
                targetUser: data.targetUser,
                cliente: alertCustomer.marca,
                valorPendente: alertCustomer.totalPendente,
                message: data.message,
              });
            }
          }}
        />
      )}
    </div>
  );
};

