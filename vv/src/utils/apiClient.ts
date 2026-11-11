import { AppNotification, SyncErrorRecord } from '../types';

export type { SyncErrorRecord };

const SYNC_FAILED_STORAGE_KEY = 'failed_sync_queue_traviu';

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  actionDescription?: string;
  actionType?:
    | 'baixa'
    | 'baixa_lote'
    | 'boleto_baixa'
    | 'create_order'
    | 'edit_order'
    | 'order_create'
    | 'order_edit'
    | 'image_update'
    | 'notification_send'
    | 'backup_import'
    | 'boletos_batch_create'
    | 'brand_seller_map'
    | 'sync'
    | string;
  cliente?: string;
  referenceId?: string;
  valor?: number;
  silent?: boolean;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  isSyncError?: boolean;
  datasetTimestamp?: string | null;
  storeStatus?: string | null;
  unauthorized?: boolean;
}

/**
 * Retorna a fila de erros/pendências de sincronização salvas localmente
 */
export function getFailedSyncQueue(): SyncErrorRecord[] {
  try {
    const data = localStorage.getItem(SYNC_FAILED_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Erro ao ler fila de erros de sincronização:', err);
  }
  return [];
}

/**
 * Remove um item resolvido da fila de erros de sincronização
 */
export function removeFailedSyncItem(id: string): void {
  try {
    const queue = getFailedSyncQueue().filter((item) => item.id !== id);
    localStorage.setItem(SYNC_FAILED_STORAGE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('sync-queue-updated', { detail: queue }));
  } catch (err) {
    console.error('Erro ao remover item da fila de erros:', err);
  }
}

/**
 * Limpa toda a fila de erros de sincronização
 */
export function clearFailedSyncQueue(): void {
  try {
    localStorage.removeItem(SYNC_FAILED_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('sync-queue-updated', { detail: [] }));
  } catch (err) {
    console.error('Erro ao limpar fila de erros:', err);
  }
}

/**
 * Salva um novo erro de sincronização na fila local
 */
export function saveFailedSyncItem(record: SyncErrorRecord): void {
  try {
    const queue = getFailedSyncQueue();
    // Evita duplicatas do mesmo referenceId + actionType
    const existingIndex = queue.findIndex(
      (q) => q.referenceId && q.referenceId === record.referenceId && q.actionType === record.actionType
    );
    if (existingIndex >= 0) {
      queue[existingIndex] = record;
    } else {
      queue.unshift(record);
    }
    // Mantém no máximo 50 registros recentes
    const trimmed = queue.slice(0, 50);
    localStorage.setItem(SYNC_FAILED_STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent('sync-queue-updated', { detail: trimmed }));
  } catch (err) {
    console.error('Erro ao salvar na fila de erros de sincronização:', err);
  }
}

/**
 * Envia notificação automática para a Central Administrativa e console
 */
export async function reportAdminSyncError(record: SyncErrorRecord): Promise<void> {
  const errorMsg = record.errorMessage || 'Falha de comunicação com o servidor/nuvem.';
  const clienteInfo = record.cliente ? ` | Cliente: ${record.cliente}` : '';
  const valorInfo = record.valor ? ` | Valor: R$ ${record.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';
  const refInfo = record.referenceId ? ` #${record.referenceId}` : '';

  let actionLabel = 'Operação';
  if (record.actionType === 'baixa') actionLabel = 'Baixa de Pedido';
  else if (record.actionType === 'baixa_lote') actionLabel = 'Baixa em Lote';
  else if (record.actionType === 'boleto_baixa') actionLabel = 'Baixa de Boleto';
  else if (record.actionType === 'create_order') actionLabel = 'Cadastro de Pedido';
  else if (record.actionType === 'edit_order') actionLabel = 'Alteração de Pedido';

  const notificationMessage = `🚨 ALERTA CRÍTICO: Falha ao salvar/sincronizar [${actionLabel}${refInfo}${clienteInfo}${valorInfo}]. Motivo: ${errorMsg}. A operação foi retida no dispositivo e precisa ser confirmada.`;

  // Log no Console Administrativo com destaque visual
  console.group(`%c[CONSOLE ADMINISTRATIVO - ALERTA DE SINCRONIZAÇÃO] ${actionLabel}`, 'background: #991b1b; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
  console.error('Detalhes do Erro:', {
    tipoAcao: record.actionType,
    referencia: record.referenceId,
    cliente: record.cliente,
    valor: record.valor,
    endpoint: record.endpoint,
    timestamp: record.timestamp,
    mensagem: errorMsg,
    payload: record.retryPayload,
  });
  console.groupEnd();

  // Salva no registro local para persistência offline
  saveFailedSyncItem(record);

  // Emite evento global no navegador para abrir alerta imediato
  window.dispatchEvent(
    new CustomEvent('admin-sync-error', {
      detail: {
        record,
        message: notificationMessage,
      },
    })
  );

  // Tenta despachar notificação para o backend caso haja conectividade
  try {
    const payload: Partial<AppNotification> = {
      senderName: 'Sistema',
      targetUser: 'Pedro',
      cliente: record.cliente || 'Sistema Traviu',
      valorPendente: record.valor || 0,
      message: notificationMessage,
      type: 'sync_error',
      errorDetails: errorMsg,
      actionType: record.actionType as any,
      referenceId: record.referenceId,
    };

    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Falha silenciosa no envio da notificação se a rede estiver totalmente fora
    });
  } catch {
    // Ignora para não travar a aplicação
  }
}

