import React, { useState, useEffect } from 'react';
import { Plus, X, PackagePlus, ArrowRight, CheckCircle2, TrendingUp } from 'lucide-react';
import { ProductEntity, OwnerSettingsEntity } from '../types/database';
import { formatCurrency } from '../services/calculations';

interface StockInModalProps {
  products: ProductEntity[];
  settings: OwnerSettingsEntity;
  initialProductId?: string;
  initialSuggestedQty?: number;
  isOpen: boolean;
  onClose: () => void;
  onConfirmStockIn: (
    productId: string,
    quantityReceived: number,
    newPurchasePrice?: number,
    reference?: string,
    notes?: string
  ) => void;
}

export const StockInModal: React.FC<StockInModalProps> = ({
  products,
  settings,
  initialProductId,
  initialSuggestedQty,
  isOpen,
  onClose,
  onConfirmStockIn,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(
    initialProductId || (products.length > 0 ? products[0].id : '')
  );
  const [quantityReceived, setQuantityReceived] = useState<string>(
    initialSuggestedQty ? String(initialSuggestedQty) : '50'
  );
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [supplierReference, setSupplierReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (initialProductId) {
      setSelectedProductId(initialProductId);
      if (initialSuggestedQty && initialSuggestedQty > 0) {
        setQuantityReceived(String(initialSuggestedQty));
      } else {
        const prod = products.find((p) => p.id === initialProductId);
        if (prod && prod.currentStock <= prod.minStockLevel) {
          setQuantityReceived(String(Math.max(prod.minStockLevel - prod.currentStock, 20)));
        }
      }
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [initialProductId, initialSuggestedQty, products]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Sync purchase price input with current product purchase price when selected product changes
  useEffect(() => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (prod) {
      setPurchasePrice(String(prod.purchasePrice));
    }
  }, [selectedProductId]);

  if (!isOpen) return null;

  const currentStock = selectedProduct ? selectedProduct.currentStock : 0;
  const qtyParsed = parseFloat(quantityReceived) || 0;
  const calculatedNewStock = currentStock + qtyParsed;
  const unit = selectedProduct ? selectedProduct.unit : 'unit';

  const priceParsed = parseFloat(purchasePrice) || (selectedProduct ? selectedProduct.purchasePrice : 0);
  const oldStockValue = currentStock * (selectedProduct ? selectedProduct.purchasePrice : 0);
  const newStockValue = calculatedNewStock * priceParsed;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedProductId) {
      setError('Please select a product.');
      return;
    }

    if (qtyParsed <= 0) {
      setError('Quantity received must be greater than zero.');
      return;
    }

    onConfirmStockIn(
      selectedProductId,
      qtyParsed,
      priceParsed,
      supplierReference.trim() || 'Direct Stock Arrival',
      notes.trim()
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-line rounded-3xl max-w-md w-full p-5 space-y-4 shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-strong pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-nav-active-pill text-primary flex items-center justify-center">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Stock-In System</h3>
              <p className="text-[11px] text-muted">Add newly arrived inventory</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-badge-red-bg border border-badge-red-text/35 text-xs text-badge-red-text">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Product Selector */}
          <div>
            <label className="text-ink font-semibold block mb-1">
              1. Select Existing Product *
            </label>
            <select
              value={selectedProductId}
              style={{ direction: 'ltr', textAlign: 'left' }}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink font-medium text-xs focus:ring-1 focus:ring-primary focus:border-line"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Current: {p.currentStock} {p.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Quantity Received */}
          <div>
            <label className="text-ink font-semibold block mb-1">
              2. Quantity Received * ({unit})
            </label>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              style={{ direction: 'ltr', textAlign: 'left' }}
              autoComplete="off"
              required
              value={quantityReceived}
              onChange={(e) => setQuantityReceived(e.target.value)}
              placeholder="e.g. 50"
              className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink font-mono font-bold text-sm text-left focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Purchase Price */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-ink font-semibold">
                3. Purchase Cost Price ({settings.currencySymbol} per {unit})
              </label>
              <span className="text-[10px] text-muted">Update if changed</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted">
                {settings.currencySymbol}
              </span>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl pl-7 pr-3 py-2 text-ink font-mono font-semibold text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Real-time Automatic Math Preview (Exact prompt requirement 3) */}
          <div className="p-3 rounded-2xl bg-inner border border-line-strong space-y-2 text-xs">
            <div className="text-[11px] font-bold text-primary flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>AUTOMATIC CALCULATION PREVIEW</span>
            </div>

            <div className="space-y-1 text-muted font-mono">
              <div className="flex justify-between">
                <span>Current stock:</span>
                <span className="text-ink font-bold">{currentStock} {unit}</span>
              </div>
              <div className="flex justify-between text-badge-green-text">
                <span>New stock received:</span>
                <span className="font-bold">+{qtyParsed} {unit}</span>
              </div>
              <div className="flex justify-between border-t border-line-strong pt-1 text-primary font-bold">
                <span>New stock after confirmation:</span>
                <span className="text-sm">{calculatedNewStock} {unit}</span>
              </div>
              <div className="flex justify-between text-[11px] text-muted pt-1 border-t border-line-strong">
                <span>Stock inventory value:</span>
                <span>{formatCurrency(oldStockValue, settings.currencySymbol)} ➔ <strong className="text-ink">{formatCurrency(newStockValue, settings.currencySymbol)}</strong></span>
              </div>
            </div>
          </div>

          {/* Supplier Reference & Notes */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-muted block mb-1">Invoice / PO Ref</label>
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={supplierReference}
                onChange={(e) => setSupplierReference(e.target.value)}
                placeholder="e.g. INV-9042"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-2.5 py-1.5 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-muted block mb-1">Supplier / Memo</label>
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Morbi Factory"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-2.5 py-1.5 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Confirm Button */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover active:scale-95 text-white font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm Stock-In</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
