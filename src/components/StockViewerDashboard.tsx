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
import { formatCurrency } from '../services/calculations';

interface StockViewerDashboardProps {
  products: ProductEntity[];
  userProfile: AppUserProfile;
  shopName: string;
  currencySymbol?: string;
  onLogout: () => void;
}

export function StockViewerDashboard({
  products,
  userProfile,
  shopName,
  currencySymbol = '₹',
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
      <div className="bg-primary p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-nav-active-pill border border-badge-green-text/35 text-primary font-bold text-[10px] rounded-full uppercase tracking-wider inline-flex items-center gap-1">
              <Eye className="w-3 h-3" />
              Stock Viewer Mode
            </span>
            <span className="text-xs text-white/80">• Read-Only Real-Time Sync</span>
          </div>
          <h2 className="text-xl font-black text-white mt-1 uppercase tracking-tight">{shopName || 'MAHARAJA MARBLE'}</h2>
          <p className="text-xs text-white/90 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-white">HAIDAR ALI</span>
            <span className="text-white/80 font-mono">(hmotor786@gmail.com)</span>
            <span className="text-white/60">•</span>
            <span className="text-white/80">Logged in as <strong className="text-white font-medium">{userProfile.displayName || userProfile.name || 'User'}</strong> ({userProfile.email})</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="self-start sm:self-center px-3 py-1.5 bg-card/10 hover:bg-card/20 border border-white/20 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Stock KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Total Products */}
        <div className="bg-card p-3.5 rounded-xl border border-line shadow-card">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5 text-muted" />
            Total Products
          </div>
          <div className="text-2xl font-black text-ink">{stockStats.totalProducts}</div>
          <div className="text-[10px] text-muted mt-0.5">{stockStats.totalStockUnits.toLocaleString()} total units</div>
        </div>

        {/* In Stock */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'IN_STOCK' ? 'ALL' : 'IN_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer shadow-card ${
            statusFilter === 'IN_STOCK'
              ? 'bg-badge-green-bg border-badge-green-text/35'
              : 'bg-card border-line hover:border-line-strong'
          }`}
        >
          <div className="text-[11px] font-semibold text-badge-green-text uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            In Stock
          </div>
          <div className="text-2xl font-black text-badge-green-text">{stockStats.inStockCount}</div>
          <div className="text-[10px] text-badge-green-text/80 mt-0.5">Healthy supply</div>
        </button>

        {/* Low Stock Warning */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer shadow-card ${
            statusFilter === 'LOW_STOCK'
              ? 'bg-badge-yellow-bg border-badge-yellow-text/35'
              : 'bg-card border-line hover:border-line-strong'
          }`}
        >
          <div className="text-[11px] font-semibold text-badge-yellow-text uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Low Stock
          </div>
          <div className="text-2xl font-black text-badge-yellow-text">{stockStats.lowStockCount}</div>
          <div className="text-[10px] text-badge-yellow-text/80 mt-0.5">At or below minimum</div>
        </button>

        {/* Depleted / Out of Stock */}
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'OUT_OF_STOCK' ? 'ALL' : 'OUT_OF_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer shadow-card ${
            statusFilter === 'OUT_OF_STOCK'
              ? 'bg-badge-red-bg border-badge-red-text/35'
              : 'bg-card border-line hover:border-line-strong'
          }`}
        >
          <div className="text-[11px] font-semibold text-badge-red-text uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" />
            Out of Stock
          </div>
          <div className="text-2xl font-black text-badge-red-text">{stockStats.outOfStockCount}</div>
          <div className="text-[10px] text-badge-red-text/80 mt-0.5">0 units available</div>
        </button>
      </div>

      {/* Search and Category Filter Bar */}
      <div className="bg-card p-3.5 rounded-xl border border-line space-y-3 shadow-card">
        <div className="relative">
          <Search className="w-4 h-4 text-muted absolute left-3.5 top-3" />
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
            className="w-full bg-card border border-line-strong rounded-xl pl-10 pr-4 py-2 text-sm text-ink placeholder-placeholder focus:outline-none focus:ring-1 focus:ring-primary transition-colors text-left"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-muted hover:text-ink"
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
                ? 'bg-primary text-white shadow-sm'
                : 'bg-inner text-muted hover:bg-inner hover:text-ink'
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
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-inner text-muted hover:bg-inner hover:text-ink'
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
        <div className="flex items-center justify-between text-xs text-muted px-1">
          <span>
            Showing <strong className="text-ink">{filteredProducts.length}</strong> of{' '}
            {products.length} products
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('ALL');
              setStatusFilter('ALL');
              setSearchQuery('');
            }}
            className="text-primary hover:underline font-medium cursor-pointer"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* Inventory Stock List (Read-Only) */}
      <div className="space-y-2">
        {filteredProducts.length === 0 ? (
          <div className="bg-card border border-line rounded-2xl p-8 text-center shadow-card">
            <Boxes className="w-10 h-10 text-line-strong mx-auto mb-2" />
            <h3 className="text-sm font-bold text-ink">No matching products in stock</h3>
            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
              Try adjusting your search terms or clearing the status/category filters.
            </p>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const isOut = product.currentStock <= 0;
            const isLow = product.currentStock > 0 && product.currentStock <= product.minStockLevel;
            const hasSellingPrice =
              product.sellingPrice !== null &&
              product.sellingPrice !== undefined &&
              (typeof product.sellingPrice !== 'string' || (product.sellingPrice as string).trim() !== '') &&
              !isNaN(Number(product.sellingPrice));

            return (
              <div
                key={product.id}
                className="bg-card hover:bg-page/50 border border-line rounded-xl p-3.5 transition-colors flex items-center justify-between gap-3 shadow-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <h4 className="text-sm font-bold text-ink truncate">{product.name}</h4>
                    {isOut ? (
                      <span className="px-2 py-0.5 bg-badge-red-bg border border-badge-red-text/35 text-badge-red-text text-[10px] font-bold rounded-full">
                        Out of Stock
                      </span>
                    ) : isLow ? (
                      <span className="px-2 py-0.5 bg-badge-yellow-bg border border-badge-yellow-text/35 text-badge-yellow-text text-[10px] font-bold rounded-full">
                        Low Stock
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-badge-green-bg border border-badge-green-text/35 text-badge-green-text text-[10px] font-bold rounded-full">
                        In Stock
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                    <span>
                      Category: <strong className="text-ink">{product.category || 'General'}</strong>
                    </span>
                    {product.brand && (
                      <span>
                        Brand: <strong className="text-ink">{product.brand}</strong>
                      </span>
                    )}
                    <span>
                      Unit: <strong className="text-ink">{product.unit}</strong>
                    </span>
                  </div>

                  {/* Selling Price Display */}
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                    <span className="text-muted">Selling Price:</span>
                    {hasSellingPrice ? (
                      <span className="font-bold text-badge-green-text font-mono">
                        {formatCurrency(Number(product.sellingPrice), currencySymbol)} per {product.unit}
                      </span>
                    ) : (
                      <span className="font-semibold text-badge-yellow-text bg-badge-yellow-bg px-2 py-0.5 rounded border border-badge-yellow-text/35 text-[11px]">
                        Not Decided
                      </span>
                    )}
                  </div>
                </div>

                {/* Stock Quantity Display */}
                <div className="text-right shrink-0">
                  <div
                    className={`text-xl font-black ${
                      isOut ? 'text-badge-red-text' : isLow ? 'text-badge-yellow-text' : 'text-badge-green-text'
                    }`}
                  >
                    {product.currentStock}{' '}
                    <span className="text-xs font-normal text-muted">{product.unit}</span>
                  </div>
                  <div className="text-[10px] text-muted">
                    Min alert: {product.minStockLevel} {product.unit}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Security notice footer for stock viewers */}
      <div className="p-3 bg-inner border border-line-strong rounded-xl text-[11px] text-muted flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-primary shrink-0" />
        <span>
          Stock Viewer role is restricted to real-time inventory quantity and selling price viewing. Customer, billing, profit, and purchase cost records are secured by Firebase Firestore rules.
        </span>
      </div>
    </div>
  );
}
