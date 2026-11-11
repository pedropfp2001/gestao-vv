import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  FileText,
  Upload,
  Check,
  AlertCircle,
  Calendar,
  DollarSign,
  Building,
  UserCheck,
  Trash2,
  FileCheck,
  Eye,
  FileWarning,
} from 'lucide-react';
import { OverdueBoleto, User } from '../types';
import { safeFetch } from '../utils/apiClient';

interface BoletoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (boleto: OverdueBoleto) => void;
  onBoletoSaved?: (boleto: OverdueBoleto) => void;
  currentUser: User;
  initialData?: OverdueBoleto | null;
  editingBoleto?: OverdueBoleto | null;
}

export const BoletoUploadModal: React.FC<BoletoUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onBoletoSaved,
  currentUser,
  initialData,
  editingBoleto,
}) => {
  const activeBoleto = initialData || editingBoleto || null;
  const [marca, setMarca] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [vendedor, setVendedor] = useState<'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley'>('Ricardo');
  const [numeroNF, setNumeroNF] = useState('');
  const [numeroBoleto, setNumeroBoleto] = useState('');
  const [observacao, setObservacao] = useState('');

  // 2 PDF Files
  const [pdfNFUrl, setPdfNFUrl] = useState<string | null>(null);
  const [pdfNFName, setPdfNFName] = useState<string | null>(null);
  const [pdfBoletoUrl, setPdfBoletoUrl] = useState<string | null>(null);
  const [pdfBoletoName, setPdfBoletoName] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brandSellerMap, setBrandSellerMap] = useState<Record<string, string>>({});
  const [autoSellerHint, setAutoSellerHint] = useState<string | null>(null);

  const fileInputNFRef = useRef<HTMLInputElement>(null);
  const fileInputBoletoRef = useRef<HTMLInputElement>(null);

  // Fetch brand-seller map on open
  useEffect(() => {
    if (isOpen) {
      fetch('/api/brand-sellers')
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data === 'object') {
            setBrandSellerMap(data);
          }
        })
        .catch((err) => console.warn('Não foi possível carregar o mapa de marcas:', err));
    }
  }, [isOpen]);

  // Load initial data if editing
  useEffect(() => {
    if (activeBoleto) {
      setMarca(activeBoleto.marca || '');
      setValor(activeBoleto.valor !== undefined ? String(activeBoleto.valor) : '');
      setData(activeBoleto.data || new Date().toISOString().split('T')[0]);
      setVendedor(activeBoleto.vendedor || 'Ricardo');
      setNumeroNF(activeBoleto.numeroNF || '');
      setNumeroBoleto(activeBoleto.numeroBoleto || '');
      setObservacao(activeBoleto.observacao || '');
      setPdfNFUrl(activeBoleto.pdfNFUrl || null);
      setPdfNFName(activeBoleto.pdfNFName || null);
      setPdfBoletoUrl(activeBoleto.pdfBoletoUrl || null);
      setPdfBoletoName(activeBoleto.pdfBoletoName || null);
      setAutoSellerHint(null);
    } else {
      setMarca('');
      setValor('');
      setData(new Date().toISOString().split('T')[0]);
      setVendedor('Ricardo');
      setNumeroNF('');
      setNumeroBoleto('');
      setObservacao('');
      setPdfNFUrl(null);
      setPdfNFName(null);
      setPdfBoletoUrl(null);
      setPdfBoletoName(null);
      setAutoSellerHint(null);
    }
    setError(null);
  }, [activeBoleto, isOpen]);

  // Brand-to-seller auto detection
  const handleMarcaChange = (val: string) => {
    setMarca(val);
    const clean = val.trim().toUpperCase().replace(/\*+$/, '').trim();

    if (clean && brandSellerMap) {
      const matchKey = Object.keys(brandSellerMap).find(
        (k) => k.toUpperCase().replace(/\*+$/, '').trim() === clean
      );
      if (matchKey && brandSellerMap[matchKey]) {
        const targetSeller = brandSellerMap[matchKey] as any;
        setVendedor(targetSeller);
        setAutoSellerHint(`Vendedor auto-selecionado: ${targetSeller} (conforme mapa da marca)`);
        return;
      }
    }
    setAutoSellerHint(null);
  };

  // Convert PDF file to base64 data URL
  const handlePdfUpload = (
    file: File,
    type: 'nf' | 'boleto'
  ) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Apenas arquivos no formato PDF são permitidos.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setError('O arquivo PDF não deve ultrapassar 15MB.');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (type === 'nf') {
        setPdfNFUrl(result);
        setPdfNFName(file.name);
      } else {
        setPdfBoletoUrl(result);
        setPdfBoletoName(file.name);
      }
    };
    reader.onerror = () => {
      setError('Erro ao ler arquivo PDF.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marca.trim()) {
      setError('Informe a marca ou nome do cliente.');
      return;
    }
    const numValor = parseFloat(valor.replace(',', '.'));
    if (isNaN(numValor) || numValor <= 0) {
      setError('Informe um valor válido maior que zero.');
      return;
    }
    if (!data) {
      setError('Informe a data de vencimento / emissão.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        marca: marca.trim().toUpperCase(),
        valor: numValor,
        data: data.trim(),
        vendedor,
        numeroNF: numeroNF.trim() || undefined,
        numeroBoleto: numeroBoleto.trim() || undefined,
        pdfNFUrl: pdfNFUrl !== null ? (pdfNFUrl || undefined) : null,
        pdfNFName: pdfNFUrl ? (pdfNFName || undefined) : null,
        pdfBoletoUrl: pdfBoletoUrl !== null ? (pdfBoletoUrl || undefined) : null,
        pdfBoletoName: pdfBoletoUrl ? (pdfBoletoName || undefined) : null,
        observacao: observacao.trim() || undefined,
        cadastradoPor: currentUser?.name || 'Admin',
      };

      const url = activeBoleto?.id ? `/api/boletos/${activeBoleto.id}` : '/api/boletos';
      const method = activeBoleto?.id ? 'PUT' : 'POST';

      const res = await safeFetch<OverdueBoleto>(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        actionType: activeBoleto?.id ? 'order_edit' : 'order_create',
        referenceId: activeBoleto?.id,
        cliente: payload.marca,
        valor: payload.valor,
        actionDescription: activeBoleto?.id ? `Edição de Boleto #${activeBoleto.id} (${payload.marca})` : `Cadastro de Boleto (${payload.marca})`,
      });

      if (!res.ok || !res.data) {
        throw new Error(res.error || 'Falha ao salvar boleto em atraso.');
      }

      const saved = res.data;
      if (typeof onSuccess === 'function') {
        onSuccess(saved);
      }
      if (typeof onBoletoSaved === 'function') {
        onBoletoSaved(saved);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar o boleto.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-red-900 to-red-800 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-red-200 border border-white/20">
              <FileWarning className="w-6 h-6 text-red-100" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">
                {initialData ? 'Editar Boleto em Atraso' : 'Lançamento Manual de Boleto em Atraso'}
              </h2>
              <p className="text-xs text-red-200">
                Cadastre os dados da inadimplência e anexe os PDFs da NF e do Boleto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {autoSellerHint && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{autoSellerHint}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Marca */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-400" />
                Marca / Cliente <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={marca}
                onChange={(e) => handleMarcaChange(e.target.value)}
                placeholder="Ex: JRL*, LFA*, MAR*..."
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-red-600 focus:bg-white text-sm"
              />
            </div>

            {/* Valor */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                Valor do Boleto (R$) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:outline-hidden focus:ring-2 focus:ring-red-600 focus:bg-white text-sm text-red-700"
              />
            </div>

            {/* Data */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Data de Vencimento / Emissão <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-red-600 focus:bg-white text-sm"
              />
            </div>

            {/* Vendedor */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                Vendedor Responsável <span className="text-red-500">*</span>
              </label>
              <select
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-hidden focus:ring-2 focus:ring-red-600 focus:bg-white text-sm"
              >
                <option value="Ricardo">Ricardo</option>
                <option value="Wanderley">Wanderley</option>
                <option value="Pedro">Pedro</option>
                <option value="Daniel">Daniel</option>
                <option value="Igor">Igor</option>
              </select>
            </div>

            {/* Número NF */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Número da Nota Fiscal (NF)
              </label>
              <input
                type="text"
                value={numeroNF}
                onChange={(e) => setNumeroNF(e.target.value)}
                placeholder="Ex: NF 12894"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
            </div>

            {/* Número Boleto */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Número / Linha Digitável do Boleto
              </label>
              <input
                type="text"
                value={numeroBoleto}
                onChange={(e) => setNumeroBoleto(e.target.value)}
                placeholder="Ex: 34191.79001..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-red-600 focus:bg-white"
              />
            </div>
          </div>

          {/* PDF Upload Sections (2 PDFs as requested by user) */}
          <div className="pt-2 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-red-600" />
                Anexar Documentos em PDF (2 PDFs)
              </label>
              <span className="text-[11px] text-slate-400 font-medium">Formato .PDF (Máx. 15MB)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* PDF 1: NOTA FISCAL (NF) */}
              <div className="p-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    1. PDF da Nota Fiscal (NF)
                  </span>
                  {pdfNFUrl && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                      Anexado
                    </span>
                  )}
                </div>

                {pdfNFUrl ? (
                  <div className="p-3 bg-white border border-blue-200 rounded-xl flex items-center justify-between gap-2 shadow-xs">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCheck className="w-5 h-5 text-blue-600 shrink-0" />
                      <span className="text-xs font-semibold text-slate-800 truncate" title={pdfNFName || 'Nota Fiscal.pdf'}>
                        {pdfNFName || 'Nota_Fiscal.pdf'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (fileInputNFRef.current) {
                            fileInputNFRef.current.value = '';
                            fileInputNFRef.current.click();
                          }
                        }}
                        className="px-2 py-1 text-blue-600 hover:text-blue-800 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1 text-[11px] font-bold"
                        title="Substituir PDF da NF"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Trocar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfNFUrl(null);
                          setPdfNFName(null);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Remover PDF"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      if (fileInputNFRef.current) {
                        fileInputNFRef.current.value = '';
                        fileInputNFRef.current.click();
                      }
                    }}
                    className="cursor-pointer py-4 flex flex-col items-center justify-center text-center space-y-1 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-700">Clique para selecionar o PDF da NF</span>
                    <span className="text-[10px] text-slate-400">ou arraste o arquivo aqui</span>
                  </div>
                )}

                <input
                  ref={fileInputNFRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfUpload(file, 'nf');
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </div>

              {/* PDF 2: BOLETO */}
              <div className="p-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-red-600" />
                    2. PDF do Boleto Bancário
                  </span>
                  {pdfBoletoUrl && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                      Anexado
                    </span>
                  )}
                </div>

                {pdfBoletoUrl ? (
                  <div className="p-3 bg-white border border-red-200 rounded-xl flex items-center justify-between gap-2 shadow-xs">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCheck className="w-5 h-5 text-red-600 shrink-0" />
                      <span className="text-xs font-semibold text-slate-800 truncate" title={pdfBoletoName || 'Boleto.pdf'}>
                        {pdfBoletoName || 'Boleto_Bancario.pdf'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (fileInputBoletoRef.current) {
                            fileInputBoletoRef.current.value = '';
                            fileInputBoletoRef.current.click();
                          }
                        }}
                        className="px-2 py-1 text-red-600 hover:text-red-800 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1 text-[11px] font-bold"
                        title="Substituir PDF do Boleto"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Trocar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPdfBoletoUrl(null);
                          setPdfBoletoName(null);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        title="Remover PDF"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      if (fileInputBoletoRef.current) {
                        fileInputBoletoRef.current.value = '';
                        fileInputBoletoRef.current.click();
                      }
                    }}
                    className="cursor-pointer py-4 flex flex-col items-center justify-center text-center space-y-1 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-700">Clique para selecionar o PDF do Boleto</span>
                    <span className="text-[10px] text-slate-400">ou arraste o arquivo aqui</span>
                  </div>
                )}

                <input
                  ref={fileInputBoletoRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfUpload(file, 'boleto');
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Observações / Motivo do Atraso (Opcional)
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Ex: Cliente solicitou prorrogação, aguardando acerto semanal..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-red-600 focus:bg-white resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {initialData ? 'Salvar Alterações' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
