import React, { useState } from 'react';
import { AlertTriangle, Send, X, Building, DollarSign } from 'lucide-react';
import { formatCurrency } from '../utils/pdfGenerator';

interface SendAlertDialogModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerMarca: string;
  totalPendente: number;
  defaultSeller?: string;
  senderName: string;
  onSendAlert: (data: {
    targetUser: 'Ricardo' | 'Wanderley' | 'Todos';
    message: string;
  }) => void;
}

export const SendAlertDialogModal: React.FC<SendAlertDialogModalProps> = ({
  isOpen,
  onClose,
  customerMarca,
  totalPendente,
  defaultSeller,
  senderName,
  onSendAlert,
}) => {
  const initialTarget =
    defaultSeller === 'Ricardo' || defaultSeller === 'Wanderley'
      ? (defaultSeller as 'Ricardo' | 'Wanderley')
      : 'Ricardo';

  const [targetUser, setTargetUser] = useState<'Ricardo' | 'Wanderley' | 'Todos'>(initialTarget);
  const [customMessage, setCustomMessage] = useState('');

  if (!isOpen) return null;

  const defaultMsg = `Atenção: Cobrança urgente do cliente ${customerMarca}. Saldo pendente: ${formatCurrency(
    totalPendente
  )}. Por favor, verificar o acerto com o comprador.`;

  const handleSend = () => {
    onSendAlert({
      targetUser,
      message: customMessage.trim() || defaultMsg,
    });
    setCustomMessage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-bold">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold">Enviar Alerta de Cobrança</h3>
              <p className="text-xs text-amber-100">
                Notificar vendedor responsável por {customerMarca}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Summary Box */}
          <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-amber-700" />
                {customerMarca}
              </span>
              <span className="text-xs font-extrabold text-red-600">
                {formatCurrency(totalPendente)}
              </span>
            </div>
            <p className="text-[11px] text-amber-700">
              Enviado por: <strong className="text-amber-900">{senderName}</strong>
            </p>
          </div>

          {/* Target selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Notificar Usuário (Vendedor):
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Ricardo', 'Wanderley', 'Todos'] as const).map((user) => (
                <button
                  key={user}
                  type="button"
                  onClick={() => setTargetUser(user)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    targetUser === user
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {user}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Message */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              Mensagem do Alerta (Opcional):
            </label>
            <textarea
              rows={3}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder={defaultMsg}
              className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none text-slate-800"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSend}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Enviar Alerta para {targetUser}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
