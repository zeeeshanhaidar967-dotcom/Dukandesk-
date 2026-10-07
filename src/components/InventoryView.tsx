import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  Package,
  Search,
  Filter,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  History,
  TrendingUp,
  PackagePlus,
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  ImageIcon,
} from 'lucide-react';
import {
  ProductEntity,
  StockMovementEntity,
  OwnerSettingsEntity,
  AppUserRole,
} from '../types/database';
import { formatCurrency } from '../services/calculations';

interface InventoryViewProps {
  products: ProductEntity[];
  stockMovements: StockMovementEntity[];
  settings: OwnerSettingsEntity;
  role?: AppUserRole;
  onOpenAddProduct: () => void;
  onEditProduct: (product: ProductEntity) => void;
  onDeleteProduct: (productId: string) => void;
  onOpenStockIn: (productId?: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  stockMovements,
  settings,
  role = 'admin',
  onOpenAddProduct,
  onEditProduct,
  onDeleteProduct,
  onOpenStockIn,
}) => {
  const isStockViewer = role !== 'admin';
  const [subTab, setSubTab] = useState<'inventory' | 'history'>('inventory');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [producerFilter, setProducerFilter] = useState('All');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Detail preview modal
  const [inspectProduct, setInspectProduct] = useState<ProductEntity | null>(null);

  // In-app Delete Confirmation Modal State (replaces blocked window.confirm)
  const [productToDelete, setProductToDelete] = useState<ProductEntity | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Collect filter options
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return ['All', ...Array.from(set)];
  }, [products]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.brand && set.add(p.brand));
    return ['All', ...Array.from(set)];
  }, [products]);

  const producers = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.producer && set.add(p.producer));
    return ['All', ...Array.from(set)];
  }, [products]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Filtered Products (uses deferred search query to prevent typing lag)
  const filteredProducts = useMemo(() => {
    const q = (deferredSearchQuery || '').toLowerCase().trim();
    return products.filter((p) => {
      const pName = (p.name || '').toLowerCase();
      const pBrand = (p.brand || '').toLowerCase();
      const pCategory = (p.category || '').toLowerCase();
      const pSupplier = (p.supplier || '').toLowerCase();
      const pProducer = (p.producer || '').toLowerCase();

      const matchSearch = !q
        ? true
        : isStockViewer
        ? pName.includes(q) || pBrand.includes(q) || pCategory.includes(q)
        : pName.includes(q) || pBrand.includes(q) || pSupplier.includes(q) || pProducer.includes(q);

      const matchCat = categoryFilter === 'All' || p.category === categoryFilter;
      const matchBrand = brandFilter === 'All' || p.brand === brandFilter;
      const matchProducer = isStockViewer || producerFilter === 'All' || (p.producer || '') === producerFilter;
      const currentStock = Number(p.currentStock ?? 0);
      const minStock = Number(p.minStockLevel ?? 0);
      const matchLowStock = !onlyLowStock || currentStock <= minStock;

      return matchSearch && matchCat && matchBrand && matchProducer && matchLowStock;
    });
  }, [products, deferredSearchQuery, categoryFilter, brandFilter, producerFilter, onlyLowStock, isStockViewer]);

  // Total stock inventory value
  const totalStockPurchaseValue = useMemo(() => {
    return products.reduce((sum, p) => sum + (Number(p.currentStock ?? 0) * Number(p.purchasePrice ?? 0)), 0);
  }, [products]);

  const totalStockRetailValue = useMemo(() => {
    return products.reduce((sum, p) => sum + (Number(p.currentStock ?? 0) * Number(p.sellingPrice ?? 0)), 0);
  }, [products]);

  return (
    <div className="space-y-4 pb-24">
      {/* View Switcher: Inventory List vs Stock Movement Audit History */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === 'inventory'
                ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {isStockViewer ? `Catalogue (${products.length})` : `Inventory (${products.length})`}
          </button>
          {!isStockViewer && (
            <button
              type="button"
              onClick={() => setSubTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                subTab === 'history'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Stock History ({stockMovements.length})</span>
            </button>
          )}
        </div>

        {!isStockViewer && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenStockIn()}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <PackagePlus className="w-4 h-4" />
              <span>+ Add Stock</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddProduct}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>New Product</span>
            </button>
          </div>
        )}
      </div>

      {/* Success Notification Banner */}
      {toastMessage && (
        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage('')}
            className="text-slate-400 hover:text-white text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {subTab === 'inventory' ? (
        <div className="space-y-3">
          {/* Inventory Aggregate Header Card - Admin only */}
          {!isStockViewer && (
            <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Total Stock Cost Value</span>
                <strong className="text-base font-bold font-mono text-emerald-400">
                  {formatCurrency(totalStockPurchaseValue, settings.currencySymbol)}
                </strong>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[11px]">Retail Realization Value</span>
                <strong className="text-base font-bold font-mono text-white">
                  {formatCurrency(totalStockRetailValue, settings.currencySymbol)}
                </strong>
              </div>
            </div>
          )}

          {/* Search & Filter Controls */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
                placeholder={
                  isStockViewer
                    ? "Search catalogue by name, category, or brand..."
                    : "Search products by name, brand, producer, supplier..."
                }
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-left"
              />
            </div>

            {/* Filter Dropdowns Grid: In Stock Viewer mode, ONLY Category, Brand, and Low Stock are shown */}
            <div
              className={`grid gap-2 text-xs ${
                isStockViewer
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-2 sm:grid-cols-4'
              }`}
            >
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Category</label>
                <select
                  value={categoryFilter}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-[11px]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Brand</label>
                <select
                  value={brandFilter}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-[11px]"
                >
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {!isStockViewer && (
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Producer</label>
                  <select
                    value={producerFilter}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    onChange={(e) => setProducerFilter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-[11px]"
                  >
                    {producers.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setOnlyLowStock((prev) => !prev)}
                  className={`w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                    onlyLowStock
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Low Stock Only</span>
                </button>
              </div>
            </div>
          </div>

          {/* Product Cards List */}
          <div className="space-y-2.5">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-10 bg-slate-900/60 rounded-2xl border border-slate-800 text-xs text-slate-500">
                No products match the selected criteria.
              </div>
            ) : (
              filteredProducts.map((p) => {
                const currentStock = Number(p.currentStock ?? 0);
                const purchasePrice = Number(p.purchasePrice ?? 0);
                const minStockLevel = Number(p.minStockLevel ?? 0);
                const stockVal = currentStock * purchasePrice;
                const isOutOfStock = currentStock <= 0;
                const isLow = currentStock <= minStockLevel && !isOutOfStock;

                return (
                  <div
                    key={p.id}
                    className="p-3 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-2.5 text-xs hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Photo Thumbnail or Fallback Icon */}
                      <div className="w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                        {p.photoUrl ? (
                          <img
                            src={p.photoUrl}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-600" />
                        )}
                      </div>

                      {/* Product Basic Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-xs truncate">{p.name}</h4>
                          {isLow && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-semibold shrink-0">
                              Low Stock
                            </span>
                          )}
                          {isOutOfStock && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-bold shrink-0">
                              Out of Stock
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {p.category} · Brand: <strong className="text-slate-300">{p.brand}</strong>
                        </div>

                        {!isStockViewer && (
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            Producer: {p.producer} | Supplier: {p.supplier}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stock & Metric Bar */}
                    {isStockViewer ? (
                      <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Available Stock:</span>
                        <strong
                          className={`font-mono text-sm ${
                            isOutOfStock
                              ? 'text-rose-400'
                              : isLow
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {p.currentStock} {p.unit}
                        </strong>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px]">
                        <div>
                          <span className="text-slate-500 text-[10px] block">Stock:</span>
                          <strong
                            className={`font-mono text-xs ${
                              isOutOfStock
                                ? 'text-rose-400'
                                : isLow
                                ? 'text-amber-400'
                                : 'text-white'
                            }`}
                          >
                            {p.currentStock} {p.unit}
                          </strong>
                        </div>

                        <div>
                          <span className="text-slate-500 text-[10px] block">Cost:</span>
                          <span className="font-mono text-slate-300">
                            {formatCurrency(p.purchasePrice, settings.currencySymbol)}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-500 text-[10px] block">Selling:</span>
                          <span className="font-mono text-emerald-400 font-semibold">
                            {formatCurrency(p.sellingPrice, settings.currencySymbol)}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-500 text-[10px] block">Stock Val:</span>
                          <span className="font-mono text-white font-semibold">
                            {formatCurrency(stockVal, settings.currencySymbol)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-500">
                        Min alert: {p.minStockLevel} {p.unit}
                      </span>

                      {!isStockViewer && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenStockIn(p.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            <span>Stock In</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onEditProduct(p)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                            title="Edit Product"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setProductToDelete(p)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* SubTab 2: Stock History Audit Trail (Section 11) */
        <div className="space-y-3">
          <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
            <div>
              <h3 className="font-bold text-white flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-400" />
                <span>Stock Movement Audit Trail</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Every stock arrival, sale deduction, and adjustment is permanently logged
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {stockMovements.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                No stock movement transactions recorded yet.
              </div>
            ) : (
              stockMovements.map((sm) => {
                const isAddition = sm.quantity > 0;
                return (
                  <div
                    key={sm.id}
                    className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                            sm.type === 'STOCK_IN'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : sm.type === 'SALE'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          }`}
                        >
                          {sm.type}
                        </span>
                        <strong className="text-white font-medium truncate max-w-[200px]">
                          {sm.productName}
                        </strong>
                      </div>

                      <span
                        className={`font-mono font-bold text-xs ${
                          isAddition ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isAddition ? `+${sm.quantity}` : sm.quantity}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        Previous: <strong className="text-slate-300 font-mono">{sm.previousStock}</strong> ➔ New:{' '}
                        <strong className="text-white font-mono">{sm.newStock}</strong>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {new Date(sm.createdAt).toLocaleDateString()}{' '}
                        {new Date(sm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {sm.reference && (
                      <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80 flex items-center justify-between">
                        <span>Ref: {sm.reference}</span>
                        {sm.notes && <span className="italic">{sm.notes}</span>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* In-App Delete Product Confirmation Modal (No window.confirm) */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Product</h3>
                <p className="text-[11px] text-slate-400">Remove from MAHARAJA MARBLE catalogue</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs">
              <div className="font-bold text-white truncate">{productToDelete.name}</div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Category: <strong className="text-slate-300">{productToDelete.category}</strong></span>
                <span>Stock: <strong className="text-white">{productToDelete.currentStock} {productToDelete.unit}</strong></span>
              </div>
            </div>

            <p className="text-[11px] text-rose-300 bg-rose-950/30 border border-rose-500/30 p-2.5 rounded-xl">
              Are you sure you want to permanently remove this product? This action cannot be undone.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = productToDelete.id;
                  const targetName = productToDelete.name;
                  setProductToDelete(null);
                  onDeleteProduct(targetId);
                  setToastMessage(`Product "${targetName}" deleted successfully.`);
                  setTimeout(() => setToastMessage(''), 3500);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
