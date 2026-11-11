import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Files,
  Trash2,
  Calendar,
  DollarSign,
  Building,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  Plus,
  ArrowRight,
  FileText,
  FileCheck,
  Sparkles,
  Layers,
  Link,
  Unlink,
  Merge,
  Scissors,
  CheckSquare,
  Square,
  ArrowDown,
  Paperclip,
} from 'lucide-react';
import { User, OverdueBoleto } from '../types';
import { formatCurrency } from '../utils/pdfGenerator';
import { PdfViewerModal } from './PdfViewerModal';
import { findBestSellerForBrand } from '../utils/brandSellerHelper';
import { safeFetch } from '../utils/apiClient';

interface BoletoBatchUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newBoletos?: OverdueBoleto[]) => void;
  currentUser: User;
}

export interface BatchBoletoRow {
  id: string;
  marca: string;
  valor: string;
  data: string;
  vendedor: 'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley';
  numeroNF: string;
  numeroBoleto: string;
  observacao: string;
  pdfNFUrl?: string;
  pdfNFName?: string;
  pdfBoletoUrl?: string;
  pdfBoletoName?: string;
}

export const BoletoBatchUploadModal: React.FC<BoletoBatchUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
}) => {
  const [rows, setRows] = useState<BatchBoletoRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [brandSellerMap, setBrandSellerMap] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Global bulk setters
  const [bulkSeller, setBulkSeller] = useState<string>('');
  const [bulkDate, setBulkDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // PDF Preview
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfTitle, setPreviewPdfTitle] = useState<string>('');
  const [previewPdfName, setPreviewPdfName] = useState<string>('');

  // Specific file attachment target
  const [targetAttachRow, setTargetAttachRow] = useState<{ id: string; type: 'boleto' | 'nf' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleFileInputRef = useRef<HTMLInputElement>(null);

  // Load brand-seller map
  useEffect(() => {
    if (isOpen) {
      fetch('/api/brand-sellers')
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data === 'object') {
            setBrandSellerMap(data);
          }
        })
        .catch((err) => console.warn('Erro ao carregar mapa de vendedores:', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Helper to guess info from filename
  const parseFilename = (fileName: string) => {
    const cleanName = fileName.replace(/\.[^/.]+$/, ''); // remove extension
    const lower = cleanName.toLowerCase();

    const isNF = lower.includes('nf') || lower.includes('danfe') || lower.includes('nota') || lower.includes('nfe');
    const isBoleto = lower.includes('boleto') || lower.includes('bol') || lower.includes('dup') || lower.includes('duplicata') || lower.includes('titulo');

    // Extract potential currency/number like "1500", "1.500,00", "350.50"
    const valMatch = cleanName.match(/(?:r\$\s*|valor\s*|vlr\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:\.\d{2})?)/i);
    let valorStr = '';
    if (valMatch) {
      valorStr = valMatch[1].replace(/\./g, '').replace(',', '.');
    }

    // Extract potential document numbers (3 to 10 digits)
    const numMatch = cleanName.match(/(?:nf|nota|danfe|bol|boleto|nº|num|doc)\s*[:#-]?\s*(\d{3,10})/i) || cleanName.match(/\b(\d{3,10})\b/);
    const docNumber = numMatch ? numMatch[1] : '';

    // Extract potential brand/client name
    let marcaGuess = cleanName
      .replace(/(?:nf|danfe|nfe|nota|fiscal|boleto|duplicata|titulo|vencimento|valor|vlr|r\$|\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}|\d{3,10})/gi, ' ')
      .replace(/[_\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (marcaGuess.length < 2) {
      marcaGuess = '';
    }

    return { isNF, isBoleto, valorStr, docNumber, marcaGuess, cleanName };
  };

  // Process selected files into rows and auto-group NF + Boleto intelligently
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);
    setInfoMessage(null);

    const fileArray = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (fileArray.length === 0) {
      setErrorMessage('Por favor, selecione arquivos em formato PDF.');
      return;
    }

    // Convert files to base64
    const promises = fileArray.map((file) => {
      return new Promise<{ file: File; base64: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({ file, base64: (e.target?.result as string) || '' });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(promises).then((loadedFiles) => {
      const todayStr = new Date().toISOString().split('T')[0];
      const parsedItems = loadedFiles.map(({ file, base64 }) => {
        const parsed = parseFilename(file.name);
        return { file, base64, ...parsed };
      });

      // Clustering items to pair NFs with Boletos
      const pairedGroups: Array<{
        marca: string;
        valor: string;
        data: string;
        numeroNF: string;
        numeroBoleto: string;
        nfFile?: { file: File; base64: string };
        boletoFile?: { file: File; base64: string };
      }> = [];

      const usedIndices = new Set<number>();

      // Strategy 1: Match by common document number or strong brand name
      for (let i = 0; i < parsedItems.length; i++) {
        if (usedIndices.has(i)) continue;

        const itemA = parsedItems[i];
        let matchedIndex = -1;

        for (let j = i + 1; j < parsedItems.length; j++) {
          if (usedIndices.has(j)) continue;
          const itemB = parsedItems[j];

          // Check if one is NF and the other is Boleto (or if they share document number / brand)
          const isOppositeType = (itemA.isNF && itemB.isBoleto) || (itemA.isBoleto && itemB.isNF);
          const sameDocNumber = itemA.docNumber && itemB.docNumber && itemA.docNumber === itemB.docNumber;
          const sameMarca = itemA.marcaGuess && itemB.marcaGuess && itemA.marcaGuess.toLowerCase() === itemB.marcaGuess.toLowerCase();

          if (sameDocNumber || (isOppositeType && sameMarca)) {
            matchedIndex = j;
            break;
          }
        }

        // If exact pair found, merge them
        if (matchedIndex !== -1) {
          const itemB = parsedItems[matchedIndex];
          usedIndices.add(i);
          usedIndices.add(matchedIndex);

          const nfItem = itemA.isNF ? itemA : (itemB.isNF ? itemB : (itemA.cleanName.toLowerCase().includes('nf') ? itemA : itemB));
          const bolItem = itemA === nfItem ? itemB : itemA;

          pairedGroups.push({
            marca: (itemA.marcaGuess || itemB.marcaGuess || '').toUpperCase(),
            valor: itemA.valorStr || itemB.valorStr || '',
            data: todayStr,
            numeroNF: nfItem.docNumber || '',
            numeroBoleto: bolItem.docNumber || '',
            nfFile: { file: nfItem.file, base64: nfItem.base64 },
            boletoFile: { file: bolItem.file, base64: bolItem.base64 },
          });
        }
      }

      // If exactly 2 files were selected and weren't paired, group them together as a pair!
      if (parsedItems.length === 2 && usedIndices.size === 0) {
        const item0 = parsedItems[0];
        const item1 = parsedItems[1];
        usedIndices.add(0);
        usedIndices.add(1);

        const nfItem = item0.isNF ? item0 : (item1.isNF ? item1 : item1);
        const bolItem = nfItem === item0 ? item1 : item0;

        pairedGroups.push({
          marca: (item0.marcaGuess || item1.marcaGuess || '').toUpperCase(),
          valor: item0.valorStr || item1.valorStr || '',
          data: todayStr,
          numeroNF: nfItem.docNumber || '',
          numeroBoleto: bolItem.docNumber || '',
          nfFile: { file: nfItem.file, base64: nfItem.base64 },
          boletoFile: { file: bolItem.file, base64: bolItem.base64 },
        });
      }

      // Add remaining unpaired items as single rows
      for (let i = 0; i < parsedItems.length; i++) {
        if (usedIndices.has(i)) continue;
        const item = parsedItems[i];

        pairedGroups.push({
          marca: (item.marcaGuess || '').toUpperCase(),
          valor: item.valorStr || '',
          data: todayStr,
          numeroNF: item.isNF ? item.docNumber : '',
          numeroBoleto: item.isBoleto ? item.docNumber : (item.isNF ? '' : item.docNumber),
          nfFile: item.isNF ? { file: item.file, base64: item.base64 } : undefined,
          boletoFile: !item.isNF ? { file: item.file, base64: item.base64 } : undefined,
        });
      }

      // Build the final rows with seller auto-detection
      const newRows: BatchBoletoRow[] = pairedGroups.map((group) => {
        const cleanMarca = group.marca.trim();
        const matched = findBestSellerForBrand(cleanMarca, brandSellerMap);
        let resolvedSeller: 'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley' = matched
          ? matched.seller
          : (bulkSeller as any) || (currentUser.name as any) || 'Ricardo';

        return {
          id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          marca: cleanMarca,
          valor: group.valor,
          data: group.data || todayStr,
          vendedor: resolvedSeller,
          numeroNF: group.numeroNF,
          numeroBoleto: group.numeroBoleto,
          observacao: '',
          pdfNFUrl: group.nfFile?.base64,
          pdfNFName: group.nfFile?.file.name,
          pdfBoletoUrl: group.boletoFile?.base64,
          pdfBoletoName: group.boletoFile?.file.name,
        };
      });

      setRows((prev) => [...prev, ...newRows]);

      const pairedCount = newRows.filter((r) => r.pdfBoletoUrl && r.pdfNFUrl).length;
      if (pairedCount > 0) {
        setInfoMessage(`✨ ${pairedCount} par(es) de Boleto + NF agrupados automaticamente em uma só linha! Você também pode mesclar outras linhas usando as caixas de seleção.`);
      }
    });
  };

  // Update a single field in a row
  const handleUpdateRow = (id: string, field: keyof BatchBoletoRow, value: any) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };

        // If marca changed, auto-detect seller by client
        if (field === 'marca' && typeof value === 'string') {
          const matched = findBestSellerForBrand(value, brandSellerMap);
          if (matched) {
            updated.vendedor = matched.seller;
          }
        }
        return updated;
      })
    );
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleAddBlankRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        marca: '',
        valor: '',
        data: bulkDate || new Date().toISOString().split('T')[0],
        vendedor: (bulkSeller as any) || (currentUser.name as any) || 'Ricardo',
        numeroNF: '',
        numeroBoleto: '',
        observacao: '',
      },
    ]);
  };

  // Checkbox selection toggle
  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  // MERGE SELECTED ROWS (Juntar linhas selecionadas em 1 única linha com NF + Boleto)
  const handleMergeSelectedRows = () => {
    if (selectedIds.size < 2) {
      setErrorMessage('Selecione pelo menos 2 linhas para mesclar em uma só.');
      return;
    }

    const selectedRowsList = rows.filter((r) => selectedIds.has(r.id));
    if (selectedRowsList.length === 0) return;

    // Create the merged row
    const mergedMarca = selectedRowsList.find((r) => r.marca.trim())?.marca || '';
    const mergedValor = selectedRowsList.find((r) => r.valor.trim() && Number(r.valor) > 0)?.valor || selectedRowsList[0].valor;
    const mergedData = selectedRowsList.find((r) => r.data)?.data || selectedRowsList[0].data;
    const mergedVendedor = selectedRowsList.find((r) => r.vendedor)?.vendedor || selectedRowsList[0].vendedor;
    const mergedNF = selectedRowsList.find((r) => r.numeroNF.trim())?.numeroNF || '';
    const mergedBoleto = selectedRowsList.find((r) => r.numeroBoleto.trim())?.numeroBoleto || '';

    // Extract PDF attachments
    const nfEntry = selectedRowsList.find((r) => r.pdfNFUrl);
    const boletoEntry = selectedRowsList.find((r) => r.pdfBoletoUrl && r !== nfEntry) || selectedRowsList.find((r) => r.pdfBoletoUrl);

    const mergedRow: BatchBoletoRow = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      marca: mergedMarca,
      valor: mergedValor,
      data: mergedData,
      vendedor: mergedVendedor,
      numeroNF: mergedNF,
      numeroBoleto: mergedBoleto,
      observacao: selectedRowsList.map((r) => r.observacao).filter(Boolean).join(' | '),
      pdfNFUrl: nfEntry?.pdfNFUrl,
      pdfNFName: nfEntry?.pdfNFName,
      pdfBoletoUrl: boletoEntry?.pdfBoletoUrl,
      pdfBoletoName: boletoEntry?.pdfBoletoName,
    };

    // Replace selected rows with the single merged row
    const remainingRows = rows.filter((r) => !selectedIds.has(r.id));
    const firstSelectedIndex = rows.findIndex((r) => selectedIds.has(r.id));

    const updatedRows = [...remainingRows];
    updatedRows.splice(firstSelectedIndex, 0, mergedRow);

    setRows(updatedRows);
    setSelectedIds(new Set());
    setInfoMessage('✅ Linhas unificadas com sucesso em uma única linha (NF + Boleto)!');
    setErrorMessage(null);
  };

  // Merge row with the row immediately below
  const handleMergeWithNext = (index: number) => {
    if (index >= rows.length - 1) return;
    const rowA = rows[index];
    const rowB = rows[index + 1];

    const mergedRow: BatchBoletoRow = {
      id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      marca: rowA.marca || rowB.marca,
      valor: rowA.valor || rowB.valor,
      data: rowA.data || rowB.data,
      vendedor: rowA.vendedor || rowB.vendedor,
      numeroNF: rowA.numeroNF || rowB.numeroNF,
      numeroBoleto: rowA.numeroBoleto || rowB.numeroBoleto,
      observacao: [rowA.observacao, rowB.observacao].filter(Boolean).join(' | '),
      pdfNFUrl: rowA.pdfNFUrl || rowB.pdfNFUrl,
      pdfNFName: rowA.pdfNFName || rowB.pdfNFName,
      pdfBoletoUrl: rowA.pdfBoletoUrl || rowB.pdfBoletoUrl,
      pdfBoletoName: rowA.pdfBoletoName || rowB.pdfBoletoName,
    };

    const nextRows = [...rows];
    nextRows.splice(index, 2, mergedRow);
    setRows(nextRows);
    setInfoMessage('✅ Linha unida com sucesso!');
  };

  // Split a merged row into 2 separate rows
  const handleSplitRow = (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row || (!row.pdfNFUrl && !row.pdfBoletoUrl)) return;

    const rowIndex = rows.findIndex((r) => r.id === rowId);

    const row1: BatchBoletoRow = {
      id: `batch-${Date.now()}-1`,
      marca: row.marca,
      valor: row.valor,
      data: row.data,
      vendedor: row.vendedor,
      numeroNF: row.numeroNF,
      numeroBoleto: '',
      observacao: row.observacao,
      pdfNFUrl: row.pdfNFUrl,
      pdfNFName: row.pdfNFName,
    };

    const row2: BatchBoletoRow = {
      id: `batch-${Date.now()}-2`,
      marca: row.marca,
      valor: row.valor,
      data: row.data,
      vendedor: row.vendedor,
      numeroNF: '',
      numeroBoleto: row.numeroBoleto,
      observacao: '',
      pdfBoletoUrl: row.pdfBoletoUrl,
      pdfBoletoName: row.pdfBoletoName,
    };

    const nextRows = [...rows];
    nextRows.splice(rowIndex, 1, row1, row2);
    setRows(nextRows);
    setInfoMessage('Linha separada em 2 registros individuais.');
  };

  // Remove specific PDF attachment from row
  const handleRemoveAttachment = (rowId: string, type: 'boleto' | 'nf') => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (type === 'boleto') {
          return { ...r, pdfBoletoUrl: undefined, pdfBoletoName: undefined };
        } else {
          return { ...r, pdfNFUrl: undefined, pdfNFName: undefined };
        }
      })
    );
  };

  // Upload a single PDF to an existing row
  const handleTriggerSingleAttach = (rowId: string, type: 'boleto' | 'nf') => {
    setTargetAttachRow({ id: rowId, type });
    if (singleFileInputRef.current) {
      singleFileInputRef.current.value = '';
      singleFileInputRef.current.click();
    }
  };

  const handleSingleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetAttachRow) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string) || '';
      const parsed = parseFilename(file.name);

      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== targetAttachRow.id) return r;
          if (targetAttachRow.type === 'boleto') {
            return {
              ...r,
              pdfBoletoUrl: base64,
              pdfBoletoName: file.name,
              numeroBoleto: r.numeroBoleto || parsed.docNumber,
              valor: r.valor || parsed.valorStr,
              marca: r.marca || parsed.marcaGuess.toUpperCase(),
            };
          } else {
            return {
              ...r,
              pdfNFUrl: base64,
              pdfNFName: file.name,
              numeroNF: r.numeroNF || parsed.docNumber,
              valor: r.valor || parsed.valorStr,
              marca: r.marca || parsed.marcaGuess.toUpperCase(),
            };
          }
        })
      );
      setTargetAttachRow(null);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyBulkSeller = () => {
    if (!bulkSeller) return;
    setRows((prev) => prev.map((r) => ({ ...r, vendedor: bulkSeller as any })));
  };

  const handleApplyBulkDate = () => {
    if (!bulkDate) return;
    setRows((prev) => prev.map((r) => ({ ...r, data: bulkDate })));
  };

  // Save all valid rows
  const handleSaveAll = async () => {
    setErrorMessage(null);
    setInfoMessage(null);

    // Validation
    const invalidRows = rows.filter(
      (r) => !r.marca.trim() || !r.valor || isNaN(Number(r.valor)) || Number(r.valor) <= 0 || !r.data
    );
    if (invalidRows.length > 0) {
      setErrorMessage(
        `Existem ${invalidRows.length} linha(s) com campos obrigatórios pendentes (Marca, Valor e Data). Corrija-as antes de salvar.`
      );
      return;
    }

    if (rows.length === 0) {
      setErrorMessage('Adicione ou selecione pelo menos um boleto em PDF para lançar.');
      return;
    }

    try {
      setIsSubmitting(true);
      const totalBatchVal = rows.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);
      const res = await safeFetch('/api/boletos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boletos: rows,
          cadastradoPor: currentUser.name || 'Admin',
        }),
        actionType: 'boletos_batch_create',
        referenceId: `${rows.length} boletos`,
        valor: totalBatchVal,
        actionDescription: `Lançamento em lote de ${rows.length} boletos`,
      });

      if (res.ok) {
        onSuccess(res.data?.boletos);
        onClose();
      } else {
        setErrorMessage(res.error || 'Erro ao salvar boletos em lote.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro de conexão ao salvar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCalculated = rows.reduce((sum, r) => sum + (Number(r.valor) || 0), 0);
  const pairedRowsCount = rows.filter((r) => r.pdfBoletoUrl && r.pdfNFUrl).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-950 via-red-900 to-[#7a1c1c] text-white p-4 sm:p-5 px-6 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center font-black text-red-100 shadow-inner">
              <Files className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                Lançamento em Lote com Agrupamento (NF + Boleto)
                <span className="text-[10px] bg-red-800/80 border border-red-500/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-red-100">
                  Modo Rápido Direto
                </span>
              </h2>
              <p className="text-xs text-red-200">
                Selecione todos os PDFs de uma vez só. O sistema agrupa Boleto e Nota Fiscal do mesmo cliente em uma só linha.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden inputs for single PDF attachment */}
        <input
          ref={singleFileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleSingleFileSelected}
          className="hidden"
        />

        {/* Dropzone & Quick Control Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 space-y-3.5">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Dropzone / Upload button */}
            <div className="flex-1 flex items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf,.pdf"
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-4 py-3 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all text-xs sm:text-sm cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Selecionar Todos os PDFs (Boletos & NFs)</span>
              </button>

              <button
                type="button"
                onClick={handleAddBlankRow}
                className="px-3.5 py-3 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold rounded-2xl flex items-center gap-1.5 transition-all text-xs shrink-0 shadow-2xs cursor-pointer"
              >
                <Plus className="w-4 h-4 text-red-700" />
                <span>Nova Linha</span>
              </button>
            </div>

            {/* Bulk Batch Adjusters */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-white p-1 px-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-500">Vendedor p/ Todos:</span>
                <select
                  value={bulkSeller}
                  onChange={(e) => setBulkSeller(e.target.value)}
                  className="p-1 font-semibold text-slate-800 text-xs bg-slate-50 rounded-lg border border-slate-200"
                >
                  <option value="">Selecione...</option>
                  <option value="Ricardo">Ricardo</option>
                  <option value="Wanderley">Wanderley</option>
                  <option value="Pedro">Pedro</option>
                  <option value="Daniel">Daniel</option>
                  <option value="Igor">Igor</option>
                </select>
                <button
                  type="button"
                  onClick={handleApplyBulkSeller}
                  disabled={!bulkSeller}
                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-900 font-bold rounded-md disabled:opacity-50 text-[11px] cursor-pointer"
                >
                  Aplicar
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-white p-1 px-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="font-bold text-slate-500">Data p/ Todos:</span>
                <input
                  type="date"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                  className="p-1 font-semibold text-slate-800 text-xs bg-slate-50 rounded-lg border border-slate-200"
                />
                <button
                  type="button"
                  onClick={handleApplyBulkDate}
                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-900 font-bold rounded-md text-[11px] cursor-pointer"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>

          {/* Merge & Metrics Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-600 bg-white p-2.5 px-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Boletos a Lançar: <strong className="text-slate-900">{rows.length}</strong>
              </span>
              <span className="hidden sm:inline text-slate-300">|</span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                Pares Casados (Boleto + NF): <strong>{pairedRowsCount}</strong>
              </span>

              {/* Action to merge selected rows */}
              {selectedIds.size >= 2 && (
                <button
                  type="button"
                  onClick={handleMergeSelectedRows}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all animate-bounce cursor-pointer"
                >
                  <Merge className="w-3.5 h-3.5" />
                  <span>Juntar {selectedIds.size} Linhas Selecionadas em 1 (NF + Boleto)</span>
                </button>
              )}
            </div>

            <div className="text-red-900">
              Valor Total:{' '}
              <span className="text-sm font-black text-red-700 ml-1">
                {formatCurrency(totalCalculated)}
              </span>
            </div>
          </div>
        </div>

        {/* Info or Success Banner */}
        {infoMessage && (
          <div className="p-3 px-6 bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{infoMessage}</span>
            </div>
            <button
              onClick={() => setInfoMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs underline"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 px-6 bg-red-50 border-b border-red-200 text-red-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Spreadsheet Table */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
          {rows.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-red-500 hover:bg-red-50/20 transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-base">
                  Nenhum boleto ou nota fiscal carregada
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-lg">
                  Clique aqui ou selecione vários arquivos PDF de uma vez (tanto boletos quanto notas fiscais). O sistema agrupará automaticamente a NF e o Boleto de cada cliente na mesma linha!
                </p>
              </div>
              <button
                type="button"
                className="mt-2 px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
              >
                Escolher PDFs em Lote
              </button>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
              <table className="w-full text-left border-collapse text-xs min-w-[950px]">
                <thead>
                  <tr className="bg-[#7a1c1c] text-white text-[11px] font-black uppercase tracking-wider select-none">
                    <th className="py-3 px-2 text-center w-10">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="hover:text-red-200 text-white p-0.5"
                        title="Selecionar Todos"
                      >
                        {selectedIds.size === rows.length && rows.length > 0 ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-1 text-center w-8">#</th>
                    <th className="py-3 px-3 w-44">Marca / Cliente *</th>
                    <th className="py-3 px-3 w-32">Valor (R$) *</th>
                    <th className="py-3 px-3 w-36">Vencimento *</th>
                    <th className="py-3 px-3 w-32">Vendedor</th>
                    <th className="py-3 px-2 w-24">Nº NF</th>
                    <th className="py-3 px-2 w-24">Nº Boleto</th>
                    <th className="py-3 px-3 min-w-[240px]">Documentos Anexados (Boleto + NF)</th>
                    <th className="py-3 px-2 text-center w-24">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {rows.map((row, index) => {
                    const isSelected = selectedIds.has(row.id);
                    const isFullyPaired = Boolean(row.pdfBoletoUrl && row.pdfNFUrl);

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-indigo-50/80 hover:bg-indigo-50'
                            : isFullyPaired
                            ? 'bg-emerald-50/30 hover:bg-emerald-50/50'
                            : 'hover:bg-red-50/40'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectRow(row.id)}
                            className="w-4 h-4 rounded text-red-700 focus:ring-red-500 cursor-pointer"
                          />
                        </td>

                        {/* Index */}
                        <td className="py-2.5 px-1 text-center font-bold text-slate-400">
                          {index + 1}
                        </td>

                        {/* Marca */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={row.marca}
                            onChange={(e) => handleUpdateRow(row.id, 'marca', e.target.value.toUpperCase())}
                            placeholder="EX: BSM / CLIENTE..."
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 text-xs uppercase"
                          />
                        </td>

                        {/* Valor */}
                        <td className="py-2.5 px-3">
                          <div className="relative">
                            <span className="absolute left-2 top-2 text-[10px] text-slate-400 font-bold">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={row.valor}
                              onChange={(e) => handleUpdateRow(row.id, 'valor', e.target.value)}
                              placeholder="0,00"
                              className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 text-xs"
                            />
                          </div>
                        </td>

                        {/* Data */}
                        <td className="py-2.5 px-3">
                          <input
                            type="date"
                            value={row.data}
                            onChange={(e) => handleUpdateRow(row.id, 'data', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 text-xs"
                          />
                        </td>

                        {/* Vendedor */}
                        <td className="py-2.5 px-3">
                          <select
                            value={row.vendedor}
                            onChange={(e) => handleUpdateRow(row.id, 'vendedor', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-xs"
                          >
                            <option value="Ricardo">Ricardo</option>
                            <option value="Wanderley">Wanderley</option>
                            <option value="Pedro">Pedro</option>
                            <option value="Daniel">Daniel</option>
                            <option value="Igor">Igor</option>
                          </select>
                        </td>

                        {/* Nº NF */}
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            value={row.numeroNF}
                            onChange={(e) => handleUpdateRow(row.id, 'numeroNF', e.target.value)}
                            placeholder="Nº NF"
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 text-xs"
                          />
                        </td>

                        {/* Nº Boleto */}
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            value={row.numeroBoleto}
                            onChange={(e) => handleUpdateRow(row.id, 'numeroBoleto', e.target.value)}
                            placeholder="Nº Bol."
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 text-xs"
                          />
                        </td>

                        {/* PDFs Anexados na Mesma Linha */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Boleto PDF Badge or Upload Button */}
                            {row.pdfBoletoUrl ? (
                              <div className="inline-flex items-center bg-red-100 border border-red-200 rounded-lg p-0.5 pr-1.5 text-red-900 font-bold text-[10px] shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPdfTitle(`Boleto - ${row.marca || 'Documento'}`);
                                    setPreviewPdfUrl(row.pdfBoletoUrl!);
                                    setPreviewPdfName(row.pdfBoletoName || 'Boleto.pdf');
                                  }}
                                  className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-red-200/60 rounded cursor-pointer"
                                  title={`Ver ${row.pdfBoletoName}`}
                                >
                                  <FileText className="w-3 h-3 text-red-700" />
                                  <span className="truncate max-w-[80px]">Boleto</span>
                                  <Eye className="w-2.5 h-2.5 text-red-600 ml-0.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAttachment(row.id, 'boleto')}
                                  className="p-0.5 text-red-600 hover:text-red-900 rounded hover:bg-red-200 ml-1"
                                  title="Remover anexo de boleto"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleTriggerSingleAttach(row.id, 'boleto')}
                                className="px-2 py-1 bg-slate-100 hover:bg-red-50 hover:text-red-800 text-slate-600 border border-dashed border-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                title="Anexar arquivo de Boleto nesta linha"
                              >
                                <Plus className="w-3 h-3" />
                                <span>+ Boleto</span>
                              </button>
                            )}

                            {/* NF PDF Badge or Upload Button */}
                            {row.pdfNFUrl ? (
                              <div className="inline-flex items-center bg-indigo-100 border border-indigo-200 rounded-lg p-0.5 pr-1.5 text-indigo-900 font-bold text-[10px] shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPdfTitle(`Nota Fiscal - ${row.marca || 'Documento'}`);
                                    setPreviewPdfUrl(row.pdfNFUrl!);
                                    setPreviewPdfName(row.pdfNFName || 'Nota_Fiscal.pdf');
                                  }}
                                  className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-indigo-200/60 rounded cursor-pointer"
                                  title={`Ver ${row.pdfNFName}`}
                                >
                                  <FileCheck className="w-3 h-3 text-indigo-700" />
                                  <span className="truncate max-w-[80px]">NF</span>
                                  <Eye className="w-2.5 h-2.5 text-indigo-600 ml-0.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAttachment(row.id, 'nf')}
                                  className="p-0.5 text-indigo-600 hover:text-indigo-900 rounded hover:bg-indigo-200 ml-1"
                                  title="Remover anexo de NF"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleTriggerSingleAttach(row.id, 'nf')}
                                className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-800 text-slate-600 border border-dashed border-slate-300 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                title="Anexar arquivo de Nota Fiscal nesta linha"
                              >
                                <Plus className="w-3 h-3" />
                                <span>+ NF</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Split button if row has both attachments */}
                            {row.pdfBoletoUrl && row.pdfNFUrl && (
                              <button
                                type="button"
                                onClick={() => handleSplitRow(row.id)}
                                className="p-1 text-slate-400 hover:text-amber-600 transition-colors rounded-lg hover:bg-amber-50"
                                title="Separar NF e Boleto em 2 linhas distintas"
                              >
                                <Scissors className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Merge with next row button */}
                            {index < rows.length - 1 && (
                              <button
                                type="button"
                                onClick={() => handleMergeWithNext(index)}
                                className="p-1 text-slate-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-indigo-50"
                                title="Unir esta linha com a linha de baixo"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete row */}
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(row.id)}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                              title="Remover linha"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 px-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            {rows.length > 0 ? (
              <span>
                Pronto para lançar <strong>{rows.length} registro(s)</strong> ({pairedRowsCount} completos com Boleto + NF) no valor total de{' '}
                <strong className="text-slate-900">{formatCurrency(totalCalculated)}</strong>.
              </span>
            ) : (
              <span>Adicione PDFs para iniciar o lançamento em lote.</span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSubmitting || rows.length === 0}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-black rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Gravando Boletos...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Gravar Todos os Boletos ({rows.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* PDF Viewer */}
      {previewPdfUrl && (
        <PdfViewerModal
          isOpen={true}
          onClose={() => setPreviewPdfUrl(null)}
          title={previewPdfTitle}
          pdfUrl={previewPdfUrl}
          fileName={previewPdfName}
        />
      )}
    </div>
  );
};
