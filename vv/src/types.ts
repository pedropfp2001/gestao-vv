export type UserRole = 'admin' | 'vendedor';

export interface User {
  id: string;
  name: 'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley';
  role: UserRole;
  avatar: string;
}

// APENAS estes usuários possuem permissão para editar pedidos, fotos e dar baixas/parciais
export const EDIT_ALLOWED_USERS = ['Pedro', 'Igor', 'Daniel'];

export function canUserEdit(user?: User | null): boolean {
  if (!user) return false;
  return EDIT_ALLOWED_USERS.includes(user.name);
}

export type OrderStatus = 'em_aberto' | 'baixado';

export interface BaixaItem {
  id: string;
  data: string; // ISO String
  dataHora?: string; // ISO String (alias for data)
  valor: number; // Valor abatido nesta baixa parcial/total
  baixadoPor: string;
  observacao?: string;
  tipo?: 'parcial' | 'total';
}

export interface Order {
  id: string;
  marca: string; // Marca/Cliente
  data: string; // Data do pedido (YYYY-MM-DD)
  valor: number; // Valor original total do pedido em Reais (R$)
  vendedor: 'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley';
  imageUrl: string; // Base64 ou URL da foto do pedido
  status: OrderStatus;
  createdAt: string; // ISO string do cadastro
  updatedAt?: string; // ISO string da última modificação
  // Campos de baixa
  dataBaixa?: string;
  baixadoPor?: string;
  observacaoBaixa?: string;
  valorPago?: number; // Total acumulado já pago/abatido
  historicoBaixas?: BaixaItem[]; // Histórico de baixas (parciais ou totais)
}

export interface CustomerSummary {
  marca: string;
  dataMaisAntiga: string;
  totalPendente: number;
  qtdPedidos: number;
  pedidos: Order[];
}

export interface AppNotification {
  id: string;
  senderName: string; // e.g. 'Pedro', 'Igor', 'Daniel', 'Sistema'
  targetUser: 'Ricardo' | 'Wanderley' | 'Pedro' | 'Daniel' | 'Igor' | 'Todos';
  cliente: string;
  valorPendente?: number;
  message: string;
  createdAt: string; // ISO string
  read: boolean;
  type?: 'alert' | 'sync_error' | 'info';
  errorDetails?: string;
  actionType?: 'baixa' | 'baixa_lote' | 'boleto_baixa' | 'create_order' | 'edit_order' | 'sync';
  referenceId?: string;
}

export interface SyncErrorRecord {
  id: string;
  timestamp: string;
  endpoint: string;
  actionType: string;
  referenceId?: string;
  cliente?: string;
  valor?: number;
  errorMessage: string;
  retryPayload?: any;
  resolved?: boolean;
}

export interface OverdueBoleto {
  id: string;
  indexNum?: number; // Número sequencial ou ID da planilha (ex: 41, 49, 23...)
  marca: string; // Marca / Cliente (ex: JRL*, LFA*, MARQUINHO*...)
  valor: number; // Valor em Reais (R$)
  data: string; // Data de vencimento / emissão (YYYY-MM-DD)
  diasEmAtraso?: number; // Dias calculados em atraso
  situacao: 'EM ABERTO' | 'PAGO' | 'NEGOCIADO';
  vendedor: 'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley';
  numeroNF?: string; // Número da Nota Fiscal
  numeroBoleto?: string; // Número ou Linha Digitável do Boleto
  pdfNFUrl?: string; // Base64 data URL do PDF da NF
  pdfNFName?: string; // Nome do arquivo PDF da NF
  pdfBoletoUrl?: string; // Base64 data URL do PDF do Boleto
  pdfBoletoName?: string; // Nome do arquivo PDF do Boleto
  observacao?: string; // Observações gerais
  createdAt: string; // ISO string de cadastro
  updatedAt?: string; // ISO string da última alteração
  cadastradoPor?: string; // Nome do usuário que cadastrou
  dataBaixa?: string; // ISO string de pagamento/baixa
  baixadoPor?: string; // Quem deu a baixa
  observacaoBaixa?: string; // Observação da baixa
}
