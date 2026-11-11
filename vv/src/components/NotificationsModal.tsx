import React from 'react';
import { AppNotification, User } from '../types';
import { Bell, CheckCircle2, Clock, Trash2, X, AlertTriangle, Send, Sparkles } from 'lucide-react';
import { formatCurrency } from '../utils/pdfGenerator';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  currentUser: User;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onSendTestNotification?: () => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  currentUser,
  onMarkAsRead,
  onMarkAllAsRead,
  onSendTestNotification,
}) => {
  if (!isOpen) return null;

  // Filter notifications relevant to current user (or show all for Pedro/Admin)
  const userNotifications = notifications.filter(
    (n) =>
      n.targetUser === currentUser.name ||
      n.targetUser === 'Todos' ||
      currentUser.name === 'Pedro' ||
      n.senderName === currentUser.name
  );

  const unreadCount = userNotifications.filter((n) => !n.read).length;

  const formatDate = (isoStr: string) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                Central de Notificações e Alertas
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-[10px] rounded-full">
                    {unreadCount} nova(s)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Alertas de cobrança e avisos para {currentUser.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Exclusive Test Button for Pedro */}
        {currentUser.name === 'Pedro' && onSendTestNotification && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 p-3.5 px-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <span className="text-xs font-bold text-amber-900 block">
                  Modo de Teste Ativo (Usuário Pedro)
                </span>
                <span className="text-[11px] text-amber-700">
                  Clique no botão para disparar uma notificação de teste para Ricardo e Wanderley.
                </span>
              </div>
            </div>

            <button
              onClick={onSendTestNotification}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all shrink-0 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Testar Alerta</span>
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600">
            {userNotifications.length} notificação(ões) registrada(s)
          </span>

          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Marcar todas como lidas</span>
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {userNotifications.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
              <Bell className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">Nenhuma notificação no momento.</p>
              <p className="text-[11px] text-slate-400">
                Os alertas de cobrança e avisos de clientes enviados por Pedro, Igor ou Daniel aparecerão aqui.
              </p>
            </div>
          ) : (
            userNotifications.map((notif) => {
              const isSyncError = notif.type === 'sync_error' || notif.senderName === 'Sistema';

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-xl border transition-all space-y-2 ${
                    isSyncError
                      ? notif.read
                        ? 'bg-red-50/40 border-red-200'
                        : 'bg-red-50 border-red-400 shadow-md ring-2 ring-red-500/20'
                      : notif.read
                      ? 'bg-white border-slate-200'
                      : 'bg-amber-50/60 border-amber-300 shadow-xs ring-1 ring-amber-400/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`p-1.5 rounded-lg border ${
                          isSyncError
                            ? 'bg-red-600 text-white border-red-700'
                            : 'bg-amber-100 text-amber-700 border-amber-200'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </span>
                      <div>
                        <span
                          className={`text-xs font-black block ${
                            isSyncError ? 'text-red-950' : 'text-slate-900'
                          }`}
                        >
                          {isSyncError
                            ? `🚨 Falha Crítica de Sincronização: ${notif.cliente}`
                            : `Alerta de Cobrança: ${notif.cliente}`}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          De: <strong className="text-slate-800">{notif.senderName}</strong> • Para:{' '}
                          <strong className="text-slate-800">{notif.targetUser}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(notif.createdAt)}
                      </span>
                      {!notif.read && (
                        <button
                          onClick={() => onMarkAsRead(notif.id)}
                          className={`px-2 py-0.5 font-bold text-[10px] rounded-md transition-colors ${
                            isSyncError
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                          title="Marcar como lida"
                        >
                          {isSyncError ? 'Reconhecer' : 'Lida'}
                        </button>
                      )}
                    </div>
                  </div>

                  <p
                    className={`text-xs p-2.5 rounded-lg border font-medium leading-relaxed ${
                      isSyncError
                        ? 'text-red-900 bg-red-100/60 border-red-200'
                        : 'text-slate-700 bg-slate-50 border-slate-100'
                    }`}
                  >
                    {notif.message}
                  </p>

                  {notif.errorDetails && (
                    <div className="text-[11px] bg-slate-900 text-red-300 p-2 rounded font-mono break-all">
                      <strong className="text-slate-300">Causa:</strong> {notif.errorDetails}
                    </div>
                  )}

                  {notif.valorPendente && notif.valorPendente > 0 ? (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-slate-500 text-[11px]">Valor:</span>
                      <span className="font-extrabold text-red-600">
                        {formatCurrency(notif.valorPendente)}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
