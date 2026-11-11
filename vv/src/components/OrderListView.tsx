import React, { useState } from 'react';
import { Order, User, canUserEdit } from '../types';
import { formatCurrency, formatDateBR } from '../utils/pdfGenerator';
import { shareImageFile } from '../utils/shareUtils';
import { compressImageFile } from '../utils/imageCompressor';
import { getOrderImageUrl, createReceiptDataUrl, hasOrderPhoto } from '../utils/orderImageHelper';
import {
  Eye,
  Share2,
  CheckCircle2,
  Edit3,
  Camera,
  Loader2,
  PieChart,
  CheckCircle,
} from 'lucide-react';

interface OrderListViewProps {
  orders: Order[];
  currentUser: User;
  onViewImage: (order: Order) => void;
  onSettleOrderClick: (order: Order) => void;
  onUpdateImage?: (orderId: string, newImageUrl: string) => Promise<void> | void;
  onEditOrder?: (order: Order) => void;
  selectedOrderIds?: string[];
  onToggleSelectOrder?: (orderId: string) => void;
  onToggleSelectAll?: () => void;
}

export const OrderListView: React.FC<OrderListViewProps> = ({
  orders,
  currentUser,
  onViewImage,
  onSettleOrderClick,
  onUpdateImage,
  onEditOrder,
  selectedOrderIds = [],
  onToggleSelectOrder,
  onToggleSelectAll,
}) => {
  const userCanEdit = canUserEdit(currentUser);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  const openOrders = orders.filter((o) => o.status === 'em_aberto');
  const allOpenSelected = openOrders.length > 0 && openOrders.every((o) => selectedOrderIds.includes(o.id));

  const handleFileChange = async (orderId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateImage) return;

    setUpdatingOrderId(orderId);
    try {
      const dataUrl = await compressImageFile(file);
      if (dataUrl) {
        await onUpdateImage(orderId, dataUrl);
      }
    } catch (err) {
      console.error('Erro ao atualizar foto do pedido:', err);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleShare = async (order: Order) => {
    const filename = `Comprovante_${order.marca.replace(/\s+/g, '_')}_${order.id}`;
    await shareImageFile(getOrderImageUrl(order), filename);
  };

  return (
    <div className="space-y-3">
      {/* MOBILE LIST VIEW (sm:hidden) */}
      <div className="block sm:hidden space-y-3">
        {orders.map((order) => {
          const isOpenOrder = order.status === 'em_aberto';
          const currentPaid = order.valorPago || 0;
          const saldoRestante = Math.max(0, order.valor - currentPaid);
          const hasPartial = currentPaid > 0 && currentPaid < order.valor;
          const isUpdatingThis = updatingOrderId === order.id;
          const displayImg = getOrderImageUrl(order);

          return (
            <div
              key={order.id}
              className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-3"
            >
              {/* Header: Photo + Brand + ID & Status */}
              <div className="flex items-start gap-3">
                {/* Photo Thumbnail */}
                <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 group">
                  <img
                    src={displayImg}
                    alt={order.marca}
                    onError={(e) => {
                      const fallback = createReceiptDataUrl(
                        order.marca || 'CLIENTE',
                        formatDateBR(order.data),
                        formatCurrency(order.valor).replace('R$', '').trim(),
                        order.vendedor || 'Vendedor'
                      );
                      (e.currentTarget as HTMLImageElement).src = fallback;
                    }}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => onViewImage(order)}
                  />
                  {onUpdateImage && userCanEdit && isOpenOrder && (
                    <label className="absolute inset-0 bg-slate-900/50 flex items-center justify-center cursor-pointer opacity-80 active:opacity-100">
                      {isUpdatingThis ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5 text-white" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFileChange(order.id, e)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Info block */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="flex items-center gap-1.5">
                      {userCanEdit && onToggleSelectOrder && isOpenOrder && (
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(order.id)}
                          onChange={() => onToggleSelectOrder(order.id)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                          title="Selecionar para baixa em lote"
                        />
                      )}
                      <span className="font-mono text-[11px] font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {order.id}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isOpenOrder
                          ? hasPartial
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {isOpenOrder ? (
                        hasPartial ? (
                          <>
                            <PieChart className="w-3 h-3 text-amber-600" />
                            Parcial
                          </>
                        ) : (
                          <>Em Aberto</>
                        )
                      ) : (
                        <>
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          Quitado
                        </>
                      )}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-slate-900 text-sm truncate">
                    {order.marca}
                  </h4>

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    <span>{formatDateBR(order.data)}</span>
                    <span>•</span>
                    <span className="font-semibold text-slate-700">{order.vendedor}</span>
                  </div>
                </div>
              </div>

              {/* Values bar */}
              <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    {hasPartial ? 'Saldo Pendente' : 'Valor Total'}
                  </span>
                  <span
                    className={`font-black text-sm ${
                      hasPartial ? 'text-amber-700' : 'text-emerald-600'
                    }`}
                  >
                    {formatCurrency(hasPartial ? saldoRestante : order.valor)}
                  </span>
                </div>
                {hasPartial && (
                  <div className="text-right text-[10px] text-slate-500">
                    <div>Pago: {formatCurrency(currentPaid)}</div>
                    <div>Total: {formatCurrency(order.valor)}</div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  onClick={() => onViewImage(order)}
                  className="flex-1 py-2 bg-slate-100 active:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center justify-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Ver</span>
                </button>

                {userCanEdit && isOpenOrder && (
                  <button
                    onClick={() => onSettleOrderClick(order)}
                    className="flex-1 py-2 bg-emerald-600 active:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1 shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Baixa</span>
                  </button>
                )}

                {userCanEdit && onEditOrder && (
                  <button
                    onClick={() => onEditOrder(order)}
                    className="p-2 bg-blue-50 active:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold border border-blue-200/60"
                    title="Editar Pedido"
                  >
                    <Edit3 className="w-4 h-4 text-blue-600" />
                  </button>
                )}

                {hasOrderPhoto(order) && (
<button
                  onClick={() => handleShare(order)}
                  className="p-2 bg-emerald-50 active:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-200/60"
                  title="Compartilhar foto no WhatsApp"
                >
                  <Share2 className="w-4 h-4 text-emerald-600" />
                </button>
)}
              </div>
            </div>
          );
        })}
      </div>

      {/* DESKTOP TABLE VIEW (hidden sm:block) */}
      <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {userCanEdit && onToggleSelectOrder && (
                  <th className="py-3 px-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={allOpenSelected}
                      onChange={onToggleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                      title="Selecionar / Desmarcar todos os pedidos em aberto"
                    />
                  </th>
                )}
                <th className="py-3 px-4">Foto</th>
                <th className="py-3 px-4">ID & Data</th>
                <th className="py-3 px-4">Cliente / Marca</th>
                <th className="py-3 px-4">Vendedor</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Valores (Total / Pendente)</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {orders.map((order) => {
                const isOpenOrder = order.status === 'em_aberto';
                const currentPaid = order.valorPago || 0;
                const saldoRestante = Math.max(0, order.valor - currentPaid);
                const hasPartial = currentPaid > 0 && currentPaid < order.valor;
                const isUpdatingThis = updatingOrderId === order.id;
                const isSelected = selectedOrderIds.includes(order.id);
                const displayImg = getOrderImageUrl(order);

                return (
                  <tr
                    key={order.id}
                    className={`transition-colors group ${
                      isSelected
                        ? 'bg-blue-50/70 hover:bg-blue-50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {userCanEdit && onToggleSelectOrder && (
                      <td className="py-3 px-3 text-center">
                        {isOpenOrder ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleSelectOrder(order.id)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                          />
                        ) : null}
                      </td>
                    )}
                    {/* Foto Thumbnail */}
                    <td className="py-3 px-4">
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 group/img">
                        <img
                          src={displayImg}
                          alt={order.marca}
                          onError={(e) => {
                            const fallback = createReceiptDataUrl(
                              order.marca || 'CLIENTE',
                              formatDateBR(order.data),
                              formatCurrency(order.valor).replace('R$', '').trim(),
                              order.vendedor || 'Vendedor'
                            );
                            (e.currentTarget as HTMLImageElement).src = fallback;
                          }}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => onViewImage(order)}
                        />
                        {onUpdateImage && userCanEdit && isOpenOrder && (
                          <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                            {isUpdatingThis ? (
                              <Loader2 className="w-4 h-4 text-white animate-spin" />
                            ) : (
                              <Camera className="w-4 h-4 text-white" />
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={(e) => handleFileChange(order.id, e)}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </td>

                    {/* ID & Data */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px] block w-max">
                        {order.id}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                        {formatDateBR(order.data)}
                      </span>
                    </td>

                    {/* Cliente / Marca */}
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 text-sm block">
                        {order.marca}
                      </span>
                    </td>

                    {/* Vendedor */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        {order.vendedor}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${
                          isOpenOrder
                            ? hasPartial
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {isOpenOrder ? (
                          hasPartial ? (
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
                            Quitado
                          </>
                        )}
                      </span>
                    </td>

                    {/* Valores */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="font-black text-slate-900 text-sm">
                        {formatCurrency(hasPartial ? saldoRestante : order.valor)}
                      </div>
                      {hasPartial && (
                        <div className="text-[10px] text-slate-500 font-medium">
                          Pago: {formatCurrency(currentPaid)} | Total: {formatCurrency(order.valor)}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Ver Imagem */}
                        <button
                          onClick={() => onViewImage(order)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                          title="Ver Comprovante / Pedido"
                        >
                          <Eye className="w-4 h-4 text-blue-600" />
                        </button>

                        {/* Dar Baixa (Admin only) */}
                        {userCanEdit && isOpenOrder && (
                          <button
                            onClick={() => onSettleOrderClick(order)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold flex items-center gap-1 shadow-xs transition-colors"
                            title="Dar Baixa Financeira"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Baixa</span>
                          </button>
                        )}

                        {/* Editar (Admin only) */}
                        {userCanEdit && onEditOrder && (
                          <button
                            onClick={() => onEditOrder(order)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors border border-blue-200/60"
                            title="Editar Pedido"
                          >
                            <Edit3 className="w-4 h-4 text-blue-600" />
                          </button>
                        )}

                        {/* WhatsApp Share */}
                        {hasOrderPhoto(order) && (
<button
                          onClick={() => handleShare(order)}
                          className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-colors border border-emerald-200/60"
                          title="Enviar foto no WhatsApp"
                        >
                          <Share2 className="w-4 h-4 text-emerald-600" />
                        </button>
)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
