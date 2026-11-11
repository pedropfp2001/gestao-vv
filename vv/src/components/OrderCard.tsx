import React, { useState, useRef } from 'react';
import { Order, User, canUserEdit } from '../types';
import { formatCurrency, formatDateBR } from '../utils/pdfGenerator';
import { shareImageFile } from '../utils/shareUtils';
import { compressImageFile } from '../utils/imageCompressor';
import { getOrderImageUrl, createReceiptDataUrl, hasOrderPhoto } from '../utils/orderImageHelper';
import {
  Eye,
  Download,
  Share2,
  CheckCircle2,
  UserCheck,
  Calendar,
  Building,
  CheckCircle,
  Camera,
  Loader2,
  Edit3,
  PieChart,
} from 'lucide-react';

interface OrderCardProps {
  order: Order;
  currentUser: User;
  onViewImage: (order: Order) => void;
  onSettleOrderClick: (order: Order) => void;
  onUpdateImage?: (orderId: string, newImageUrl: string) => Promise<void> | void;
  onEditOrder?: (order: Order) => void;
  isSelected?: boolean;
  onToggleSelect?: (orderId: string) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  currentUser,
  onViewImage,
  onSettleOrderClick,
  onUpdateImage,
  onEditOrder,
  isSelected,
  onToggleSelect,
}) => {
  const userCanEdit = canUserEdit(currentUser);
  const isOpenOrder = order.status === 'em_aberto';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdatingImage, setIsUpdatingImage] = useState(false);

  const displayImageUrl = getOrderImageUrl(order);
  const hasPhoto = hasOrderPhoto(order);
  const currentPaid = order.valorPago || 0;
  const saldoRestante = Math.max(0, order.valor - currentPaid);
  const hasPartialPayment = currentPaid > 0 && currentPaid < order.valor;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateImage) return;

    setIsUpdatingImage(true);
    try {
      const dataUrl = await compressImageFile(file);
      if (dataUrl) {
        await onUpdateImage(order.id, dataUrl);
      }
    } catch (err) {
      console.error('Erro ao atualizar foto do pedido:', err);
    } finally {
      setIsUpdatingImage(false);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = displayImageUrl;
    link.download = `Comprovante_${order.marca}_${order.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const filename = `Comprovante_${order.marca.replace(/\s+/g, '_')}_${order.id}`;
    await shareImageFile(displayImageUrl, filename);
  };

  return (
    <div
      className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden shadow-xs hover:shadow-lg flex flex-col justify-between ${
        isSelected
          ? 'border-2 border-blue-600 ring-2 ring-blue-500/20 bg-blue-50/10 shadow-md'
          : isOpenOrder
          ? 'border-slate-200 hover:border-blue-300'
          : 'border-slate-200 bg-slate-50/60 opacity-95'
      }`}
    >
      {/* Top Banner with ID & Status */}
      <div className="p-2.5 sm:p-4 pb-2 sm:pb-3 flex items-start justify-between border-b border-slate-100 bg-slate-50/50 gap-2">
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          {userCanEdit && onToggleSelect && isOpenOrder && (
            <label
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 cursor-pointer bg-white hover:bg-blue-50 p-1 rounded-md border border-slate-200 transition-colors shrink-0"
              title={isSelected ? 'Desmarcar pedido' : 'Selecionar pedido para baixa em lote'}
            >
              <input
                type="checkbox"
                checked={isSelected || false}
                onChange={() => onToggleSelect(order.id)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
            </label>
          )}

          <span className="font-mono text-xs font-black text-slate-600 bg-slate-200/80 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
            {order.id}
          </span>

          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
              isOpenOrder
                ? hasPartialPayment
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}
          >
            {isOpenOrder ? (
              hasPartialPayment ? (
                <>
                  <PieChart className="w-3 h-3 text-amber-600" />
                  Baixa Parcial
                </>
              ) : (
                <>Em Aberto</>
              )
            ) : (
              <>
                <CheckCircle className="w-3 h-3 text-emerald-600" />
                Baixado / Quitado
              </>
            )}
          </span>

          {/* Botão de Editar visível apenas se PERMITIDO (Pedro, Igor, Daniel) */}
          {userCanEdit && onEditOrder && (
            <button
              onClick={() => onEditOrder(order)}
              className="px-2 py-1 hover:bg-blue-50 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors border border-blue-200/60"
              title="Editar dados do pedido (Pedro, Igor, Daniel)"
            >
              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[11px]">Editar</span>
            </button>
          )}
        </div>

        <div className="text-right shrink-0">
          <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            {hasPartialPayment ? 'Saldo Restante' : 'Valor Total'}
          </span>
          <span
            className={`text-base sm:text-lg font-black leading-none ${
              hasPartialPayment ? 'text-amber-700' : 'text-emerald-600'
            }`}
          >
            {formatCurrency(hasPartialPayment ? saldoRestante : order.valor)}
          </span>
          {hasPartialPayment && (
            <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
              Total: {formatCurrency(order.valor)}
            </span>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div className="p-2.5 sm:p-4 space-y-2 sm:space-y-3 flex-1">
        {/* Brand / Customer */}
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Building className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
          </div>
          <div>
            <span className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
              Marca / Cliente
            </span>
            <h4 className="font-extrabold text-slate-900 text-xs sm:text-base leading-snug">
              {order.marca}
            </h4>
          </div>
        </div>

        {/* Metadata info */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-[11px] sm:text-xs bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-100">
          <div className="flex items-center gap-1 sm:gap-1.5 text-slate-600">
            <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Data: <strong>{formatDateBR(order.data)}</strong></span>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 text-slate-600">
            <UserCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Vendedor: <strong>{order.vendedor}</strong></span>
          </div>
        </div>

        {/* Indicador de Abates Parciais */}
        {hasPartialPayment && (
          <div className="p-2 sm:p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between text-amber-900 font-bold text-[11px] sm:text-xs">
              <span>Pago: {formatCurrency(currentPaid)}</span>
              <span>Pendente: {formatCurrency(saldoRestante)}</span>
            </div>
            {order.historicoBaixas && order.historicoBaixas.length > 0 && (
              <p className="text-[9px] sm:text-[10px] text-amber-800 italic">
                Último abate por {order.historicoBaixas[order.historicoBaixas.length - 1].baixadoPor}: {formatCurrency(order.historicoBaixas[order.historicoBaixas.length - 1].valor)}
              </p>
            )}
          </div>
        )}

        {/* Photo Thumbnail */}
        <div className="relative rounded-xl border border-slate-200 bg-slate-900 overflow-hidden group h-28 sm:h-36 flex items-center justify-center">
          <img
            src={displayImageUrl}
            alt={`Foto pedido ${order.marca}`}
            onError={(e) => {
              const fallback = createReceiptDataUrl(
                order.marca || 'CLIENTE',
                formatDateBR(order.data),
                formatCurrency(order.valor).replace('R$', '').trim(),
                order.vendedor || 'Vendedor'
              );
              (e.currentTarget as HTMLImageElement).src = fallback;
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90 group-hover:opacity-100"
          />
          <div className="absolute inset-0 bg-slate-950/40 group-hover:bg-slate-950/30 transition-colors flex items-center justify-center gap-2">
            {hasPhoto && <button
              onClick={() => onViewImage(order)}
              className="px-3 py-1.5 bg-white/95 hover:bg-white text-slate-900 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1.5 hover:scale-105 transition-all"
              title="Visualizar foto em tela cheia"
            >
              <Eye className="w-3.5 h-3.5 text-blue-600" /> Ver
            </button>}

            {userCanEdit && isOpenOrder && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={isUpdatingImage}
                className="px-3 py-1.5 bg-slate-900/90 hover:bg-purple-600 text-white border border-slate-700 hover:border-purple-500 rounded-lg text-xs font-bold shadow-lg flex items-center gap-1.5 hover:scale-105 transition-all"
                title="Alterar foto (Pedro, Igor, Daniel)"
              >
                {isUpdatingImage ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-purple-400" />
                )}
                <span>{hasPhoto ? 'Alterar Foto' : 'Adicionar foto'}</span>
              </button>
            )}
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />

        {/* Settled details box if status === 'baixado' */}
        {!isOpenOrder && order.dataBaixa && (
          <div className="p-2.5 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs space-y-1">
            <div className="flex items-center justify-between text-emerald-900 font-bold">
              <span>Baixado por: {order.baixadoPor || 'Admin'}</span>
              <span className="text-[10px] text-emerald-700">
                {new Date(order.dataBaixa).toLocaleDateString('pt-BR')}
              </span>
            </div>
            {order.observacaoBaixa && (
              <p className="text-[11px] text-emerald-800 italic">
                "{order.observacaoBaixa}"
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions (Ajustado para Responsividade Mobile) */}
      <div className="p-2.5 sm:p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => onViewImage(order)}
            className="p-2 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Ver foto em tela cheia"
          >
            <Eye className="w-4 h-4 text-blue-600" />
            <span className="text-[11px]">Ver</span>
          </button>

          {hasPhoto && (
<button
            onClick={handleDownload}
            className="p-2 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Baixar foto do pedido"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span className="text-[11px] hidden sm:inline">Baixar</span>
          </button>
)}

          {hasPhoto && (
<button
            onClick={handleShare}
            className="p-2 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            title="Enviar / Compartilhar via WhatsApp"
          >
            <Share2 className="w-4 h-4 text-emerald-600" />
            <span className="text-[11px] hidden sm:inline">Enviar</span>
          </button>
)}

          {/* Alterar Foto para Administrador Autorizado */}
          {userCanEdit && isOpenOrder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={isUpdatingImage}
              className="p-2 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Alterar foto do pedido (Pedro, Igor, Daniel)"
            >
              {isUpdatingImage ? (
                <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
              ) : (
                <Camera className="w-4 h-4 text-purple-600" />
              )}
              <span className="text-[11px] hidden sm:inline">{hasPhoto ? 'Foto' : 'Adicionar foto'}</span>
            </button>
          )}
        </div>

        {/* DAR BAIXA / BAIXA PARCIAL (Apenas Pedro, Igor, Daniel) */}
        {isOpenOrder && userCanEdit && (
          <button
            onClick={() => onSettleOrderClick(order)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 ml-auto"
            title="Dar Baixa ou Abate Parcial"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{hasPartialPayment ? 'Nova Baixa' : 'Dar Baixa'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
