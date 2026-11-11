import React, { useState } from 'react';
import { Order, OverdueBoleto, User } from '../types';
import {
  ShieldCheck,
  Download,
  CheckCircle2,
  Calendar,
  HardDrive,
  FileCheck,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';
import { formatDateBR } from '../utils/pdfGenerator';

interface DailyBackupReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  orders: Order[];
  boletos?: OverdueBoleto[];
  onDownloadSuccess?: () => void;
}

export const DailyBackupReminderModal: React.FC<DailyBackupReminderModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  orders,
  boletos = [],
  onDownloadSuccess,
}) => {
  const [downloaded, setDownloaded] = useState(false);

  if (!isOpen) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const openOrdersCount = orders.filter((o) => o.status === 'em_aberto').length;
  const openBoletosCount = boletos.filter((b) => b.situacao === 'EM ABERTO').length;

  const handleDownloadBackup = () => {
    try {
      const backupData = {
        app: 'Gestão de Pedidos VV',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: currentUser.name,
        totalOrders: orders.length,
        openOrders: openOrdersCount,
        settledOrders: orders.filter((o) => o.status === 'baixado').length,
        totalBoletos: boletos.length,
        openBoletos: openBoletosCount,
        orders: orders,
        boletos: boletos,
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Backup_Diario_VV_${todayStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Save today's date as processed
      try {
        localStorage.setItem('vv_last_backup_reminder_date', todayStr);
        localStorage.setItem('vv_last_backup_downloaded_date', todayStr);
      } catch (e) {
        console.error(e);
      }

      setDownloaded(true);
      onDownloadSuccess?.();

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Erro ao gerar backup diário:', err);
      alert('Erro ao gerar arquivo de backup: ' + err.message);
    }
  };

  const handleDismissToday = () => {
    try {
      localStorage.setItem('vv_last_backup_reminder_date', todayStr);
    } catch (e) {
      console.error(e);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header with visual banner */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 text-blue-300 flex items-center justify-center shadow-inner">
                <ShieldCheck className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-[10px] font-bold uppercase tracking-wider mb-1">
                  <Calendar className="w-3 h-3" />
                  Primeiro Login do Dia • {formatDateBR(todayStr)}
                </div>
                <h3 className="font-black text-lg text-white leading-tight">
                  Lembrete Diário de Backup
                </h3>
              </div>
            </div>
            <button
              onClick={handleDismissToday}
              className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body content */}
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">
              Olá, <span className="font-extrabold text-blue-700">{currentUser.name}</span>!
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Para garantir a máxima proteção e segurança das informações de pedidos, boletos e baixas financeiras, recomendamos baixar uma cópia de segurança diária local.
            </p>
          </div>

          {/* Metrics summary card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-3 text-center">
            <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                Total de Pedidos
              </span>
              <span className="text-lg font-black text-slate-900 mt-0.5 block">
                {orders.length} <span className="text-xs font-semibold text-slate-500">({openOrdersCount} abertos)</span>
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                Boletos Ativos
              </span>
              <span className="text-lg font-black text-slate-900 mt-0.5 block">
                {openBoletosCount} <span className="text-xs font-semibold text-slate-500">pendentes</span>
              </span>
            </div>
          </div>

          <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-800 leading-normal">
              O banco na nuvem <strong>Google Firestore</strong> está ativo e sincronizado. Este arquivo serve como cópia de redundância e contingência no seu computador ou dispositivo.
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleDownloadBackup}
              disabled={downloaded}
              className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                downloaded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30 hover:scale-101 active:scale-98'
              }`}
            >
              {downloaded ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Backup Baixado com Sucesso!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar Cópia de Backup Agora (JSON)</span>
                </>
              )}
            </button>

            <button
              onClick={handleDismissToday}
              className="w-full py-2.5 px-4 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors text-center"
            >
              Lembrar no próximo login / Continuar para o sistema
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
