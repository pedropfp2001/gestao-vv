import React, { useState } from 'react';
import { Order, User } from '../types';
import { formatCurrency, formatDateBR } from '../utils/pdfGenerator';
import { CheckCircle2, X, AlertTriangle, Building, Loader2 } from 'lucide-react';

interface BatchSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOrders: Order[];
  currentUser: User;
  onConfirmBatchSettlement: (observacao: string) => Promise<void> | void;
}

export const BatchSettlementModal: React.FC<BatchSettlementModalProps> = ({
  isOpen,
  onClose,
  selectedOrders,
  currentUser,
  onConfirmBatchSettlement,
}) => {
  const [observacao, setObservacao] = useState('Baixa em lote realizada.');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const totalValueToSettle = selectedOrders.reduce((acc, order) => {
    const currentPaid = order.valorPago || 0;
    const saldo = Math.max(0, order.valor - currentPaid);
    return acc + saldo;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrders.length === 0) return;

    setLoading(true);
    try {
      await onConfirmBatchSettlement(observacao);
      onClose();
    } catch (err) {
      console.error('Erro na baixa em lote:', err);
      alert('Erro ao processar baixa em lote.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">
                Baixa em Lote ({selectedOrders.length} {selectedOrders.length === 1 ? 'pedido' : 'pedidos'})
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Quitar pendências financeiras dos pedidos selecionados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Total summary box */}
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-amber-100 uppercase tracking-wider block">
                Valor Total a Quitar
              </span>
              <span className="text-2xl font-black">{formatCurrency(totalValueToSettle)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-amber-100 block">Responsável</span>
              <span className="text-sm font-extrabold bg-amber-700/60 px-2.5 py-0.5 rounded-lg border border-amber-400/30 inline-block mt-0.5">
                {currentUser.name}
              </span>
            </div>
          </div>

          {/* Orders list preview */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-2">
              Pedidos Selecionados ({selectedOrders.length}):
            </label>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100 border border-slate-200 rounded-2xl p-2 bg-slate-50/50">
              {selectedOrders.map((order) => {
                const currentPaid = order.valorPago || 0;
                const saldo = Math.max(0, order.valor - currentPaid);
                return (
                  <div key={order.id} className="pt-2 first:pt-0 flex items-center justify-between text-xs px-2 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-slate-600 bg-slate-200/80 px-1.5 py-0.5 rounded shrink-0">
                        {order.id}
                      </span>
                      <span className="font-bold text-slate-800 truncate">{order.marca}</span>
                      <span className="text-slate-400 hidden sm:inline">• {formatDateBR(order.data)}</span>
                    </div>
                    <span className="font-extrabold text-amber-700 shrink-0 ml-2">
                      {formatCurrency(saldo)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Observação input */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Observação da Baixa em Lote (opcional)
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Recebido em PIX / Depósito bancário único"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
            />
          </div>

          {/* Warning note */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Esta ação marcará os <strong>{selectedOrders.length} pedidos</strong> selecionados como <strong>QUITADOS</strong> e atualizará o saldo devedor de cada cliente.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || selectedOrders.length === 0}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md shadow-amber-600/20 transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processando Baixa...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Baixa de {selectedOrders.length} Pedidos</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
