import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  Boxes,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Filter,
  Eye,
  Building2,
  RefreshCw,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { ProductEntity, AppUserProfile } from '../types/database';

interface StockViewerDashboardProps {
  products: ProductEntity[];
  userProfile: AppUserProfile;
  shopName: string;
  onLogout: () => void;
}

export function StockViewerDashboard({
  products,
  userProfile,
  shopName,
  onLogout,
}: StockViewerDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');

  // Compute Categories from products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  // Stock summary counts
  const stockStats = useMemo(() => {
    let totalStockUnits = 0;
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    products.forEach((p) => {
      const stock = Number(p.currentStock ?? 0);
      const minStock = Number(p.minStockLevel ?? 0);
      totalStockUnits += stock;
      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= minStock) {
        lowStockCount++;
      } else {
        inStockCount++;
      }
    });

    return {
      totalProducts: products.length,
      totalStockUnits,
      inStockCount,
      lowStockCount,
      outOfStockCount,
    };
  }, [products]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Filtered Products (uses deferred search query to eliminate Gboard typing lag)
  const filteredProducts = useMemo(() => {
    const q = (deferredSearchQuery || '').toLowerCase().trim();
    return products.filter((p) => {
      // Category filter
      if (selectedCategory !== 'ALL' && (p.category || '') !== selectedCategory) {
        return false;
      }

      const stock = Number(p.currentStock ?? 0);
      const minStock = Number(p.minStockLevel ?? 0);

      // Status filter
      if (statusFilter === 'IN_STOCK' && stock <= minStock) {
        return false;
      }
      if (statusFilter === 'LOW_STOCK' && (stock <= 0 || stock > minStock)) {
        return false;
      }
      if (statusFilter === 'OUT_OF_STOCK' && stock > 0) {
        return false;
      }

      // Search query
      if (q) {
        const matchesName = (p.name || '').toLowerCase().includes(q);
        const matchesCat = (p.category || '').toLowerCase().includes(q);
        const matchesBrand = (p.brand || '').toLowerCase().includes(q);
        return matchesName || matchesCat || matchesBrand;
      }

      return true;
    });
  }, [products, selectedCategory, statusFilter, deferredSearchQuery]);

  return (
    <div className="space-y-4">
      {/* Stock Viewer Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 font-bold text-[10px] rounded-full uppercase tracking-wider inline-flex items-center gap-1">
              <Eye className="w-3 h-3" />
              Stock Viewer Mode
            </span>
            <span className="text-xs text-slate-400">• Read-Only Real-Time Sync</span>
          </div>
          <h2 className="text-xl font-black text-white mt-1 uppercase tracking-tight">{shopName || 'MAHARAJA MARBLE'}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Logged in as <strong className="text-slate-200">{userProfile.displayName || userProfile.name || 'User'}</strong> ({userProfile.email})
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="self-start sm:self-center px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Stock KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Total Products */}
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5 text-slate-400" />
            Total Products
          </div>
          <div className="text-2xl font-black text-white">{stockStats.totalProducts}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{stockStats.totalStockUnits.toLocaleString()} total units</div>
        </div>

        {/* In Stock */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'IN_STOCK' ? 'ALL' : 'IN_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'IN_STOCK'
              ? 'bg-emerald-950/60 border-emerald-500/60'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            In Stock
          </div>
          <div className="text-2xl font-black text-emerald-300">{stockStats.inStockCount}</div>
          <div className="text-[10px] text-emerald-500/80 mt-0.5">Healthy supply</div>
        </button>

        {/* Low Stock Warning */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'LOW_STOCK'
              ? 'bg-amber-950/60 border-amber-500/60'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Stock
          </div>
          <div className="text-2xl font-black text-amber-300">{stockStats.lowStockCount}</div>
          <div className="text-[10px] text-amber-500/80 mt-0.5">At or below minimum</div>
        </button>

        {/* Depleted / Out of Stock */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'OUT_OF_STOCK' ? 'ALL' : 'OUT_OF_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
            statusFilter === 'OUT_OF_STOCK'
              ? 'bg-rose-950/60 border-rose-500/60'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Out of Stock
          </div>
          <div className="text-2xl font-black text-rose-300">{stockStats.outOfStockCount}</div>
          <div className="text-[10px] text-rose-500/80 mt-0.5">0 units available</div>
        </button>
      </div>

      {/* Search and Category Filter Bar */}
      <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            dir="ltr"
            style={{ direction: 'ltr', textAlign: 'left' }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, category, or brand..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors text-left"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>

        {/* Categories scroll row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              selectedCategory === 'ALL'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Categories ({products.length})
          </button>
          {categories.map((cat) => {
            const count = products.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                  selectedCategory === cat
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Active filters badge info */}
      {(selectedCategory !== 'ALL' || statusFilter !== 'ALL' || searchQuery) && (
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>
            Showing <strong className="text-white">{filteredProducts.length}</strong> of{' '}
            {products.length} products
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('ALL');
              setStatusFilter('ALL');
              setSearchQuery('');
            }}
            className="text-cyan-400 hover:underline font-medium cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* Inventory Stock List (Read-Only) */}
      <div className="space-y-2">
        {filteredProducts.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
            <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-300">No matching products in stock</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Try adjusting your search terms or clearing the status/category filters.
            </p>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const isOut = product.currentStock <= 0;
            const isLow = product.currentStock > 0 && product.currentStock <= product.minStockLevel;

            return (
              <div
                key={product.id}
                className="bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl p-3.5 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <h4 className="text-sm font-bold text-white truncate">{product.name}</h4>
                    {isOut ? (
                      <span className="px-2 py-0.5 bg-rose-950 border border-rose-500/40 text-rose-400 text-[10px] font-bold rounded-full">
                        Out of Stock
                      </span>
                    ) : isLow ? (
                      <span className="px-2 py-0.5 bg-amber-950 border border-amber-500/40 text-amber-400 text-[10px] font-bold rounded-full">
                        Low Stock
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold rounded-full">
                        In Stock
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    <span>
                      Category: <strong className="text-slate-300">{product.category || 'General'}</strong>
                    </span>
                    {product.brand && (
                      <span>
                        Brand: <strong className="text-slate-300">{product.brand}</strong>
                      </span>
                    )}
                    <span>
                      Unit: <strong className="text-slate-300">{product.unit}</strong>
                    </span>
                  </div>
                </div>

                {/* Stock Quantity Display */}
                <div className="text-right shrink-0">
                  <div
                    className={`text-xl font-black ${
                      isOut ? 'text-rose-400' : isLow ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {product.currentStock}{' '}
                    <span className="text-xs font-normal text-slate-400">{product.unit}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Min alert: {product.minStockLevel} {product.unit}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Security notice footer for stock viewers */}
      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-cyan-500 shrink-0" />
        <span>
          Stock Viewer role is restricted to real-time inventory quantity viewing. Customer, billing, profit, and pricing records are secured by Firebase Firestore rules.
        </span>
      </div>
    </div>
  );
}
