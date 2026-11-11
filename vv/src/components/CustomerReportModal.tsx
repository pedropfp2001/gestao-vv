import React, { useState } from 'react';
import { Order } from '../types';
import {
  formatCurrency,
  formatDateBR,
  generateCustomerOrderPDF,
} from '../utils/pdfGenerator';
import {
  FileText,
  Download,
  Building,
  AlertCircle,
  Image as ImageIcon,
  Share2,
} from 'lucide-react';

interface CustomerReportModalProps {
  orders: Order[];
}

export const CustomerReportModal: React.FC<CustomerReportModalProps> = ({
  orders,
}) => {
  // Group open orders by marca/customer
  const openOrders = orders.filter((o) => o.status === 'em_aberto');

  const customerMap = new Map<string, Order[]>();
  openOrders.forEach((order) => {
    const list = customerMap.get(order.marca) || [];
    list.push(order);
    customerMap.set(order.marca, list);
  });

  // Filter only customers with > 1 order as requested
  const multiOrderCustomers = Array.from(customerMap.entries())
    .filter(([_, customerOrders]) => customerOrders.length >= 2)
    .map(([marca, customerOrders]) => ({
      marca,
      orders: customerOrders,
      totalDevido: customerOrders.reduce(
        (sum, o) => sum + Math.max(0, o.valor - (o.valorPago || 0)),
        0
      ),
    }));

  const [selectedMarca, setSelectedMarca] = useState<string>(
    multiOrderCustomers[0]?.marca || ''
  );

  const currentCustomerData = multiOrderCustomers.find(
    (c) => c.marca === selectedMarca
  );

  const handleDownloadPDF = async (marca: string, customerOrders: Order[]) => {
    await generateCustomerOrderPDF(marca, customerOrders, 'download');
  };

  const handleSharePDF = async (marca: string, customerOrders: Order[]) => {
    await generateCustomerOrderPDF(marca, customerOrders, 'share');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Relatório de Clientes com Múltiplos Pedidos
            </h3>
            <p className="text-xs text-slate-500">
              Clientes com 2 ou mais pedidos em aberto contendo fotos e valor total devido
            </p>
          </div>
        </div>
      </div>

      {multiOrderCustomers.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="font-bold text-slate-700">Nenhum cliente com mais de 1 pedido em aberto no momento.</p>
          <p className="text-xs text-slate-500">
            Cadastre novos pedidos para a mesma marca para gerar este relatório consolidado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Customer list selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Selecione a Marca / Cliente ({multiOrderCustomers.length})
            </label>
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {multiOrderCustomers.map((cust) => {
                const isSelected = cust.marca === selectedMarca;
                return (
                  <button
                    key={cust.marca}
                    onClick={() => setSelectedMarca(cust.marca)}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold text-indigo-600 uppercase block">
                        {cust.marca}
                      </span>
                      <span className="text-xs text-slate-600">
                        {cust.orders.length} pedidos em aberto
                      </span>
                    </div>
                    <span className="text-xs font-extrabold text-slate-900">
                      {formatCurrency(cust.totalDevido)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer details & PDF preview card */}
          {currentCustomerData && (
            <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">
                    Relatório Individual do Cliente
                  </span>
                  <h4 className="text-xl font-black text-slate-900">
                    {currentCustomerData.marca}
                  </h4>
                  <p className="text-xs text-slate-600">
                    Total Devido: <strong className="text-emerald-600 text-sm">{formatCurrency(currentCustomerData.totalDevido)}</strong> ({currentCustomerData.orders.length} pedidos)
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    onClick={() =>
                      handleDownloadPDF(
                        currentCustomerData.marca,
                        currentCustomerData.orders
                      )
                    }
                    className="px-3.5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5"
                    title="Baixar arquivo PDF"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar PDF</span>
                  </button>

                  <button
                    onClick={() =>
                      handleSharePDF(
                        currentCustomerData.marca,
                        currentCustomerData.orders
                      )
                    }
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
                    title="Enviar relatório em PDF diretamente pelo WhatsApp / Compartilhar"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Enviar PDF (WhatsApp)</span>
                  </button>
                </div>
              </div>

              {/* Order items preview list */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {currentCustomerData.orders
                  .slice()
                  .sort((a, b) => a.data.localeCompare(b.data) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                  .map((o) => (
                  <div
                    key={o.id}
                    className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      {o.imageUrl ? (
                        <img
                          src={o.imageUrl}
                          alt={o.id}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                          <ImageIcon className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <span className="font-mono font-bold text-slate-700 block">
                          Pedido #{o.id}
                        </span>
                        <span className="text-slate-500">
                          Data: {formatDateBR(o.data)} • Vendedor: {o.vendedor}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-extrabold text-emerald-600 text-sm block">
                        {formatCurrency(o.valor)}
                      </span>
                      <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Pendente
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
