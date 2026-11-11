import React, { useState, useEffect, useRef } from 'react';
import { User, Order, OverdueBoleto, canUserEdit, AppNotification } from './types';
import { USERS } from './data/users';
import { Navbar } from './components/Navbar';
import { OrderCard } from './components/OrderCard';
import { OrderListView } from './components/OrderListView';
import { LoginModal } from './components/LoginModal';
import { OrderUploadModal } from './components/OrderUploadModal';
import { ImageModal } from './components/ImageModal';
import { SettlementModal } from './components/SettlementModal';
import { BatchSettlementModal } from './components/BatchSettlementModal';
import { EditOrderModal } from './components/EditOrderModal';
import { SettlementHistoryView } from './components/SettlementHistoryView';
import { CustomerReportModal } from './components/CustomerReportModal';
import { FinancialSummaryModal } from './components/FinancialSummaryModal';
import { BrandSellersView } from './components/BrandSellersView';
import { BackupModal } from './components/BackupModal';
import { NotificationsModal } from './components/NotificationsModal';
import { BoletosView } from './components/BoletosView';
import { OpenOrdersReportModal } from './components/OpenOrdersReportModal';
import { DailyBackupReminderModal } from './components/DailyBackupReminderModal';
import { PWAInstallModal } from './components/PWAInstallModal';
import { RefreshReminder } from './components/RefreshReminder';
import { usePWAInstall } from './hooks/usePWAInstall';
import { formatCurrency, generateOpenOrdersGridPDF, generateOverdueBoletosGridPDF, getFreshestBoletos, generateBothOpenOrdersReports, setReportUser } from './utils/pdfGenerator';
import { safeFetch, getFailedSyncQueue, clearFailedSyncQueue, SyncErrorRecord } from './utils/apiClient';
import { matchesOrderSearch } from './utils/searchHelper';
import {
  Search,
  Filter,
  Plus,
  Building,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  CheckCircle2,
  X,
  Table as TableIcon,
  Download,
  Layers,
  Loader2,
  AlertTriangle,
} from 'lucide-react';

type TabId = 'aberto' | 'vendedores' | 'baixas' | 'relatorios' | 'boletos';

