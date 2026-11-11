import React, { useState, useEffect } from 'react';
import { Order, User } from '../types';
import { formatCurrency, formatDateBR } from '../utils/pdfGenerator';
import {
  CheckCircle2,
  X,
  FileCheck,
  ShieldAlert,
  DollarSign,
  PieChart,
  History,
} from 'lucide-react';

interface SettlementModalProps {
  order: Order | null;
  currentUser: User;
  onClose: () => void;
  onSettleOrder: (
    orderId: string,
    observacao: string,
    valorBaixa?: number,
    tipo?: 'total' | 'parcial'
  ) => Promise<void>;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  order,
  currentUser,
  onClose,
  onSettleOrder,
}) => {
  const [tipoBaixa, setTipoBaixa] = useState<'total' | 'parcial'>('total');
  const [valorBaixaInput, setValorBaixaInput] = useState('');
  const [observacao, setObservacao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      const currentPaid = order.valorPago || 0;
      const saldo = Math.max(0, order.valor - currentPaid);
      setValorBaixaInput(saldo > 0 ? saldo.toString() : '');
      setTipoBaixa('total');
      setObservacao('');
      setError(null);
    }
  }, [order]);

  if (!order) return null;

  const currentPaid = order.valorPago || 0;
  const saldoRestante = Math.max(0, order.valor - currentPaid);

  const valorPagamentoNum =
    tipoBaixa === 'total'
      ? saldoRestante
      : valorBaixaInput !== ''
      ? Number(valorBaixaInput)
      : 0;

  const novoSaldoPendente = Math.max(0, saldoRestante - (isNaN(valorPagamentoNum) ? 0 : valorPagamentoNum));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (tipoBaixa === 'parcial') {
      if (isNaN(valorPagamentoNum) || valorPagamentoNum <= 0) {
        setError('Por favor, insira um valor válido para a baixa parcial.');
        return;
      }
      if (valorPagamentoNum > saldoRestante) {
        setError(
          `O valor do pagamento parcial (${formatCurrency(
            valorPagamentoNum
          )}) não pode ser maior do que o saldo pendente (${formatCurrency(saldoRestante)}).`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSettleOrder(
        order.id,
        observacao,
        valorPagamentoNum,
        tipoBaixa
      );
      onClose();
    } catch (err) {
      setError('Erro ao registrar a baixa do pedido.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-amber-600 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-700/60 flex items-center justify-center text-white font-bold">
              <FileCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">Dar Baixa no Pedido</h3>
              <p className="text-xs text-amber-100">Liquidação total ou abatimento parcial</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-amber-700 rounded-lg text-amber-200 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3.5 py-2.5 rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Card Resumo do Pedido */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-bold uppercase">Cliente / Marca</span>
              <span className="text-xs font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                {order.id}
              </span>
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900">VV - {order.marca}</p>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200">
              <div>
                <span className="text-slate-500 block">Data do Pedido:</span>
                <span className="font-bold text-slate-800">{formatDateBR(order.data)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Vendedor:</span>
                <span className="font-bold text-slate-800">{order.vendedor}</span>
              </div>
            </div>

            {/* Quadro Financeiro do Pedido */}
            <div className="pt-2.5 border-t border-slate-200 grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-2 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Valor Total</span>
                <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                  {formatCurrency(order.valor)}
                </span>
              </div>
              <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                <span className="text-[10px] text-emerald-700 font-bold block uppercase">Já Pago</span>
                <span className="text-xs sm:text-sm font-extrabold text-emerald-700">
                  {formatCurrency(currentPaid)}
                </span>
              </div>
              <div className="bg-amber-50 p-2 rounded-lg border border-amber-200">
                <span className="text-[10px] text-amber-800 font-bold block uppercase">Saldo Devedor</span>
                <span className="text-xs sm:text-sm font-extrabold text-amber-900">
                  {formatCurrency(saldoRestante)}
                </span>
              </div>
            </div>
          </div>

          {/* Histórico de Baixas Anteriores (se houver) */}
          {order.historicoBaixas && order.historicoBaixas.length > 0 && (
            <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <History className="w-3.5 h-3.5 text-amber-600" />
                <span>Histórico de Pagamentos Anteriores ({order.historicoBaixas.length})</span>
              </div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {order.historicoBaixas.map((bx, idx) => (
                  <div
                    key={bx.id || idx}
                    className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-[11px]"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{formatCurrency(bx.valor)}</span>
                      <span className="text-slate-500 ml-2">por {bx.baixadoPor}</span>
                      {bx.observacao && (
                        <p className="text-[10px] text-slate-500 italic truncate max-w-[180px]">
                          "{bx.observacao}"
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(bx.data).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seleção do Tipo de Baixa */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-amber-600" />
              Tipo de Baixa
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipoBaixa('total');
                  setValorBaixaInput(saldoRestante.toString());
                  setError(null);
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                  tipoBaixa === 'total'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>Baixa Total (Quitação)</span>
                <span className="text-[10px] opacity-80">{formatCurrency(saldoRestante)}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTipoBaixa('parcial');
                  if (valorBaixaInput === saldoRestante.toString()) {
                    setValorBaixaInput('');
                  }
                  setError(null);
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                  tipoBaixa === 'parcial'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>Baixa Parcial</span>
                <span className="text-[10px] opacity-80">Digitar valor abates</span>
              </button>
            </div>
          </div>

          {/* Campo de Valor em Baixa Parcial */}
          {tipoBaixa === 'parcial' && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2 animate-fade-in">
              <label className="block text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                Valor do Pagamento Parcial (R$)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  max={saldoRestante}
                  value={valorBaixaInput}
                  onChange={(e) => setValorBaixaInput(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3.5 py-2 bg-white border border-amber-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setValorBaixaInput((saldoRestante / 2).toFixed(2))}
                  className="px-2.5 py-2 bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 text-[11px] font-bold rounded-xl whitespace-nowrap"
                >
                  50%
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 text-amber-900">
                <span>Saldo restante após este abate:</span>
                <span className="font-extrabold text-amber-950">
                  {formatCurrency(novoSaldoPendente)}
                </span>
              </div>
            </div>
          )}

          {/* Insígnia do Usuário */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <p>
              Operação registrada por <strong>{currentUser.name}</strong> (Gestão Autorizada).
            </p>
          </div>

          {/* Observação */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Observação / Comprovante (Opcional)
            </label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Pagamento efetuado via PIX, dinheiro no caixa..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
            />
          </div>

          {/* Botões */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs sm:text-sm transition-colors min-h-[42px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition-colors flex items-center justify-center gap-2 min-h-[42px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {tipoBaixa === 'parcial' ? 'Confirmar Abate' : 'Confirmar Quitação'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
