import React, { useState } from 'react';
import { User } from '../types';
import {
  Sparkles,
  FileCheck,
  History,
  FileText,
  UserCheck,
  ShieldCheck,
  LogOut,
  Upload,
  Users,
  HardDrive,
  BarChart3,
  Bell,
  FileWarning,
  Smartphone,
  Camera,
  Loader2,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

interface NavbarProps {
  currentUser: User;
  activeTab: 'aberto' | 'vendedores' | 'baixas' | 'relatorios' | 'boletos';
  setActiveTab: (tab: 'aberto' | 'vendedores' | 'baixas' | 'relatorios' | 'boletos') => void;
  onOpenUploadModal: () => void;
  onOpenBackupModal: () => void;
  onSwitchUser: () => void;
  openOrdersCount: number;
  overdueBoletosCount?: number;
  unreadNotificationsCount?: number;
  onOpenNotificationsModal?: () => void;
  onSendTestNotification?: () => void;
  onOpenInstallModal?: () => void;
  isInstalled?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  onOpenUploadModal,
  onOpenBackupModal,
  onSwitchUser,
  openOrdersCount,
  overdueBoletosCount = 0,
  unreadNotificationsCount = 0,
  onOpenNotificationsModal,
  onSendTestNotification,
  onOpenInstallModal,
  isInstalled = false,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isAdmin = currentUser.role === 'admin';
  const canSeeVendedoresTab = currentUser.name !== 'Ricardo' && currentUser.name !== 'Wanderley';

  const handleSelectTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const isSecondaryTabActive =
    activeTab !== 'aberto' && activeTab !== 'boletos';

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-xl border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Header Row (Compact on mobile: 50px) */}
        <div className="flex items-center justify-between h-12.5 sm:h-16 gap-2 sm:gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-sm sm:text-xl text-white shadow-md shadow-blue-500/20 shrink-0">
              VV
            </div>
            <div>
              <h1 className="font-extrabold text-sm sm:text-lg tracking-tight leading-tight flex items-center gap-1.5">
                <span>Gestão de Pedidos</span>
              </h1>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                Controle de vendas e comprovações
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Install PWA Button (Desktop only here, mobile has in menu) */}
            {onOpenInstallModal && !isInstalled && (
              <button
                onClick={onOpenInstallModal}
                className="hidden md:flex bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-500/50 font-bold px-2.5 py-1.5 rounded-xl transition-all items-center gap-1 text-xs shadow-xs"
                title="Baixar aplicativo no celular"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-100" />
                <span>Baixar App</span>
              </button>
            )}

            {/* Notifications Bell */}
            <button
              onClick={onOpenNotificationsModal}
              className="relative bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold p-1.5 sm:p-2 rounded-xl transition-all flex items-center justify-center text-xs"
              title="Notificações e Alertas de Cobrança"
            >
              <Bell className="w-4 h-4 text-amber-400" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 font-black text-[9px] rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Backup Button (desktop only, somente Gestão Total) */}
            {isAdmin && (
            <button
              onClick={onOpenBackupModal}
              className="hidden md:flex bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-3 py-1.5 rounded-xl transition-all items-center gap-1.5 text-xs"
              title="Backup e Segurança dos dados"
            >
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Backup</span>
            </button>
            )}

            {/* Lançar Pedido Button (somente Gestão Total) */}
            {isAdmin && (
            <button
              onClick={onOpenUploadModal}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-black px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl shadow-md shadow-blue-600/30 transition-all flex items-center gap-1 text-xs"
              title="Lançar novo pedido"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lançar Pedido</span>
              <span className="sm:hidden">+ Pedido</span>
            </button>
            )}

            {/* Desktop User Badge */}
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 p-1 pl-2 rounded-xl border border-slate-700/80">
              <div className="w-6 h-6 rounded-lg bg-slate-700 text-blue-400 flex items-center justify-center font-extrabold text-[11px] shrink-0">
                {currentUser.name.substring(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-slate-200 pr-1">
                {currentUser.name}
              </span>
              <button
                onClick={onSwitchUser}
                title="Trocar de usuário"
                className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className={`md:hidden p-1.5 rounded-xl border transition-colors flex items-center gap-1 ${
                isSecondaryTabActive
                  ? 'bg-blue-600 text-white border-blue-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Abrir menu de opções e telas secundárias"
            >
              <Menu className="w-4 h-4" />
              <span className="text-[11px] font-bold">Mais</span>
            </button>
          </div>
        </div>

        {/* MOBILE PRIMARY SEGMENTED TABS (Slim 36px bar for Pedidos & Boletos) */}
        <div className="md:hidden pb-1.5 pt-1 border-t border-slate-800/80">
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950/80 rounded-xl border border-slate-800 shadow-inner">
            {/* Pedidos em Aberto */}
            <button
              onClick={() => handleSelectTab('aberto')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'aberto'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Pedidos</span>
              <span
                className={`px-1.5 py-0.2 text-[10px] rounded-full font-black ${
                  activeTab === 'aberto'
                    ? 'bg-white text-blue-800'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {openOrdersCount}
              </span>
            </button>

            {/* Boletos em Atraso */}
            <button
              onClick={() => handleSelectTab('boletos')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'boletos'
                  ? 'bg-red-600 text-white shadow-md ring-1 ring-red-400/40'
                  : 'text-red-300 hover:text-white'
              }`}
            >
              <FileWarning className="w-3.5 h-3.5 shrink-0" />
              <span>Boletos</span>
              {overdueBoletosCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 text-[10px] rounded-full font-black ${
                    activeTab === 'boletos'
                      ? 'bg-white text-red-800'
                      : 'bg-red-950 text-red-300 border border-red-800/80'
                  }`}
                >
                  {overdueBoletosCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* DESKTOP NAVIGATION TABS (Pedidos e Boletos lado a lado) */}
        <div className="hidden md:flex items-center gap-1.5 border-t border-slate-800 pt-2 pb-2">
          {/* 1. Pedidos em Aberto */}
          <button
            onClick={() => setActiveTab('aberto')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'aberto'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>Pedidos em Aberto</span>
            <span
              className={`px-1.5 py-0.5 text-[10px] rounded-full font-extrabold ${
                activeTab === 'aberto'
                  ? 'bg-white text-blue-700'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {openOrdersCount}
            </span>
          </button>

          {/* 2. Boletos em Atraso */}
          <button
            onClick={() => setActiveTab('boletos')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'boletos'
                ? 'bg-red-700 text-white shadow-md shadow-red-700/30 ring-1 ring-red-500/50'
                : 'text-red-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileWarning className="w-4 h-4 text-red-400" />
            <span>Boletos em Atraso</span>
            {overdueBoletosCount > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] rounded-full font-extrabold ${
                  activeTab === 'boletos'
                    ? 'bg-white text-red-800'
                    : 'bg-red-950 text-red-300 border border-red-800/80'
                }`}
              >
                {overdueBoletosCount}
              </span>
            )}
          </button>

          {/* 3. Vendedores por Marca */}
          {canSeeVendedoresTab && (
            <button
              onClick={() => setActiveTab('vendedores')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'vendedores'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4 text-blue-300" />
              <span>Vendedores por Marca</span>
            </button>
          )}

          {/* 4. Histórico de Baixas */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('baixas')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'baixas'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <History className="w-4 h-4 text-amber-300" />
              <span>Histórico de Baixas</span>
            </button>
          )}

          {/* 5. Relatórios PDF */}
          <button
            onClick={() => setActiveTab('relatorios')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'relatorios'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Relatórios PDF</span>
          </button>

          
        </div>
      </div>

      {/* MOBILE DRAWER MODAL (Acesso completo a todas as ferramentas sem poluir a tela) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-4 pb-6 space-y-4 shadow-2xl text-slate-200 z-10 animate-in slide-in-from-bottom duration-250">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs">
                  VV
                </div>
                <div>
                  <h3 className="text-sm font-black text-white leading-none">Menu Geral</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Usuário: {currentUser.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu List */}
            <div className="space-y-1 text-xs">
              <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider px-2 py-1">
                Navegação
              </div>

              <button
                onClick={() => handleSelectTab('aberto')}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl font-bold transition-colors ${
                  activeTab === 'aberto' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileCheck className="w-4 h-4 text-blue-400" />
                  <span>Pedidos em Aberto</span>
                </div>
                <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full text-[10px] font-black">
                  {openOrdersCount}
                </span>
              </button>

              <button
                onClick={() => handleSelectTab('boletos')}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl font-bold transition-colors ${
                  activeTab === 'boletos' ? 'bg-red-600 text-white' : 'hover:bg-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileWarning className="w-4 h-4 text-red-400" />
                  <span>Boletos em Atraso</span>
                </div>
                {overdueBoletosCount > 0 && (
                  <span className="bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded-full text-[10px] font-black">
                    {overdueBoletosCount}
                  </span>
                )}
              </button>

              {canSeeVendedoresTab && (
                <button
                  onClick={() => handleSelectTab('vendedores')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl font-bold transition-colors ${
                    activeTab === 'vendedores' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-blue-300" />
                    <span>Vendedores por Marca</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={() => handleSelectTab('baixas')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl font-bold transition-colors ${
                    activeTab === 'baixas' ? 'bg-amber-600 text-white' : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <History className="w-4 h-4 text-amber-300" />
                    <span>Histórico de Baixas</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              )}

              <button
                onClick={() => handleSelectTab('relatorios')}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl font-bold transition-colors ${
                  activeTab === 'relatorios' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-indigo-300" />
                  <span>Relatórios em PDF</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              

              <div className="text-[10px] font-black uppercase text-slate-500 tracking-wider px-2 py-1 pt-2">
                Recursos e Ações
              </div>

              {/* Instalar App no Celular */}
              {onOpenInstallModal && !isInstalled && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenInstallModal();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl font-bold text-emerald-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>Instalar Aplicativo no Celular</span>
                  </div>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    PWA
                  </span>
                </button>
              )}

              {/* Fazer Backup (somente Gestão Total) */}
              {isAdmin && (
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenBackupModal();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl font-bold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>Backup e Segurança</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
              )}

              {/* Alternar Usuário */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onSwitchUser();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer pt-2 border-t border-slate-800/80"
              >
                <div className="flex items-center gap-2.5">
                  <LogOut className="w-4 h-4" />
                  <span>Trocar de Usuário ({currentUser.name})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
