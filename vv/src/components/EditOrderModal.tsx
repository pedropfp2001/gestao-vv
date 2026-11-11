import React, { useState, useEffect, useRef } from 'react';
import { Order } from '../types';
import { findBestSellerForBrand } from '../utils/brandSellerHelper';
import { compressImageFile } from '../utils/imageCompressor';
import { hasOrderPhoto } from '../utils/orderImageHelper';
import { X, Edit3, Loader2, Save, Building, Calendar, DollarSign, UserCheck, CheckCircle2, Camera } from 'lucide-react';

interface EditOrderModalProps {
  order: Order | null;
  onClose: () => void;
  onSave: (orderId: string, updatedFields: Partial<Order>) => Promise<void>;
  onUpdateImage?: (orderId: string, newImageUrl: string) => Promise<void> | void;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
  order,
  onClose,
  onSave,
  onUpdateImage,
}) => {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [marca, setMarca] = useState('');
  const [valor, setValor] = useState<number | string>('');
  const [data, setData] = useState('');
  const [vendedor, setVendedor] = useState<'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley'>('Ricardo');
  const [status, setStatus] = useState<'em_aberto' | 'baixado'>('em_aberto');
  const [observacaoBaixa, setObservacaoBaixa] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brandSellerMap, setBrandSellerMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/brand-sellers')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data === 'object') {
          setBrandSellerMap(data);
        }
      })
      .catch((err) => console.error('Erro ao carregar mapa de marcas:', err));
  }, []);

  useEffect(() => {
    if (order) {
      setMarca(order.marca || '');
      setValor(order.valor ?? '');
      setData(order.data || '');
      setVendedor(order.vendedor || 'Ricardo');
      setStatus(order.status || 'em_aberto');
      setObservacaoBaixa(order.observacaoBaixa || '');
      setError(null);
    }
  }, [order]);

  if (!order) return null;

  const canEditPhoto = !!onUpdateImage && order.status === 'em_aberto';
  const handlePhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUpdateImage) return;
    setIsUploadingPhoto(true);
    setError(null);
    try {
      const dataUrl = await compressImageFile(file, 1280, 1280, 0.7);
      await onUpdateImage(order.id, dataUrl);
    } catch (err) {
      console.error('Erro ao enviar foto:', err);
      setError('Não foi possível salvar a foto. Tente novamente.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleMarcaChange = (newVal: string) => {
    setMarca(newVal);
    const matched = findBestSellerForBrand(newVal, brandSellerMap);
    if (matched) {
      setVendedor(matched.seller as any);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marca.trim()) {
      setError('A Marca do cliente é obrigatória.');
      return;
    }
    if (valor === '' || isNaN(Number(valor)) || Number(valor) < 0) {
      setError('Informe um valor numérico válido.');
      return;
    }
    if (!data) {
      setError('Informe a data do pedido.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(order.id, {
        marca: marca.trim().toUpperCase().replace(/\*/g, ''),
        valor: Number(valor),
        data,
        vendedor,
        status,
        observacaoBaixa: status === 'baixado' ? observacaoBaixa : undefined,
      });
      setIsSaving(false);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar edições do pedido:', err);
      setError('Erro ao salvar alterações no servidor.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Editar Pedido</h3>
              <p className="text-xs text-slate-400 font-mono">ID: {order.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3.5 py-2.5 rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Foto do pedido */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-slate-500" />
              Foto do Pedido
            </label>
            <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-200 border border-slate-300 shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-400">
                {hasOrderPhoto(order) ? (
                  <img src={order.imageUrl} alt="Foto do pedido" className="w-full h-full object-cover" />
                ) : (
                  'Sem foto'
                )}
              </div>
              {canEditPhoto ? (
                <>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    {isUploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                    {hasOrderPhoto(order) ? 'Trocar foto' : 'Inserir foto'}
                  </button>
                  <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoPicked} className="hidden" />
                </>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">
                  {order.status === 'baixado' ? 'Pedido baixado: a foto é removida da nuvem.' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Marca */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-500" />
              Marca / Cliente
            </label>
            <input
              type="text"
              value={marca}
              onChange={(e) => handleMarcaChange(e.target.value)}
              placeholder="Ex: JRL, AK, MM SAGA..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              required
            />
            {brandSellerMap[marca.trim().toUpperCase()] && (
              <p className="text-[11px] font-bold text-blue-600 mt-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                Vendedor vinculado a esta marca: <strong>{brandSellerMap[marca.trim().toUpperCase()]}</strong>
              </p>
            )}
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
              Valor Total (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Data */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Data do Pedido
            </label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Vendedor */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-slate-500" />
              Vendedor Responsável
            </label>
            <select
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Ricardo">Ricardo</option>
              <option value="Wanderley">Wanderley</option>
              <option value="Pedro">Pedro</option>
              <option value="Daniel">Daniel</option>
              <option value="Igor">Igor</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
              Status do Pedido
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="em_aberto">Em Aberto (Pendente)</option>
              <option value="baixado">Baixado (Liquidado)</option>
            </select>
          </div>

          {/* Observação Baixa (se baixado) */}
          {status === 'baixado' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-emerald-800">
                Observação da Baixa / Pagamento
              </label>
              <input
                type="text"
                value={observacaoBaixa}
                onChange={(e) => setObservacaoBaixa(e.target.value)}
                placeholder="Ex: Recebido em PIX, dinheiro no caixa..."
                className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}

          {/* Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-xs rounded-xl transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