/**
 * Camada de fetch ultra-robusta com timeout, tentativas automáticas e
 * envio imediato de alerta administrativo caso falhe.
 */
export async function safeFetch<T = any>(
  url: string,
  options: SafeFetchOptions = {}
): Promise<ApiResponse<T>> {
  const {
    timeoutMs = 15000,
    retries = 2,
    actionDescription,
    actionType,
    cliente,
    referenceId,
    valor,
    silent = false,
    ...fetchOptions
  } = options;

  let attempt = 0;
  let lastError: any = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Status 2xx -> Sucesso
      if (response.ok) {
        let responseData: T | undefined;
        try {
          const text = await response.text();
          if (text) {
            responseData = JSON.parse(text);
          }
        } catch {
          // Se não for JSON, trata com segurança
        }

        // Se era uma baixa ou gravação que tinha erro prévio salvo, remove da fila
        if (referenceId && actionType) {
          const queue = getFailedSyncQueue();
          const match = queue.find((q) => q.referenceId === referenceId && q.actionType === actionType);
          if (match) {
            removeFailedSyncItem(match.id);
          }
        }

        const datasetTimestamp = response.headers.get('X-Dataset-Timestamp') || response.headers.get('x-dataset-timestamp');
        return {
          ok: true,
          status: response.status,
          data: responseData,
          datasetTimestamp,
          storeStatus: response.headers.get('X-Store-Status'),
        };
      }

      // Status 4xx ou 5xx
      let serverErrorMsg = `Erro ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson && (errorJson.error || errorJson.message)) {
          serverErrorMsg = errorJson.error || errorJson.message;
        }
      } catch {
        // Ignora
      }

      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('vv-unauthorized'));
        return { ok: false, status: 401, error: serverErrorMsg, unauthorized: true };
      }

      // Se for erro 4xx não transitório (ex: 400, 401, 403, 404), não adianta tentar novamente
      if (response.status >= 400 && response.status < 500) {
        lastError = new Error(serverErrorMsg);
        break;
      }

      lastError = new Error(serverErrorMsg);
    } catch (err: any) {
      clearTimeout(timer);
      if (err?.name === 'AbortError') {
        lastError = new Error(`Tempo limite de requisição esgotado (${timeoutMs / 1000}s)`);
      } else {
        lastError = err;
      }
    }

    attempt++;
    if (attempt <= retries) {
      // Backoff progressivo antes de tentar novamente
      const delay = attempt * 700;
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  // Falha consolidada após todas as tentativas
  const errorMessage = lastError?.message || 'Falha de comunicação na sincronização.';

  // Registra notificação e erro administrativo se for uma ação crítica (baixa, criação, edição)
  const isCriticalAction = Boolean(actionType || actionDescription || (fetchOptions.method && fetchOptions.method !== 'GET'));

  if (isCriticalAction && !silent) {
    const errorRecord: SyncErrorRecord = {
      id: `err-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      endpoint: url,
      actionType: actionType || 'sync',
      referenceId,
      cliente,
      valor,
      errorMessage,
      retryPayload: fetchOptions.body ? String(fetchOptions.body) : undefined,
      resolved: false,
    };

    reportAdminSyncError(errorRecord);
  }

  return {
    ok: false,
    status: 0,
    error: errorMessage,
    isSyncError: true,
  };
}
