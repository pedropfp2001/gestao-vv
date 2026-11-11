import React, { useState, useEffect } from 'react';
import { Order, User } from '../types';
import { safeFetch } from '../utils/apiClient';
import { normalizeSearchString } from '../utils/searchHelper';
import {
  Users,
  Search,
  Building,
  CheckCircle2,
  Plus,
  RefreshCw,
  Sparkles,
  UserCheck,
  AlertCircle,
} from 'lucide-react';

interface BrandSellersViewProps {
  orders: Order[];
  currentUser: User;
  onUpdateOrders: () => void;
}

export const BrandSellersView: React.FC<BrandSellersViewProps> = ({
  orders,
  currentUser,
  onUpdateOrders,
}) => {
  const [brandSellerMap, setBrandSellerMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string | null>(null);

  // New brand state
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandSeller, setNewBrandSeller] = useState<'Pedro' | 'Daniel' | 'Igor' | 'Ricardo' | 'Wanderley'>('Ricardo');
  const [isAddingNew, setIsAddingNew] = useState(false);

  const fetchBrandSellers = async () => {
    try {
      const res = await safeFetch<Record<string, string>>('/api/brand-sellers', { silent: true });
      if (res.ok && res.data) {
        setBrandSellerMap({ ...res.data });
      }
    } catch (err) {
      console.error('Erro ao carregar mapa de marcas e vendedores:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrandSellers();
  }, []);

  // Consolidate brands from both brandSellerMap AND existing orders
  const allBrandsMap = new Map<string, { vendedor: string; totalOrdersCount: number; openOrdersCount: number }>();

  // Add from brandSellerMap
  Object.entries(brandSellerMap).forEach(([marca, vendedor]) => {
    const cleanMarca = marca.trim().toUpperCase();
    if (cleanMarca) {
      allBrandsMap.set(cleanMarca, {
        vendedor: vendedor as string,
        totalOrdersCount: 0,
        openOrdersCount: 0,
      });
    }
  });

  // Aggregate from orders
  orders.forEach((o) => {
    const cleanMarca = o.marca.trim().toUpperCase();
    if (cleanMarca) {
      const existing = allBrandsMap.get(cleanMarca);
      if (existing) {
        existing.totalOrdersCount += 1;
        if (o.status === 'em_aberto') existing.openOrdersCount += 1;
      } else {
        allBrandsMap.set(cleanMarca, {
          vendedor: o.vendedor,
          totalOrdersCount: 1,
          openOrdersCount: o.status === 'em_aberto' ? 1 : 0,
        });
      }
    }
  });

  const brandList = Array.from(allBrandsMap.entries()).map(([marca, info]) => ({
    marca,
    vendedor: info.vendedor,
    totalOrdersCount: info.totalOrdersCount,
    openOrdersCount: info.openOrdersCount,
  }));

  const filteredBrands = brandList.filter((b) => {
    if (!search || !search.trim()) return true;
    const q = normalizeSearchString(search);
    const tokens = q.split(' ').filter(Boolean);
    const combined = `${normalizeSearchString(b.marca)} ${normalizeSearchString(b.vendedor)}`;
    return tokens.every((t) => combined.includes(t));
  });

  const handleSellerChange = async (marca: string, newVendedor: string) => {
    try {
      const res = await safeFetch('/api/brand-sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marca, vendedor: newVendedor }),
        actionType: 'brand_seller_map',
        cliente: marca,
        actionDescription: `Vínculo de Vendedor para Marca ${marca}`,
      });

      if (res.ok) {
        setBrandSellerMap((prev) => {
          const next = {
            ...prev,
            [marca.trim().toUpperCase()]: newVendedor,
          };
          return next;
        });
        setSavedSuccessMessage(`Vendedor da marca "${marca}" alterado para ${newVendedor}.`);
        setTimeout(() => setSavedSuccessMessage(null), 3000);
        onUpdateOrders();
      } else {
        alert('Erro ao atualizar o vendedor.');
      }
    } catch (err) {
      console.error('Erro ao atualizar vendedor:', err);
    }
  };

  const handleAddNewBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) return;

    const clean = newBrandName
      .replace(/^MARCA\s*:\s*/i, '')
      .replace(/^VV\s*-\s*/i, '')
      .replace(/^VV\s*/i, '')
      .trim()
      .toUpperCase();

    if (!clean) return;

    await handleSellerChange(clean, newBrandSeller);
    setNewBrandName('');
    setIsAddingNew(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">Vendedores por Marca / Cliente</h2>
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-300" /> Aprendizado Automático IA
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Após lançado pela primeira vez para a marca, o sistema grava o vendedor e já lança direto para ele nos próximos pedidos.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsAddingNew(!isAddingNew)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/30 transition-all flex items-center gap-2 shrink-0 self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Vincular Nova Marca</span>
        </button>
      </div>

      {/* Success Notification */}
      {savedSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{savedSuccessMessage}</span>
        </div>
      )}

      {/* Form to add a new brand mapping manually */}
      {isAddingNew && (
        <form
          onSubmit={handleAddNewBrand}
          className="bg-white p-5 rounded-2xl border border-blue-200 shadow-md space-y-4 animate-in fade-in zoom-in-95 duration-200"
        >
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-600" /> Pre-cadastrar Vendedor para Marca
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Nome da Marca / Cliente (sem VV -)
              </label>
              <input
                type="text"
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="Ex: VANDINHO"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Vendedor Responsável
              </label>
              <select
                value={newBrandSeller}
                onChange={(e) => setNewBrandSeller(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Pedro">Pedro</option>
                <option value="Daniel">Daniel</option>
                <option value="Igor">Igor</option>
                <option value="Ricardo">Ricardo</option>
                <option value="Wanderley">Wanderley</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md"
            >
              Salvar Vínculo
            </button>
          </div>
        </form>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por marca/cliente ou vendedor..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm shadow-xs"
        />
      </div>

      {/* Brands Table / List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 font-medium">Carregando marcas...</div>
      ) : filteredBrands.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
          <Building className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="font-bold text-slate-700 text-base">
            Nenhuma marca registrada até o momento.
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Assim que você lançar o primeiro pedido para uma marca (ou pre-cadastrar acima), ela aparecerá nesta lista com o vendedor configurado.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Listagem de Marcas Cadastradas ({filteredBrands.length})</span>
            <span className="text-[11px] text-slate-400 font-normal">
              Altere o vendedor na caixa de seleção para atualizar o direcionamento futuro
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredBrands.map((b) => (
              <div
                key={b.marca}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-base">
                      {b.marca}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {b.totalOrdersCount > 0 ? (
                        <>
                          <strong className="text-slate-700">{b.totalOrdersCount}</strong> pedido(s) no total •{' '}
                          <span className="text-blue-600 font-semibold">
                            {b.openOrdersCount} em aberto
                          </span>
                        </>
                      ) : (
                        <span className="text-emerald-600 font-semibold">
                          Pre-cadastrado no sistema
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:inline">
                    Vendedor Atual:
                  </span>
                  <div className="relative">
                    <select
                      value={b.vendedor}
                      onChange={(e) => handleSellerChange(b.marca, e.target.value)}
                      className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs pr-8"
                    >
                      <option value="Pedro">Pedro</option>
                      <option value="Daniel">Daniel</option>
                      <option value="Igor">Igor</option>
                      <option value="Ricardo">Ricardo</option>
                      <option value="Wanderley">Wanderley</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
