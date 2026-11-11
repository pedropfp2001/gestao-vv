import React, { useState, useRef } from 'react';
import { Order, User, canUserEdit } from '../types';
import { formatCurrency, formatDateBR } from '../utils/pdfGenerator';
import { shareImageFile } from '../utils/shareUtils';
import { compressImageFile } from '../utils/imageCompressor';
import { getOrderImageUrl, createReceiptDataUrl, hasOrderPhoto } from '../utils/orderImageHelper';
import {
  X,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Camera,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface ImageModalProps {
  order: Order | null;
  currentUser: User;
  onClose: () => void;
  onUpdateImage?: (orderId: string, newImageUrl: string) => Promise<void> | void;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  order,
  currentUser,
  onClose,
  onUpdateImage,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!order) return null;

  const userCanEdit = canUserEdit(currentUser);
  const displayImageUrl = getOrderImageUrl(order);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateImage || !order) return;

    setIsUpdating(true);
    try {
      const compressedDataUrl = await compressImageFile(file);
      if (compressedDataUrl) {
        await onUpdateImage(order.id, compressedDataUrl);
        setSuccessMessage(true);
        setTimeout(() => setSuccessMessage(false), 3000);
      }
    } catch (err) {
      console.error('Erro ao alterar imagem:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = displayImageUrl;
    link.download = `Comprovante_VV_${order.marca.replace(/\s+/g, '_')}_${order.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareImage = async () => {
    if (!order) return;
    const filename = `Comprovante_${order.marca.replace(/\s+/g, '_')}_${order.id}`;
    await shareImageFile(displayImageUrl, filename);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] my-auto">
        {/* Header */}
        <div className="p-3.5 sm:p-4 bg-slate-950 text-white flex flex-wrap items-center justify-between border-b border-slate-800 gap-2">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-slate-100 flex items-center gap-2">
              <span>VV - {order.marca}</span>
              <span className="text-xs font-mono font-normal text-slate-400">({order.id})</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              Data: {formatDateBR(order.data)} • Valor:{' '}
              <strong className="text-emerald-400">{formatCurrency(order.valor)}</strong> • Vendedor:{' '}
              {order.vendedor}
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {userCanEdit && onUpdateImage && order.status === 'em_aberto' && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUpdating}
                  className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-md transition-all"
                  title="Substituir ou alterar a foto deste pedido (Pedro, Igor, Daniel)"
                >
                  {isUpdating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  <span>{hasOrderPhoto(order) ? 'Alterar Imagem' : 'Adicionar foto'}</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
              </>
            )}

            <button
              onClick={handleDownload}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-md transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baixar</span>
            </button>

            <button
              onClick={handleShareImage}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-md transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Enviar</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Alert Banner if image updated */}
        {successMessage && (
          <div className="bg-emerald-600 text-white text-xs px-4 py-2 font-bold flex items-center justify-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Foto do pedido alterada e salva com sucesso!</span>
          </div>
        )}

        {/* Image Stage with Controls */}
        <div className="relative flex-1 bg-slate-950 flex items-center justify-center p-4 sm:p-6 overflow-hidden min-h-[300px]">
          {/* Zoom & Rotation Floating Toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-slate-900/90 border border-slate-700/80 rounded-full px-4 py-1.5 flex items-center gap-3 shadow-xl backdrop-blur-md">
            <button
              onClick={handleZoomOut}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold text-slate-300 min-w-[36px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-700" />
            <button
              onClick={handleRotate}
              className="p-1 text-slate-300 hover:text-white transition-colors"
              title="Girar Imagem"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
            <img
              src={displayImageUrl}
              alt={`Foto do pedido VV - ${order.marca}`}
              onError={(e) => {
                const fallback = createReceiptDataUrl(
                  order.marca || 'CLIENTE',
                  formatDateBR(order.data),
                  formatCurrency(order.valor).replace('R$', '').trim(),
                  order.vendedor || 'Vendedor'
                );
                (e.currentTarget as HTMLImageElement).src = fallback;
              }}
              className="max-h-[60vh] object-contain transition-transform duration-200 ease-out shadow-2xl rounded-lg"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