export default function App() {
  const { isInstalled, isIOS, canInstall, triggerInstall, showIOSModal, setShowIOSModal } = usePWAInstall();
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  // Sessão: vem do servidor (cookie assinado). Nenhuma senha fica no navegador.
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('aberto');
  const [boletos, setBoletos] = useState<OverdueBoleto[]>([]);
  const [overdueBoletosCount, setOverdueBoletosCount] = useState<number>(0);
  const [cloudWarning, setCloudWarning] = useState(false);

  const [viewMode, setViewMode] = useState<'cards' | 'lista'>('cards');
  const [statusFilter, setStatusFilter] = useState<'aberto' | 'baixado' | 'todos'>('aberto');
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [failedSyncList, setFailedSyncList] = useState<SyncErrorRecord[]>(() => getFailedSyncQueue());

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isDailyBackupReminderOpen, setIsDailyBackupReminderOpen] = useState(false);
  const [isOpenOrdersReportModalOpen, setIsOpenOrdersReportModalOpen] = useState(false);
  const [selectedImageOrder, setSelectedImageOrder] = useState<Order | null>(null);
  const [selectedSettlementOrder, setSelectedSettlementOrder] = useState<Order | null>(null);
  const [selectedEditOrder, setSelectedEditOrder] = useState<Order | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isBatchSettlementModalOpen, setIsBatchSettlementModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState<string>('todos');
  const [downloadingBothReports, setDownloadingBothReports] = useState(false);

  const sessionUserName = useRef<string | null>(null);
  // usuário para as funções que dependem dele (nunca nulo quando a tela principal aparece)
  const cu: User = currentUser || USERS[0];

  const ensureOrdersArray = (val: any): Order[] => (Array.isArray(val) ? val : []);

  const setCurrentUser = (u: User | null) => {
    sessionUserName.current = u ? u.name : null;
    setCurrentUserState(u);
  };

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    setCurrentUser(null);
    setOrders([]); setBoletos([]); setNotifications([]); setSelectedOrderIds([]);
    setIsLoginModalOpen(true);
  };

  // Restaura a sessão ao abrir o app
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/auth/me');
        if (r.ok) {
          const me = await r.json();
          const u = USERS.find((x) => x.name === me.name);
          if (u) { setCurrentUser(u); setAuthChecked(true); return; }
        }
      } catch {}
      setAuthChecked(true);
      setIsLoginModalOpen(true);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      if (!sessionUserName.current) return;
      setCurrentUser(null);
      setIsLoginModalOpen(true);
      setToastMessage({ message: 'Sua sessão expirou. Entre novamente.', type: 'info' });
    };
    window.addEventListener('vv-unauthorized', onUnauthorized);
    return () => window.removeEventListener('vv-unauthorized', onUnauthorized);
  }, []);

  const handleQuickDownloadBothReports = async () => {
    const boletosList = Array.isArray(boletos) ? boletos : [];
    setDownloadingBothReports(true);
    try {
      setReportUser(cu.name);
      await generateBothOpenOrdersReports(ensureOrdersArray(orders).filter((o) => o.status === 'em_aberto'), 'download', undefined, boletosList);
      setToastMessage({ message: '3 relatórios gerados (1 pedido, 2+ pedidos e boletos).', type: 'success' });
    } catch (err) {
      console.error('Erro ao baixar relatórios consolidados:', err);
      setToastMessage({ message: 'Erro ao gerar os relatórios.', type: 'error' });
    } finally {
      setDownloadingBothReports(false);
    }
  };

  // O servidor (Firestore) é a única fonte de verdade: a tela só exibe o que ele devolve.
  const fetchOrders = async (silent = false) => {
    try {
      const res = await safeFetch<Order[]>('/api/orders', { silent: true });
      if (res.ok && Array.isArray(res.data)) {
        setOrders(res.data);
        setCloudWarning(res.storeStatus === 'quota');
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await safeFetch<AppNotification[]>('/api/notifications', { silent: true });
      if (res.ok && Array.isArray(res.data)) setNotifications(res.data);
    } catch (err) {
      console.error('Erro ao buscar notificações:', err);
    }
  };

  const sendNotification = async (data: {
    senderName: string;
    targetUser: 'Ricardo' | 'Wanderley' | 'Pedro' | 'Daniel' | 'Igor' | 'Todos';
    cliente: string;
    valorPendente?: number;
    message?: string;
  }) => {
    try {
      const res = await safeFetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        actionType: 'notification_send',
        cliente: data.cliente,
        valor: data.valorPendente,
        actionDescription: `Envio de Alerta para ${data.targetUser}`,
      });
      if (res.ok) {
        await fetchNotifications();
        setToastMessage({ message: `🔔 Alerta enviado para ${data.targetUser}!`, type: 'success' });
      }
    } catch (err) {
      console.error('Erro ao enviar notificação:', err);
    }
  };

  const handleMarkNotificationAsRead = async (id: string) => {
    await safeFetch(`/api/notifications/${id}/read`, { method: 'PUT', silent: true });
    fetchNotifications();
  };

  const handleMarkAllNotificationsAsRead = async () => {
    await safeFetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: cu.name }),
      silent: true,
    });
    fetchNotifications();
  };

  const fetchBoletos = async () => {
    try {
      const res = await safeFetch<OverdueBoleto[]>('/api/boletos', { silent: true });
      if (res.ok && Array.isArray(res.data)) {
        setBoletos(res.data);
        setOverdueBoletosCount(res.data.filter((b) => b.situacao === 'EM ABERTO').length);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.warn('Erro ao carregar boletos:', err);
    }
  };

  const refreshAll = () => {
    fetchOrders(true);
    fetchNotifications();
    fetchBoletos();
    setFailedSyncList(getFailedSyncQueue());
  };

  // Carrega dados e sincroniza a cada 6s (aba visível) somente com sessão válida
  useEffect(() => {
    if (!currentUser) return;
    fetchOrders();
    fetchNotifications();
    fetchBoletos();

    const handleSyncErrorEvent = (event: any) => {
      setFailedSyncList(getFailedSyncQueue());
      fetchNotifications();
      const detail = event.detail;
      setToastMessage({
        message: `🚨 Falha ao salvar ${detail?.record?.actionType || 'operação'}. Tente novamente; se persistir, avise o Pedro.`,
        type: 'error',
      });
    };
    const handleQueueUpdateEvent = () => setFailedSyncList(getFailedSyncQueue());
    window.addEventListener('admin-sync-error', handleSyncErrorEvent);
    window.addEventListener('sync-queue-updated', handleQueueUpdateEvent);

    const interval = setInterval(() => { if (!document.hidden) refreshAll(); }, 6000);
    const onVisible = () => { if (!document.hidden) refreshAll(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('admin-sync-error', handleSyncErrorEvent);
      window.removeEventListener('sync-queue-updated', handleQueueUpdateEvent);
    };
  }, [currentUser?.name]);

  const handleOrderCreated = (newOrder: Order) => {
    setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
    fetchOrders(true);
  };

  const handleSettleOrder = async (
    orderId: string,
    observacao: string,
    valorBaixa?: number,
    tipo: 'total' | 'parcial' = 'total'
  ) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    const res = await safeFetch<Order>(`/api/orders/${orderId}/baixa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baixadoPor: cu.name, observacaoBaixa: observacao, valorBaixa, tipo }),
      actionType: 'baixa',
      referenceId: orderId,
      cliente: targetOrder?.marca,
      valor: valorBaixa || targetOrder?.valor,
      actionDescription: `Baixa de Pedido #${orderId} (${targetOrder?.marca || 'Cliente'})`,
    });
    if (res.ok && res.data) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data! : o)));
      fetchOrders(true);
      setToastMessage({
        message: tipo === 'parcial' ? '✅ Baixa parcial registrada.' : '✅ Baixa total concluída.',
        type: 'success',
      });
    } else {
      setToastMessage({ message: `❌ Não foi possível confirmar a baixa: ${res.error || 'erro no servidor'}.`, type: 'error' });
    }
  };

  const handleConfirmBatchSettlement = async (observacao: string) => {
    if (selectedOrderIds.length === 0) return;
    const selected = ensureOrdersArray(orders).filter((o) => selectedOrderIds.includes(o.id));
    const totalVal = selected.reduce((sum, o) => sum + (o.valor - (o.valorPago || 0)), 0);
    const res = await safeFetch<any>('/api/orders/baixa-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds: selectedOrderIds, baixadoPor: cu.name, observacaoBaixa: observacao }),
      actionType: 'baixa_lote',
      referenceId: `${selectedOrderIds.length} pedidos`,
      valor: totalVal,
      actionDescription: `Baixa em lote de ${selectedOrderIds.length} pedidos`,
    });
    if (res.ok) {
      setSelectedOrderIds([]);
      await fetchOrders(true);
      setToastMessage({ message: '✅ Baixa em lote realizada com sucesso.', type: 'success' });
    } else {
      setToastMessage({ message: `❌ Erro na baixa em lote: ${res.error || 'falha no servidor'}.`, type: 'error' });
    }
  };

  const handleEstornoOrder = async (orderId: string, motivo: string) => {
    const res = await safeFetch<{ success: boolean; updatedOrder: Order }>(`/api/orders/${orderId}/estorno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estornadoPor: cu.name, motivo }),
    });
    if (res.ok && res.data?.updatedOrder) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data!.updatedOrder : o)));
      fetchOrders(true);
      setToastMessage({ message: `✅ Baixa do pedido #${orderId} estornada. (A foto de pedido baixado não é recuperada.)`, type: 'success' });
    } else {
      setToastMessage({ message: `❌ Não foi possível estornar: ${res.error || 'erro no servidor'}`, type: 'error' });
    }
  };

  const handleUpdateOrderImage = async (orderId: string, newImageUrl: string) => {
    const res = await safeFetch<Order>(`/api/orders/${orderId}/image`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: newImageUrl }),
      actionType: 'image_update',
      referenceId: orderId,
      actionDescription: `Atualização de Foto do Pedido #${orderId}`,
    });
    if (res.ok && res.data) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data! : o)));
      if (selectedImageOrder?.id === orderId) setSelectedImageOrder(res.data);
      if (selectedEditOrder?.id === orderId) setSelectedEditOrder(res.data);
      setToastMessage({ message: '✅ Foto salva na nuvem. Todos os usuários permitidos já podem vê-la.', type: 'success' });
      fetchOrders(true);
    } else {
      setToastMessage({ message: `❌ Não foi possível salvar a foto: ${res.error || 'falha no servidor'}`, type: 'error' });
    }
  };

  const handleEditOrder = async (orderId: string, updatedFields: Partial<Order>) => {
    const res = await safeFetch<Order>(`/api/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedFields),
      actionType: 'order_edit',
      referenceId: orderId,
      cliente: updatedFields.marca,
      valor: updatedFields.valor,
      actionDescription: `Edição de Pedido #${orderId}`,
    });
    if (res.ok && res.data) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data! : o)));
      if (selectedImageOrder?.id === orderId) setSelectedImageOrder(res.data);
      setToastMessage({ message: `✅ Pedido #${orderId} salvo.`, type: 'success' });
      fetchOrders(true);
    } else {
      setToastMessage({ message: `❌ Erro ao salvar o pedido: ${res.error || 'falha no servidor'}`, type: 'error' });
      throw new Error(res.error || 'Falha ao salvar no servidor');
    }
  };

  const handleBackupImported = async () => {
    await Promise.all([fetchOrders(true), fetchBoletos()]);
  };

  // Sem sessão válida: só a tela de entrada (nenhum dado é carregado)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100/70 flex items-center justify-center">
        {!authChecked && (
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        )}
        <LoginModal
          currentUser={null}
          isOpen={isLoginModalOpen}
          onClose={() => {}}
          onSelectUser={(usr) => {
            setCurrentUser(usr);
            setIsLoginModalOpen(false);
            setLoading(true);
            setActiveTab('aberto');
          }}
        />
      </div>
    );
  }

  // Determine role and feature visibility
  const isAdmin = currentUser.role === 'admin';
  const userCanEdit = canUserEdit(currentUser);
  const showTotalPendente = currentUser.name !== 'Ricardo' && currentUser.name !== 'Wanderley';
  const canSeeVendedoresTab = currentUser.name !== 'Ricardo' && currentUser.name !== 'Wanderley';

  const handleToggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Filter orders according to user permissions & search query
  const safeOrdersList = ensureOrdersArray(orders);

  // Helper de checagem de vendedor tolerante a maiúsculas/minúsculas e espaços
  const isOrderAssignedToUser = (order: Order, user: User) => {
    if (user.role === 'admin') return true;
    const orderSeller = (order.vendedor || '').trim().toLowerCase();
    const userName = (user.name || '').trim().toLowerCase();
    return orderSeller === userName;
  };

  const userVisibleOrders = safeOrdersList.filter((order) => {
    return isOrderAssignedToUser(order, currentUser);
  });

  const openOrdersCount = userVisibleOrders.filter((o) => o.status === 'em_aberto').length;
  const settledOrdersCount = userVisibleOrders.filter((o) => o.status === 'baixado').length;
  const totalOrdersCount = userVisibleOrders.length;

  // Pedidos filtrados por status (em aberto, baixado ou todos) e pela busca inteligente
  const displayedOrders = userVisibleOrders.filter((order) => {
    // 1. Filtro de Status
    if (statusFilter === 'aberto' && order.status !== 'em_aberto') return false;
    if (statusFilter === 'baixado' && order.status !== 'baixado') return false;

    // 2. Busca inteligente tolerante a acentos, números de pedido (#/id), datas, status e tokens
    if (searchQuery.trim()) {
      if (!matchesOrderSearch(order, searchQuery)) return false;
    }

    // 3. Filtro por Vendedor (Admins)
    if (isAdmin && vendedorFilter !== 'todos') {
      if (!order.vendedor || order.vendedor.trim().toLowerCase() !== vendedorFilter.trim().toLowerCase()) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if (statusFilter === 'baixado') {
      const timeB = new Date(b.dataBaixa || b.updatedAt || b.data || 0).getTime();
      const timeA = new Date(a.dataBaixa || a.updatedAt || a.data || 0).getTime();
      return timeB - timeA;
    }
    const dateDiff = a.data.localeCompare(b.data);
    if (dateDiff !== 0) return dateDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Contagem de pedidos correspondentes no status oposto para alertar o usuário se o pedido pesquisado estiver lá
  const settledMatchesCount =
    statusFilter === 'aberto' && searchQuery.trim()
      ? userVisibleOrders.filter((o) => o.status === 'baixado' && matchesOrderSearch(o, searchQuery)).length
      : 0;

  const openMatchesCount =
    statusFilter === 'baixado' && searchQuery.trim()
      ? userVisibleOrders.filter((o) => o.status === 'em_aberto' && matchesOrderSearch(o, searchQuery)).length
      : 0;

  const totalOpenValue = displayedOrders
    .filter((o) => o.status === 'em_aberto')
    .reduce((sum, o) => {
      const currentPaid = o.valorPago || 0;
      return sum + Math.max(0, o.valor - currentPaid);
    }, 0);

  const totalSettledValue = displayedOrders
    .filter((o) => o.status === 'baixado')
    .reduce((sum, o) => sum + (o.valorPago || o.valor), 0);

  const handleToggleSelectAll = () => {
    const openIds = displayedOrders.filter((o) => o.status === 'em_aberto').map((o) => o.id);
    const allSelected = openIds.length > 0 && openIds.every((id) => selectedOrderIds.includes(id));

    if (allSelected) {
      setSelectedOrderIds((prev) => prev.filter((id) => !openIds.includes(id)));
    } else {
      setSelectedOrderIds(Array.from(new Set([...selectedOrderIds, ...openIds])));
    }
  };

  const selectedOrdersList = userVisibleOrders.filter(
    (o) => selectedOrderIds.includes(o.id) && o.status === 'em_aberto'
  );

  const unreadNotificationsCount = notifications.filter(
    (n) =>
      !n.read &&
      (n.targetUser === currentUser.name ||
        n.targetUser === 'Todos' ||
        currentUser.name === 'Pedro')
  ).length;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 font-sans flex flex-col">
      {/* Navbar */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUploadModal={() => setIsUploadModalOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onSwitchUser={() => setIsLoginModalOpen(true)}
        openOrdersCount={openOrdersCount}
        overdueBoletosCount={overdueBoletosCount}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotificationsModal={() => setIsNotificationsModalOpen(true)}
        onSendTestNotification={() =>
          sendNotification({
            senderName: 'Pedro',
            targetUser: 'Ricardo',
            cliente: 'HORTIFRUTI TESTE (Pedro)',
            valorPendente: 5000,
            message: '⚡ NOTIFICAÇÃO DE TESTE ENVIADA POR PEDRO: Cobrança urgente do cliente HORTIFRUTI TESTE no valor de R$ 5.000,00.',
          })
        }
        onOpenInstallModal={() => setIsInstallModalOpen(true)}
        isInstalled={isInstalled}
      />

      {/* Main Content Area (Compact on mobile) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2.5 sm:px-6 lg:px-8 py-2.5 sm:py-6 space-y-2.5 sm:space-y-6">
        {/* User context bar (Slim & compact on mobile, full on desktop) */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 p-2.5 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-black text-xs sm:text-sm shrink-0">
              {currentUser.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
                  Painel de {currentUser.name}
                </span>
                <span
                  className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                    isAdmin
                      ? 'bg-amber-100 text-amber-900 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                  }`}
                >
                  {isAdmin ? 'Gestão Financeira (Acesso Total)' : 'Vendedor (somente seus pedidos)'}
                </span>
                <span className="hidden sm:inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Sincronizado ao vivo
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                {isAdmin
                  ? `Total no sistema: ${totalOrdersCount} pedidos (${openOrdersCount} em aberto, ${settledOrdersCount} baixados)`
                  : `Seus pedidos em aberto (${openOrdersCount})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Lembrete e Atualização Periódica */}
            <RefreshReminder
              lastUpdated={lastUpdated}
              onRefresh={async () => {
                await Promise.all([fetchOrders(true), fetchBoletos()]);
              }}
              isRefreshing={loading}
            />

            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] sm:text-xs transition-colors cursor-pointer"
            >
              Alternar Usuário
            </button>
          </div>
        </div>

        {cloudWarning && (
          <div className="bg-amber-50 border-2 border-amber-400/60 rounded-2xl p-3 flex items-start gap-3 text-amber-950">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm">
              <strong>Nuvem temporariamente indisponível (limite diário do Firestore).</strong>{' '}
              Você ainda vê os dados, mas novas gravações podem falhar até a cota voltar. Nada é salvo fora da nuvem; tente de novo mais tarde.
            </div>
          </div>
        )}

        {/* Critical Sync Error Admin Banner */}
        {failedSyncList.length > 0 && (
          <div className="bg-red-50 border-2 border-red-500/30 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-black shrink-0 shadow-md">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-red-950 text-xs sm:text-sm">
                    🚨 Alerta de Sincronização Administrativa ({failedSyncList.length} pendente{failedSyncList.length > 1 ? 's' : ''})
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-red-800 mt-0.5">
                  {failedSyncList[0]?.actionDescription || 'Uma ou mais operações'} não foram confirmadas pelo servidor. Refaça a operação.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
              <button
                onClick={() => setIsNotificationsModalOpen(true)}
                className="flex-1 md:flex-none px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Ver Alertas
              </button>
              <button
                onClick={() => {
                  clearFailedSyncQueue();
                  setFailedSyncList([]);
                  setToastMessage({
                    message: 'Fila de sincronização limpa.',
                    type: 'info',
                  });
                }}
                className="flex-1 md:flex-none px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition-colors cursor-pointer"
              >
                Dispensar
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: Pedidos */}
        {activeTab === 'aberto' && (
          <div className="space-y-2.5 sm:space-y-6">
            {/* Filter and stats toolbar */}
            <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-2.5 sm:p-4 shadow-2xs space-y-2.5 sm:space-y-4">
              {/* Segmented Status Filter (Em Aberto / Baixados / Todos) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-100">
                <div className="flex items-center gap-1 sm:gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setStatusFilter('aberto')}
                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'aberto'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <span>Em Aberto</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        statusFilter === 'aberto' ? 'bg-white text-blue-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {openOrdersCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setStatusFilter('baixado')}
                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'baixado'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <span>Baixados / Quitado</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        statusFilter === 'baixado' ? 'bg-white text-emerald-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {settledOrdersCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setStatusFilter('todos')}
                    className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                      statusFilter === 'todos'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <span>Todos os Pedidos</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        statusFilter === 'todos' ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {totalOrdersCount}
                    </span>
                  </button>
                </div>

                <div className="text-[11px] font-bold text-slate-500">
                  {currentUser.role === 'admin' ? 'Visão Geral da Empresa' : `Carteira de ${currentUser.name}`}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                {/* Search input with intelligent tolerance */}
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 absolute left-2.5 top-2.5 sm:top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar marca/cliente, nº pedido (#18, PED-8668), data, valor, vendedor..."
                    className="w-full pl-8 pr-8 py-1.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 sm:top-3 text-slate-400 hover:text-slate-600 text-xs"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between sm:justify-start gap-1.5 sm:gap-3">
                  {/* Vendedor filter (only useful for admins) */}
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Filter className="w-3 h-3 text-slate-400 shrink-0" />
                      <select
                        value={vendedorFilter}
                        onChange={(e) => setVendedorFilter(e.target.value)}
                        className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="todos">Todos Vendedores</option>
                        <option value="Pedro">Pedro</option>
                        <option value="Daniel">Daniel</option>
                        <option value="Igor">Igor</option>
                        <option value="Ricardo">Ricardo</option>
                        <option value="Wanderley">Wanderley</option>
                      </select>
                    </div>
                  )}

                  {/* Open Orders Spreadsheet / Grid Report Button */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleQuickDownloadBothReports}
                      disabled={downloadingBothReports}
                      className="px-2 sm:px-3 py-1 sm:py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg font-bold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                      title="Baixa automaticamente 3 relatórios: marcas com 1 pedido, marcas com 2 ou mais pedidos e boletos em atraso"
                    >
                      {downloadingBothReports ? (
                        <Loader2 className="w-3 h-3 text-amber-800 animate-spin" />
                      ) : (
                        <Layers className="w-3 h-3 text-amber-800" />
                      )}
                      <span>Baixar 3 Relatórios (1, 2+ e Boletos)</span>
                    </button>

                    <button
                      onClick={() => setIsOpenOrdersReportModalOpen(true)}
                      className="px-2 sm:px-3 py-1 sm:py-1.5 bg-red-50 hover:bg-red-100 text-red-900 border border-red-200/80 rounded-lg font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                      title="Relatório de Pedidos em Aberto por Marca (Grade Analítica)"
                    >
                      <TableIcon className="w-3 h-3 text-red-700" />
                      <span>Relatório Grade</span>
                    </button>
                  </div>

                  {/* View Mode Toggle (Cards vs Lista) */}
                  <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        viewMode === 'cards'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Visualização em Cards"
                    >
                      <LayoutGrid className="w-3 h-3" />
                      <span className="hidden sm:inline">Cards</span>
                    </button>
                    <button
                      onClick={() => setViewMode('lista')}
                      className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                        viewMode === 'lista'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Visualização em Lista"
                    >
                      <List className="w-3 h-3" />
                      <span className="hidden sm:inline">Lista</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Cross-status search match alerts */}
              {settledMatchesCount > 0 && statusFilter === 'aberto' && (
                <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 animate-in fade-in">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Encontrado(s) <strong>{settledMatchesCount}</strong> pedido(s) <strong>já baixado(s)/quitado(s)</strong> para esta pesquisa.
                    </span>
                  </div>
                  <button
                    onClick={() => setStatusFilter('baixado')}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs shrink-0 shadow-xs"
                  >
                    Ver Baixados ({settledMatchesCount})
                  </button>
                </div>
              )}

              {openMatchesCount > 0 && statusFilter === 'baixado' && (
                <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-300 rounded-xl text-xs text-blue-950 animate-in fade-in">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      Encontrado(s) <strong>{openMatchesCount}</strong> pedido(s) <strong>em aberto</strong> para esta pesquisa.
                    </span>
                  </div>
                  <button
                    onClick={() => setStatusFilter('aberto')}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs shrink-0 shadow-xs"
                  >
                    Ver Em Aberto ({openMatchesCount})
                  </button>
                </div>
              )}

              {/* Total volume bar */}
              <div className="pt-2 sm:pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-slate-500">
                    Mostrando <strong>{displayedOrders.length}</strong> pedido(s){' '}
                    {statusFilter === 'aberto'
                      ? 'em aberto'
                      : statusFilter === 'baixado'
                      ? 'baixados / quitados'
                      : 'no total'}
                  </span>

                  {userCanEdit && displayedOrders.filter((o) => o.status === 'em_aberto').length > 0 && (
                    <button
                      onClick={handleToggleSelectAll}
                      className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/80 transition-colors cursor-pointer"
                    >
                      {displayedOrders.filter((o) => o.status === 'em_aberto').length > 0 &&
                      displayedOrders
                        .filter((o) => o.status === 'em_aberto')
                        .every((o) => selectedOrderIds.includes(o.id)) ? (
                        <>
                          <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                          <span>Desmarcar Todos</span>
                        </>
                      ) : (
                        <>
                          <Square className="w-3.5 h-3.5 text-blue-600" />
                          <span>
                            Selecionar Em Aberto ({displayedOrders.filter((o) => o.status === 'em_aberto').length})
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  {statusFilter !== 'baixado' && showTotalPendente && (
                    <span className="font-bold text-slate-700">
                      Total Pendente:{' '}
                      <strong className="text-amber-600 text-sm sm:text-base ml-1">
                        {formatCurrency(totalOpenValue)}
                      </strong>
                    </span>
                  )}
                  {statusFilter !== 'aberto' && (
                    <span className="font-bold text-slate-700">
                      Total Quitado:{' '}
                      <strong className="text-emerald-700 text-sm sm:text-base ml-1">
                        {formatCurrency(totalSettledValue)}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sticky Batch Actions Bar */}
            {userCanEdit && selectedOrdersList.length > 0 && (
              <div className="sticky top-4 z-40 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-700 flex flex-wrap items-center justify-between gap-3 transition-all animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-amber-950 flex items-center justify-center font-black text-sm shrink-0">
                    {selectedOrdersList.length}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm sm:text-base text-white">
                      {selectedOrdersList.length} {selectedOrdersList.length === 1 ? 'pedido selecionado' : 'pedidos selecionados'}
                    </h4>
                    <p className="text-xs text-slate-300 font-medium">
                      Valor total a quitar em lote:{' '}
                      <strong className="text-amber-400 font-black">
                        {formatCurrency(
                          selectedOrdersList.reduce(
                            (acc, o) => acc + Math.max(0, o.valor - (o.valorPago || 0)),
                            0
                          )
                        )}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsBatchSettlementModalOpen(true)}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-amber-950 font-black text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-amber-950" />
                    <span>Dar Baixa em Lote ({selectedOrdersList.length})</span>
                  </button>

                  <button
                    onClick={() => setSelectedOrderIds([])}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                    title="Desmarcar seleção"
                  >
                    <X className="w-4 h-4" />
                    <span className="hidden sm:inline">Limpar</span>
                  </button>
                </div>
              </div>
            )}

            {/* Orders Display (Cards or List) */}
            {loading ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                Carregando pedidos...
              </div>
            ) : displayedOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center space-y-3 shadow-2xs">
                <Building className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-800 text-base">
                  Nenhum pedido localizado para estes critérios.
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {searchQuery || vendedorFilter !== 'todos'
                    ? 'Tente ajustar os termos de busca ou filtros.'
                    : statusFilter === 'aberto'
                    ? `Não há pedidos em aberto no momento para ${currentUser.name}.`
                    : statusFilter === 'baixado'
                    ? `Não há pedidos baixados gravados para ${currentUser.name}.`
                    : `Não há pedidos no momento para ${currentUser.name}.`}
                </p>

                {settledMatchesCount > 0 && statusFilter === 'aberto' && (
                  <div className="pt-2">
                    <button
                      onClick={() => setStatusFilter('baixado')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md inline-flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Ver {settledMatchesCount} Pedido(s) Baixado(s) Encontrado(s)
                    </button>
                  </div>
                )}

                {openMatchesCount > 0 && statusFilter === 'baixado' && (
                  <div className="pt-2">
                    <button
                      onClick={() => setStatusFilter('aberto')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md inline-flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <AlertTriangle className="w-4 h-4" /> Ver {openMatchesCount} Pedido(s) Em Aberto Encontrado(s)
                    </button>
                  </div>
                )}

                {statusFilter !== 'todos' && (
                  <button
                    onClick={() => {
                      setStatusFilter('todos');
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 cursor-pointer ml-2"
                  >
                    Visualizar Todos os Status
                  </button>
                )}

                {userCanEdit && (
                  <div className="pt-2">
                    <button
                      onClick={() => setIsUploadModalOpen(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Lançar Novo Pedido
                    </button>
                  </div>
                )}
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    currentUser={currentUser}
                    onViewImage={(ord) => setSelectedImageOrder(ord)}
                    onSettleOrderClick={(ord) => setSelectedSettlementOrder(ord)}
                    onUpdateImage={handleUpdateOrderImage}
                    onEditOrder={(ord) => setSelectedEditOrder(ord)}
                    isSelected={selectedOrderIds.includes(order.id)}
                    onToggleSelect={handleToggleSelectOrder}
                  />
                ))}
              </div>
            ) : (
              <OrderListView
                orders={displayedOrders}
                currentUser={currentUser}
                onViewImage={(ord) => setSelectedImageOrder(ord)}
                onSettleOrderClick={(ord) => setSelectedSettlementOrder(ord)}
                onUpdateImage={handleUpdateOrderImage}
                onEditOrder={(ord) => setSelectedEditOrder(ord)}
                selectedOrderIds={selectedOrderIds}
                onToggleSelectOrder={handleToggleSelectOrder}
                onToggleSelectAll={handleToggleSelectAll}
              />
            )}
          </div>
        )}

        {/* TAB 2: Vendedores por Marca */}
        {activeTab === 'vendedores' && canSeeVendedoresTab && (
          <BrandSellersView
            orders={safeOrdersList}
            currentUser={currentUser}
            onUpdateOrders={fetchOrders}
          />
        )}

        {/* TAB 3: Histórico de Baixas (Admin only) */}
        {activeTab === 'baixas' && isAdmin && (
          <SettlementHistoryView
            orders={safeOrdersList}
            boletos={boletos}
            currentUser={currentUser}
            onViewImage={(ord) => setSelectedImageOrder(ord)}
            onEditOrder={(ord) => setSelectedEditOrder(ord)}
            onEstornoOrder={handleEstornoOrder}
          />
        )}

        {/* TAB 4: Relatórios PDF */}
        {activeTab === 'relatorios' && (
          <div className="space-y-6">
            {/* Relatório de Pedidos em Aberto por Marca (Grade Analítica / Modelo Planilha) */}
            <div className="bg-gradient-to-br from-red-950 via-red-900 to-red-800 rounded-3xl p-6 sm:p-7 text-white shadow-lg border border-red-800/40 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-800/80 border border-red-700 text-red-200 text-xs font-bold uppercase tracking-wider">
                  <TableIcon className="w-3.5 h-3.5 text-red-300" />
                  Modelo Planilha (2+ Pedidos)
                </div>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight">
                  Relatório de Pedidos em Aberto por Marca
                </h3>
                <p className="text-xs sm:text-sm text-red-200 max-w-2xl">
                  Grade analítica consolidando marcas/clientes que possuem 2 ou mais pedidos em aberto, com dias em atraso, subtotais por marca e exportação direta em PDF.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 relative z-10 shrink-0">
                <button
                  onClick={() => setIsOpenOrdersReportModalOpen(true)}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-xs"
                >
                  <TableIcon className="w-4 h-4 text-red-200" />
                  <span>Visualizar Grade</span>
                </button>
                <button
                  onClick={() => { setReportUser(cu.name); generateOpenOrdersGridPDF(userVisibleOrders, 'download', '2+'); }}
                  className="px-5 py-2.5 bg-white hover:bg-red-50 text-red-900 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-md"
                >
                  <Download className="w-4 h-4 text-red-900 stroke-[3]" />
                  <span>Exportar PDF</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs">
              <h3 className="text-sm font-black text-slate-800 mb-3">Outros relatórios em PDF</h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => { setReportUser(cu.name); generateOpenOrdersGridPDF(userVisibleOrders, 'download', '1_only'); }}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-xs flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Marcas com 1 Pedido
                </button>
                <button
                  onClick={async () => { setReportUser(cu.name); await generateOverdueBoletosGridPDF(await getFreshestBoletos(), 'download'); }}
                  className="px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-2xl font-bold text-xs flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Boletos em Atraso
                </button>
              </div>
            </div>

            <CustomerReportModal orders={userVisibleOrders} />
            {showTotalPendente && (
              <FinancialSummaryModal
                orders={userVisibleOrders}
                currentUser={currentUser}
                onSendNotification={(data) => sendNotification(data)}
              />
            )}
          </div>
        )}


        {/* TAB 5: Boletos em Atraso (Visível para todos) */}
        {activeTab === 'boletos' && (
          <BoletosView
            currentUser={currentUser}
            onUpdateBoletos={fetchBoletos}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-auto text-center text-xs text-slate-400">
        <p>Gestão de Pedidos • Sistema VV de Vendas e Controle Financeiro</p>
      </footer>

      {/* Modals */}
      <LoginModal
        currentUser={currentUser}
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSelectUser={(usr) => {
          const changed = usr.name !== currentUser.name;
          setCurrentUser(usr);
          setIsLoginModalOpen(false);
          if (changed) {
            setOrders([]); setBoletos([]); setNotifications([]); setSelectedOrderIds([]);
            setLoading(true);
            setActiveTab('aberto');
          }
          setToastMessage({
            message: `Conectado como ${usr.name} (${usr.role === 'admin' ? 'Gestão Total' : 'Vendedor'})`,
            type: 'success',
          });
          if (usr.role === 'admin') {
            try {
              const todayStr = new Date().toISOString().split('T')[0];
              if (localStorage.getItem('vv_last_backup_reminder_date') !== todayStr) setIsDailyBackupReminderOpen(true);
            } catch {}
          }
        }}
      />

      <OrderUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        currentUser={currentUser}
        orders={safeOrdersList}
        onOrderCreated={handleOrderCreated}
      />

      <ImageModal
        order={selectedImageOrder}
        currentUser={currentUser}
        onClose={() => setSelectedImageOrder(null)}
        onUpdateImage={handleUpdateOrderImage}
      />

      <SettlementModal
        order={selectedSettlementOrder}
        currentUser={currentUser}
        onClose={() => setSelectedSettlementOrder(null)}
        onSettleOrder={handleSettleOrder}
      />

      <BatchSettlementModal
        isOpen={isBatchSettlementModalOpen}
        onClose={() => setIsBatchSettlementModalOpen(false)}
        selectedOrders={selectedOrdersList}
        currentUser={currentUser}
        onConfirmBatchSettlement={handleConfirmBatchSettlement}
      />

      <EditOrderModal
        order={selectedEditOrder}
        onClose={() => setSelectedEditOrder(null)}
        onSave={handleEditOrder}
        onUpdateImage={userCanEdit ? handleUpdateOrderImage : undefined}
      />

      {isBackupModalOpen && isAdmin && (
        <BackupModal
          orders={safeOrdersList}
          boletos={boletos}
          currentUser={currentUser}
          onClose={() => setIsBackupModalOpen(false)}
          onChanged={handleBackupImported}
        />
      )}

      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        notifications={notifications}
        currentUser={currentUser}
        onMarkAsRead={handleMarkNotificationAsRead}
        onMarkAllAsRead={handleMarkAllNotificationsAsRead}
        onSendTestNotification={() =>
          sendNotification({
            senderName: 'Pedro',
            targetUser: 'Ricardo',
            cliente: 'HORTIFRUTI TESTE (Pedro)',
            valorPendente: 5000,
            message: '⚡ NOTIFICAÇÃO DE TESTE ENVIADA POR PEDRO: Cobrança urgente do cliente HORTIFRUTI TESTE no valor de R$ 5.000,00.',
          })
        }
      />

      <OpenOrdersReportModal
        isOpen={isOpenOrdersReportModalOpen}
        onClose={() => setIsOpenOrdersReportModalOpen(false)}
        orders={userVisibleOrders}
      />

      <DailyBackupReminderModal
        isOpen={isDailyBackupReminderOpen}
        onClose={() => setIsDailyBackupReminderOpen(false)}
        currentUser={currentUser}
        orders={safeOrdersList}
        boletos={boletos}
        onDownloadSuccess={() => {
          setToastMessage({
            message: '✅ Cópia de segurança diária baixada com sucesso!',
            type: 'success',
          });
        }}
      />

      {/* PWA Mobile Installation Modal (Android & iOS) */}
      <PWAInstallModal
        isOpen={isInstallModalOpen || showIOSModal}
        onClose={() => {
          setIsInstallModalOpen(false);
          setShowIOSModal(false);
        }}
        isIOS={isIOS}
        canInstallNative={canInstall}
        onInstallNative={triggerInstall}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 border ${
            toastMessage.type === 'error'
              ? 'bg-red-950 text-white border-red-500 ring-2 ring-red-500/20'
              : toastMessage.type === 'info'
              ? 'bg-slate-900 text-white border-blue-500/50'
              : 'bg-slate-900 text-white border-amber-500/50'
          }`}
        >
          <div
            className={`w-8 h-8 font-black rounded-xl flex items-center justify-center shrink-0 ${
              toastMessage.type === 'error'
                ? 'bg-red-600 text-white'
                : toastMessage.type === 'info'
                ? 'bg-blue-600 text-white'
                : 'bg-amber-500 text-slate-950'
            }`}
          >
            {toastMessage.type === 'error' ? '⚠️' : '🔔'}
          </div>
          <div>
            <p className="text-xs font-extrabold">{toastMessage.message}</p>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
