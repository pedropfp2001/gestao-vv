import React from 'react';
import { Smartphone, Download, Share, PlusSquare, X, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
  canInstallNative: boolean;
  onInstallNative: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  isIOS,
  canInstallNative,
  onInstallNative,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden text-slate-800">
        {/* Header with Traviu Gradient */}
        <div className="bg-linear-to-r from-blue-900 via-blue-800 to-indigo-900 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center shadow-inner">
              <Smartphone className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase bg-blue-500/30 px-2 py-0.5 rounded-full border border-blue-400/30 inline-block mb-1">
                Disponível no Celular
              </span>
              <h3 className="text-xl font-black leading-tight">Instalar Traviu App</h3>
            </div>
          </div>
          <p className="text-xs text-blue-100/90 mt-2">
            Acesse rapidamente direto da tela inicial do seu celular, com suporte offline e sem barras do navegador.
          </p>
        </div>

        {/* Body content */}
        <div className="p-6 space-y-5">
          {/* Key Advantages */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Acesso Instantâneo</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Funciona Sem Internet</span>
            </div>
          </div>

          {/* iOS Specific Instructions */}
          {isIOS ? (
            <div className="space-y-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-amber-900 font-extrabold text-sm">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                Como instalar no iPhone / iPad (iOS):
              </div>
              <ol className="space-y-3 text-xs text-amber-950 font-medium list-decimal list-inside pl-1">
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">1.</span>
                  <span>
                    No Safari, toque no botão <strong>Compartilhar</strong>{' '}
                    <Share className="w-4 h-4 inline text-blue-600 mx-0.5" /> (o ícone de quadrado com uma seta para cima na barra inferior).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">2.</span>
                  <span>
                    Role para baixo no menu e toque em <strong>"Adicionar à Tela de Início"</strong>{' '}
                    <PlusSquare className="w-4 h-4 inline text-slate-800 mx-0.5" />.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">3.</span>
                  <span>
                    Toque em <strong>"Adicionar"</strong> no canto superior direito. Pronto! O ícone do app Traviu aparecerá na sua tela inicial.
                  </span>
                </li>
              </ol>
            </div>
          ) : (
            /* Android / Chrome Native Prompt */
            <div className="space-y-4">
              {canInstallNative ? (
                <div className="text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    Seu aparelho Android é 100% compatível! Toque no botão abaixo para adicionar o app à sua tela inicial:
                  </p>
                  <button
                    onClick={() => {
                      onInstallNative();
                      onClose();
                    }}
                    className="w-full py-3.5 px-6 rounded-2xl bg-linear-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-xl shadow-blue-900/20 active:scale-98 transition-all"
                  >
                    <Download className="w-5 h-5 text-blue-200" />
                    Baixar e Instalar Aplicativo
                  </button>
                </div>
              ) : (
                /* Android Manual Instructions */
                <div className="space-y-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 text-xs text-blue-950">
                  <div className="font-extrabold text-sm text-blue-900 flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    Como instalar no Android (Chrome):
                  </div>
                  <ol className="space-y-2 list-decimal list-inside pl-1 font-medium">
                    <li>Toque nos <strong>três pontinhos (⋮)</strong> no canto superior direito do Chrome.</li>
                    <li>Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</li>
                    <li>Confirme em <strong>"Instalar"</strong>.</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          <div className="pt-2 text-center">
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold transition-colors"
            >
              Agora não, continuar pelo navegador
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
