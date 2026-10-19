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

  // Stock movements: latest on top (newest first), earlier down below
  const sortedStockMovements = useMemo(() => {
    return [...stockMovements].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return b.id.localeCompare(a.id);
    });
  }, [stockMovements]);

  // Total stock inventory value
  const totalStockPurchaseValue = useMemo(() => {
    return products.reduce((sum, p) => sum + (Number(p.currentStock ?? 0) * Number(p.purchasePrice ?? 0)), 0);
  }, [products]);

  const { totalStockRetailValue, unpricedProductsCount } = useMemo(() => {
    let unpricedCount = 0;
    const total = products.reduce((sum, p) => {
      if (p.sellingPrice !== null && p.sellingPrice !== undefined) {
        return sum + Number(p.currentStock ?? 0) * Number(p.sellingPrice);
      }
      unpricedCount++;
      return sum;
    }, 0);
    return { totalStockRetailValue: total, unpricedProductsCount: unpricedCount };
  }, [products]);

  return (
    <div className="space-y-4 pb-24">
      {/* View Switcher: Inventory List vs Stock Movement Audit History */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 p-1 bg-inner border border-line-strong rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === 'inventory'
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted hover:text-ink'
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
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:text-ink'
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
              className="px-3 py-1.5 rounded-xl bg-inner hover:bg-inner text-primary border border-line-strong text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
            >
              <PackagePlus className="w-4 h-4" />
              <span>+ Add Stock</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddProduct}
              className="px-3 py-1.5 rounded-xl bg-accent hover:bg-accent/90 text-accent-text text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>New Product</span>
            </button>
          </div>
        )}
      </div>

      {/* Success Notification Banner */}
      {toastMessage && (
        <div className="p-3 rounded-2xl bg-badge-green-bg border border-badge-green-text/35 text-badge-green-text text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-badge-green-text animate-pulse" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage('')}
            className="text-muted hover:text-ink text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {subTab === 'inventory' ? (
        <div className="space-y-3">
          {/* Inventory Aggregate Header Card - Admin only */}
          {!isStockViewer && (
            <div className="p-3.5 bg-card border border-line rounded-2xl flex items-center justify-between text-xs shadow-card">
              <div>
                <span className="text-muted block text-[11px]">Total Stock Cost Value</span>
                <strong className="text-base font-bold font-mono text-badge-green-text">
                  {formatCurrency(totalStockPurchaseValue, settings.currencySymbol)}
                </strong>
              </div>
              <div className="text-right">
                <span className="text-muted block text-[11px]">
                  Retail Realization Value
                  {unpricedProductsCount > 0 && (
                    <span className="text-badge-yellow-text text-[10px] ml-1">
                      ({unpricedProductsCount} unpriced)
                    </span>
                  )}
                </span>
                <strong className="text-base font-bold font-mono text-ink">
                  {formatCurrency(totalStockRetailValue, settings.currencySymbol)}
                </strong>
              </div>
            </div>
          )}

          {/* Search & Filter Controls */}
          <div className="bg-card border border-line rounded-2xl p-3 space-y-2.5 shadow-card">
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
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
                className="w-full bg-card border border-line-strong rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder-placeholder focus:outline-none focus:ring-1 focus:ring-primary text-left"
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
                <label className="text-[10px] text-muted block mb-0.5">Category</label>
                <select
                  value={categoryFilter}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-card border border-line-strong rounded-lg px-2 py-1.5 text-ink text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-muted block mb-0.5">Brand</label>
                <select
                  value={brandFilter}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  onChange={(e) => setBrandFilter(e.target.value)}
                  className="w-full bg-card border border-line-strong rounded-lg px-2 py-1.5 text-ink text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {!isStockViewer && (
                <div>
                  <label className="text-[10px] text-muted block mb-0.5">Producer</label>
                  <select
                    value={producerFilter}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    onChange={(e) => setProducerFilter(e.target.value)}
                    className="w-full bg-card border border-line-strong rounded-lg px-2 py-1.5 text-ink text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
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
                      ? 'bg-badge-yellow-bg text-badge-yellow-text border-badge-yellow-text/35'
                      : 'bg-card text-muted border-line-strong hover:border-muted'
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
              <div className="text-center py-10 bg-card rounded-2xl border border-line text-xs text-muted shadow-card">
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
                    className="p-3 bg-card border border-line rounded-2xl space-y-2.5 text-xs hover:border-line-strong transition-colors shadow-card"
                  >
                    <div className="flex items-start gap-3">
                      {/* Photo Thumbnail or Fallback Icon */}
                      <div className="w-14 h-14 rounded-xl bg-inner border border-line-strong overflow-hidden flex items-center justify-center shrink-0">
                        {p.photoUrl ? (
                          <img
                            src={p.photoUrl}
                            alt={p.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-muted" />
                        )}
                      </div>

                      {/* Product Basic Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-ink text-xs truncate">{p.name}</h4>
                          {isLow && (
                            <span className="px-1.5 py-0.5 rounded bg-badge-yellow-bg border border-badge-yellow-text/35 text-badge-yellow-text text-[10px] font-semibold shrink-0">
                              Low Stock
                            </span>
                          )}
                          {isOutOfStock && (
                            <span className="px-1.5 py-0.5 rounded bg-badge-red-bg border border-badge-red-text/35 text-badge-red-text text-[10px] font-bold shrink-0">
                              Out of Stock
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-muted mt-0.5">
                          {p.category} · Brand: <strong className="text-ink">{p.brand}</strong>
                        </div>

                        {!isStockViewer && (
                          <div className="text-[10px] text-muted truncate mt-0.5">
                            Producer: {p.producer} | Supplier: {p.supplier}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stock & Metric Bar */}
                    {isStockViewer ? (
                      <div className="p-2.5 rounded-xl bg-inner border border-line-strong flex items-center justify-between text-xs">
                        <div>
                          <span className="text-muted block text-[10px]">Selling Price:</span>
                          {p.sellingPrice !== null && p.sellingPrice !== undefined && (typeof p.sellingPrice !== 'string' || (p.sellingPrice as string).trim() !== '') && !isNaN(Number(p.sellingPrice)) ? (
                            <strong className="font-mono text-badge-green-text text-xs font-bold">
                              {formatCurrency(Number(p.sellingPrice), settings.currencySymbol)} per {p.unit}
                            </strong>
                          ) : (
                            <span className="text-badge-yellow-text font-semibold text-[10px] bg-badge-yellow-bg px-1.5 py-0.5 rounded border border-badge-yellow-text/35 inline-block mt-0.5">
                              Not Decided
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-muted block text-[10px]">Available Stock:</span>
                          <strong
                            className={`font-mono text-sm ${
                              isOutOfStock
                                ? 'text-badge-red-text'
                                : isLow
                                ? 'text-badge-yellow-text'
                                : 'text-badge-green-text'
                            }`}
                          >
                            {p.currentStock} {p.unit}
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-inner border border-line-strong text-[11px]">
                        <div>
                          <span className="text-muted text-[10px] block">Stock:</span>
                          <strong
                            className={`font-mono text-xs ${
                              isOutOfStock
                                ? 'text-badge-red-text'
                                : isLow
                                ? 'text-badge-yellow-text'
                                : 'text-ink'
                            }`}
                          >
                            {p.currentStock} {p.unit}
                          </strong>
                        </div>

                        <div>
                          <span className="text-muted text-[10px] block">Cost:</span>
                          <span className="font-mono text-muted">
                            {formatCurrency(p.purchasePrice, settings.currencySymbol)}
                          </span>
                        </div>

                        <div>
                          <span className="text-muted text-[10px] block">Selling:</span>
                          {p.sellingPrice != null && !isNaN(Number(p.sellingPrice)) ? (
                            <span className="font-mono text-badge-green-text font-semibold">
                              {formatCurrency(Number(p.sellingPrice), settings.currencySymbol)}
                            </span>
                          ) : (
                            <span className="text-badge-yellow-text font-semibold text-[10px] bg-badge-yellow-bg px-1.5 py-0.5 rounded border border-badge-yellow-text/35 inline-block mt-0.5">
                              Not Decided
                            </span>
                          )}
                        </div>

                        <div>
                          <span className="text-muted text-[10px] block">Stock Val:</span>
                          <span className="font-mono text-ink font-semibold">
                            {formatCurrency(stockVal, settings.currencySymbol)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-1 border-t border-line">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">
                          Min alert: {p.minStockLevel} {p.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInspectProduct(p)}
                          className="text-[11px] text-muted hover:text-primary flex items-center gap-1 font-medium transition-colors"
                          title="View Product Details"
                        >
                          <Eye className="w-3 h-3 text-primary" />
                          <span>Details</span>
                        </button>
                      </div>

                      {!isStockViewer && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenStockIn(p.id)}
                            className="px-2.5 py-1 rounded-lg bg-badge-green-bg hover:bg-badge-green-bg/80 text-badge-green-text border border-badge-green-text/35 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            <span>Stock In</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onEditProduct(p)}
                            className="px-2.5 py-1 rounded-lg bg-inner hover:bg-inner text-ink border border-line-strong text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                            title="Edit Product Details"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-badge-blue-text" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setProductToDelete(p)}
                            className="p-1.5 rounded-lg bg-badge-red-bg hover:bg-badge-red-bg/80 text-badge-red-text border border-badge-red-text/35"
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
          <div className="p-3 bg-card border border-line rounded-2xl flex items-center justify-between text-xs shadow-card">
            <div>
              <h3 className="font-bold text-ink flex items-center gap-1.5">
                <History className="w-4 h-4 text-primary" />
                <span>Stock Movement Audit Trail</span>
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                Every stock arrival, sale deduction, and adjustment is permanently logged
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {sortedStockMovements.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted">
                No stock movement transactions recorded yet.
              </div>
            ) : (
              sortedStockMovements.map((sm) => {
                const isAddition = sm.quantity > 0;
                return (
                  <div
                    key={sm.id}
                    className="p-3 rounded-2xl bg-card border border-line text-xs space-y-1.5 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                            sm.type === 'STOCK_IN'
                              ? 'bg-badge-green-bg text-badge-green-text border border-badge-green-text/35'
                              : sm.type === 'SALE'
                              ? 'bg-badge-red-bg text-badge-red-text border border-badge-red-text/35'
                              : 'bg-badge-blue-bg text-badge-blue-text border border-badge-blue-text/35'
                          }`}
                        >
                          {sm.type}
                        </span>
                        <strong className="text-ink font-medium truncate max-w-[200px]">
                          {sm.productName}
                        </strong>
                      </div>

                      <span
                        className={`font-mono font-bold text-xs ${
                          isAddition ? 'text-badge-green-text' : 'text-badge-red-text'
                        }`}
                      >
                        {isAddition ? `+${sm.quantity}` : sm.quantity}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>
                        Previous: <strong className="text-ink font-mono">{sm.previousStock}</strong> ➔ New:{' '}
                        <strong className="text-ink font-mono">{sm.newStock}</strong>
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {new Date(sm.createdAt).toLocaleDateString()}{' '}
                        {new Date(sm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {sm.reference && (
                      <div className="text-[10px] text-muted pt-1 border-t border-line flex items-center justify-between">
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-line rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-badge-red-bg border border-badge-red-text/35 text-badge-red-text flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">Delete Product</h3>
                <p className="text-[11px] text-muted">Remove from MAHARAJA MARBLE catalogue</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-inner border border-line-strong space-y-1.5 text-xs">
              <div className="font-bold text-ink truncate">{productToDelete.name}</div>
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Category: <strong className="text-ink">{productToDelete.category}</strong></span>
                <span>Stock: <strong className="text-ink">{productToDelete.currentStock} {productToDelete.unit}</strong></span>
              </div>
            </div>

            <p className="text-[11px] text-badge-red-text bg-badge-red-bg border border-badge-red-text/35 p-2.5 rounded-xl">
              Are you sure you want to permanently remove this product? This action cannot be undone.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-inner hover:bg-inner text-muted font-semibold text-xs transition-colors"
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
                className="flex-1 py-2.5 rounded-xl bg-badge-red-text hover:bg-badge-red-text/90 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Details Inspection Modal with Edit Product Action */}
      {inspectProduct && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-line rounded-3xl max-w-md w-full p-5 space-y-4 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-badge-green-bg text-badge-green-text flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-ink truncate">{inspectProduct.name}</h3>
                  <span className="text-[11px] font-mono text-muted">{inspectProduct.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectProduct(null)}
                className="text-muted hover:text-ink text-sm p-1 rounded-lg hover:bg-inner transition-colors"
              >
                ✕
              </button>
            </div>

            {inspectProduct.photoUrl && (
              <div className="w-full h-44 rounded-2xl bg-inner border border-line-strong overflow-hidden flex items-center justify-center">
                <img
                  src={inspectProduct.photoUrl}
                  alt={inspectProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-inner border border-line-strong">
                <div>
                  <span className="text-muted text-[10px] block">Category</span>
                  <span className="text-ink font-medium">{inspectProduct.category}</span>
                </div>
                <div>
                  <span className="text-muted text-[10px] block">Brand</span>
                  <span className="text-ink font-medium">{inspectProduct.brand || 'Standard'}</span>
                </div>
                {!isStockViewer && (
                  <>
                    <div>
                      <span className="text-muted text-[10px] block">Producer / Mfr</span>
                      <span className="text-muted truncate block">{inspectProduct.producer || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] block">Supplier</span>
                      <span className="text-muted truncate block">{inspectProduct.supplier || '—'}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-inner border border-line-strong">
                <div>
                  <span className="text-muted text-[10px] block">Current Stock</span>
                  <strong className="font-mono text-ink text-sm">
                    {inspectProduct.currentStock} {inspectProduct.unit}
                  </strong>
                </div>
                {!isStockViewer && (
                  <div>
                    <span className="text-muted text-[10px] block">Cost Price</span>
                    <span className="font-mono text-muted font-semibold text-xs">
                      {formatCurrency(inspectProduct.purchasePrice, settings.currencySymbol)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted text-[10px] block">Selling Price</span>
                  {inspectProduct.sellingPrice !== null && inspectProduct.sellingPrice !== undefined && (typeof inspectProduct.sellingPrice !== 'string' || (inspectProduct.sellingPrice as string).trim() !== '') && !isNaN(Number(inspectProduct.sellingPrice)) ? (
                    <span className="font-mono text-badge-green-text font-bold text-xs">
                      {formatCurrency(Number(inspectProduct.sellingPrice), settings.currencySymbol)} per {inspectProduct.unit}
                    </span>
                  ) : (
                    <span className="text-badge-yellow-text font-semibold text-[10px] bg-badge-yellow-bg px-1.5 py-0.5 rounded border border-badge-yellow-text/35 inline-block mt-0.5">
                      Not Decided
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between px-1 text-[11px] text-muted">
                <span>Min alert level: {inspectProduct.minStockLevel} {inspectProduct.unit}</span>
                <span>Updated: {new Date(inspectProduct.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setInspectProduct(null)}
                className="flex-1 py-2.5 rounded-xl bg-inner hover:bg-inner text-muted font-semibold text-xs transition-colors"
              >
                Close
              </button>
              {!isStockViewer && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const p = inspectProduct;
                      setInspectProduct(null);
                      onOpenStockIn(p.id);
                    }}
                    className="py-2.5 px-3 rounded-xl bg-badge-green-bg hover:bg-badge-green-bg/80 text-badge-green-text border border-badge-green-text/35 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all"
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>Stock In</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const p = inspectProduct;
                      setInspectProduct(null);
                      onEditProduct(p);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Product</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
