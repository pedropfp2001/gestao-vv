import React, { useState, useEffect } from 'react';
import { RefreshCw, Clock, Bell, X, Check } from 'lucide-react';

interface RefreshReminderProps {
  lastUpdated: Date;
  onRefresh: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export const RefreshReminder: React.FC<RefreshReminderProps> = ({
  lastUpdated,
  onRefresh,
  isRefreshing = false,
}) => {
  // Intervalo configurado: padrão de 2 horas (120 minutos) para todos os usuários
  const [intervalMinutes, setIntervalMinutes] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('traviu_refresh_interval');
      const num = saved ? Number(saved) : 120;
      // Atualiza valores legados menores que 30 para o padrão de 2 horas solicitado
      return (!saved || isNaN(num) || num < 30) ? 120 : num;
    } catch {
      return 120;
    }
  });

  const [timeAgoStr, setTimeAgoStr] = useState<string>('agora');
  const [showReminderBanner, setShowReminderBanner] = useState<boolean>(false);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState<boolean>(false);

  // Formatação amigável de tempo (ex: "agora", "há 45 min", "há 1h 20m", "há 2h")
  const formatDiffTime = (diffMinutes: number, diffSeconds: number) => {
    if (diffMinutes < 1) {
      return diffSeconds < 10 ? 'agora' : `há ${diffSeconds}s`;
    }
    if (diffMinutes < 60) {
      return `há ${diffMinutes} min`;
    }
    const hours = Math.floor(diffMinutes / 60);
    const remainingMins = diffMinutes % 60;
    if (remainingMins === 0) {
      return `há ${hours}h`;
    }
    return `há ${hours}h ${remainingMins}m`;
  };

  // Update time-ago string every 15 seconds
  useEffect(() => {
    const updateLabel = () => {
      const diffMs = Date.now() - lastUpdated.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      const diffSeconds = Math.floor((diffMs % 60000) / 1000);

      setTimeAgoStr(formatDiffTime(diffMinutes, diffSeconds));

      // Dispara o lembrete quando atinge 2 horas (ou o intervalo configurado)
      if (intervalMinutes > 0 && diffMinutes >= intervalMinutes) {
        setShowReminderBanner(true);
      }
    };

    updateLabel();
    const timer = setInterval(updateLabel, 15000);
    return () => clearInterval(timer);
  }, [lastUpdated, intervalMinutes]);

  const handleManualRefresh = async () => {
    setShowReminderBanner(false);
    await onRefresh();
  };

  const handleSelectInterval = (mins: number) => {
    setIntervalMinutes(mins);
    try {
      localStorage.setItem('traviu_refresh_interval', String(mins));
    } catch {}
    setShowSettingsDropdown(false);
    setShowReminderBanner(false);
  };

  const formatIntervalLabel = (mins: number) => {
    if (mins === 0) return 'Apenas Manual';
    if (mins === 60) return 'A cada 1 hora';
    if (mins === 120) return 'A cada 2 horas (Padrão)';
    if (mins === 180) return 'A cada 3 horas';
    if (mins === 240) return 'A cada 4 horas';
    return `A cada ${mins} minutos`;
  };

  return (
    <>
      {/* Header Refresh Bar Widget */}
      <div className="relative inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl px-2.5 py-1 text-xs transition-colors shadow-2xs">
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 text-slate-700 font-bold hover:text-blue-700 cursor-pointer disabled:opacity-50"
          title="Toque para atualizar dados agora"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          <span className="hidden sm:inline">Atualizado</span>
          <span className="font-extrabold text-blue-800">{timeAgoStr}</span>
        </button>

        <button
          onClick={() => setShowSettingsDropdown((prev) => !prev)}
          className="p-1 hover:bg-slate-200/70 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
          title="Configurar frequência do lembrete (Padrão: 2 horas)"
        >
          <Clock className="w-3.5 h-3.5" />
        </button>

        {/* Interval Dropdown */}
        {showSettingsDropdown && (
          <>
            {/* Backdrop to close on tap outside */}
            <div
              className="fixed inset-0 z-40 bg-black/25 backdrop-blur-2xs"
              onClick={() => setShowSettingsDropdown(false)}
            />
            <div className="fixed left-4 right-4 top-20 sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:w-64 max-w-xs mx-auto sm:mx-0 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2 py-1 text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
                Lembrete de Atualização
              </div>
              <div className="space-y-1 mt-1">
                {[
                  { label: 'A cada 2 horas (Padrão para todos)', value: 120 },
                  { label: 'A cada 1 hora', value: 60 },
                  { label: 'A cada 3 horas', value: 180 },
                  { label: 'A cada 4 horas', value: 240 },
                  { label: 'Apenas Manual', value: 0 },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSelectInterval(opt.value)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-colors cursor-pointer ${
                      intervalMinutes === opt.value
                        ? 'bg-blue-50 text-blue-800 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {intervalMinutes === opt.value && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Floating Refresh Reminder Banner (Dispara após 2 horas) */}
      {showReminderBanner && (
        <div className="fixed bottom-5 right-5 left-5 sm:left-auto sm:max-w-md z-50 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold leading-tight text-white">
                  Lembrete: 2 horas desde a última sincronização
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Toque para atualizar e conferir os pedidos e boletos mais recentes.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleManualRefresh}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar Agora
              </button>
              <button
                onClick={() => setShowReminderBanner(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Fechar lembrete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
