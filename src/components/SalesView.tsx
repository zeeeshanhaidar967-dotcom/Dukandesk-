import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  UserPlus,
  AlertCircle,
  Receipt,
  CheckCircle2,
  DollarSign,
  User,
  Package,
  Camera,
} from 'lucide-react';
import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  OwnerSettingsEntity,
} from '../types/database';
import { formatCurrency } from '../services/calculations';
import { BillPhotoSaleView } from './BillPhotoSaleView';

interface CartItem {
  product: ProductEntity;
  quantity: number;
  customSellingPrice?: number;
}

interface SalesViewProps {
  products: ProductEntity[];
  customers: CustomerEntity[];
  settings: OwnerSettingsEntity;
  onCompleteSale: (saleInput: {
    customerId: string;
    items: Array<{ productId: string; quantity: number; customSellingPrice?: number }>;
    amountPaid: number;
    paymentMethod: SaleEntity['paymentMethod'];
    notes?: string;
  }) => SaleEntity;
  onQuickAddCustomer: (data: { name: string; phone: string; address: string }) => CustomerEntity;
  onEditProduct?: (product: ProductEntity) => void;
  onUpdateProductPrice?: (productId: string, newSellingPrice: number) => void;
}

export const SalesView: React.FC<SalesViewProps> = ({
  products,
  customers,
  settings,
  onCompleteSale,
  onQuickAddCustomer,
  onEditProduct,
  onUpdateProductPrice,
}) => {
  // Method selection: 'MANUAL' | 'PHOTO'
  const [saleEntryMode, setSaleEntryMode] = useState<'MANUAL' | 'PHOTO'>('MANUAL');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    customers.length > 0 ? customers[0].id : ''
  );
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [isManualPaidEdited, setIsManualPaidEdited] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SaleEntity['paymentMethod']>('Cash');
  const [saleNotes, setSaleNotes] = useState('');

  // Missing Selling Price dialog state
  const [missingPriceModalProduct, setMissingPriceModalProduct] = useState<ProductEntity | null>(null);
  const [missingPriceInput, setMissingPriceInput] = useState<string>('');
  const [missingPriceSaveToCatalog, setMissingPriceSaveToCatalog] = useState<boolean>(true);
  const [missingPriceModalError, setMissingPriceModalError] = useState<string>('');

  // Per-cart item rate editing
  const [editingRateProductId, setEditingRateProductId] = useState<string | null>(null);
  const [editingRateInput, setEditingRateInput] = useState<string>('');

  // Product Search & Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Quick Customer Creation modal inside sale
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  // Error / Warning banner
  const [validationError, setValidationError] = useState<string>('');

  // Available categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return ['All', ...Array.from(set)];
  }, [products]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Filtered products for selection (uses deferred query to eliminate typing lag)
  const filteredProducts = useMemo(() => {
    const q = deferredSearchQuery.toLowerCase().trim();
    return products.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q));
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [products, deferredSearchQuery, selectedCategory]);

  // Cart Totals calculation
  const totalBill = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price =
        item.customSellingPrice !== undefined && item.customSellingPrice !== null
          ? item.customSellingPrice
          : item.product.sellingPrice;
      return sum + (price != null ? price * item.quantity : 0);
    }, 0);
  }, [cart]);

  const totalCost = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.purchasePrice * item.quantity, 0);
  }, [cart]);

  const hasUnpricedCartItems = useMemo(() => {
    return cart.some((item) => {
      const price =
        item.customSellingPrice !== undefined && item.customSellingPrice !== null
          ? item.customSellingPrice
          : item.product.sellingPrice;
      return price === null || price === undefined || isNaN(price);
    });
  }, [cart]);

  const grossProfit = totalBill - totalCost;

  // Amount Paid logic (defaults to full payment unless user edited it)
  const effectivePaid = useMemo(() => {
    if (!isManualPaidEdited) {
      return totalBill;
    }
    const val = parseFloat(amountPaidInput);
    return isNaN(val) ? 0 : Math.max(0, val);
  }, [totalBill, isManualPaidEdited, amountPaidInput]);

  const remainingBalance = Math.max(0, totalBill - effectivePaid);

  // Selected customer details
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Handlers for Cart
  const handleAddToCart = (product: ProductEntity) => {
    setValidationError('');

    // If product has no selling price, prompt user to enter one for this sale
    if (product.sellingPrice === null || product.sellingPrice === undefined) {
      setMissingPriceModalProduct(product);
      setMissingPriceInput('');
      setMissingPriceSaveToCatalog(true);
      setMissingPriceModalError('');
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleConfirmMissingPrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!missingPriceModalProduct) return;
    const price = parseFloat(missingPriceInput);
    if (isNaN(price) || price < 0) {
      setMissingPriceModalError('Please enter a valid non-negative selling price.');
      return;
    }

    const prod = missingPriceModalProduct;
    if (missingPriceSaveToCatalog && onUpdateProductPrice) {
      onUpdateProductPrice(prod.id, price);
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === prod.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === prod.id
            ? { ...item, quantity: item.quantity + 1, customSellingPrice: price }
            : item
        );
      }
      return [
        ...prev,
        {
          product: { ...prod, sellingPrice: missingPriceSaveToCatalog ? price : prod.sellingPrice },
          quantity: 1,
          customSellingPrice: price,
        },
      ];
    });

    setMissingPriceModalProduct(null);
    setMissingPriceInput('');
    setMissingPriceModalError('');
  };

  const handleSaveItemCustomRate = (productId: string, newRateStr: string) => {
    const rate = parseFloat(newRateStr);
    if (isNaN(rate) || rate < 0) {
      setValidationError('Please enter a valid non-negative selling price.');
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, customSellingPrice: rate } : item
      )
    );
    setEditingRateProductId(null);
    setEditingRateInput('');
  };

  const handleUpdateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleSetAmountPaidPreset = (preset: 'full' | 'half' | 'zero') => {
    setIsManualPaidEdited(true);
    if (preset === 'full') {
      setAmountPaidInput(String(totalBill));
    } else if (preset === 'half') {
      setAmountPaidInput(String(Math.round(totalBill / 2)));
    } else {
      setAmountPaidInput('0');
      setPaymentMethod('Credit');
    }
  };

  const handleQuickAddCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    const created = onQuickAddCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim(),
    });

    setSelectedCustomerId(created.id);
    setShowQuickCustomerModal(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
  };

  const handleCompleteSaleSubmit = () => {
    setValidationError('');

    if (cart.length === 0) {
      setValidationError('Please add at least one product to the sale.');
      return;
    }

    if (!selectedCustomerId) {
      setValidationError('Please select or create a customer.');
      return;
    }

    // Check stock quantities
    for (const item of cart) {
      if (item.quantity > item.product.currentStock) {
        setValidationError(
          `Warning: Sale quantity for "${item.product.name}" (${item.quantity} ${item.product.unit}) exceeds available stock (${item.product.currentStock} ${item.product.unit}). Please adjust quantity or restock.`
        );
        return;
      }
    }

    try {
      onCompleteSale({
        customerId: selectedCustomerId,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        amountPaid: effectivePaid,
        paymentMethod,
        notes: saleNotes,
      });

      // Reset cart
      setCart([]);
      setIsManualPaidEdited(false);
      setAmountPaidInput('');
      setSaleNotes('');
    } catch (err: any) {
      setValidationError(err.message || 'Failed to complete sale.');
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Method Selection Bar: Option 1 (Manual Entry) & Option 2 (Add from Bill Photo) */}
      <div className="bg-card border border-line rounded-3xl p-1.5 grid grid-cols-2 gap-1.5 shadow-card">
        <button
          type="button"
          onClick={() => setSaleEntryMode('MANUAL')}
          className={`py-3 px-3 sm:px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            saleEntryMode === 'MANUAL'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted hover:text-ink hover:bg-inner'
          }`}
        >
          <ShoppingCart className="w-4 h-4 text-white" />
          <span>Manual Entry</span>
        </button>

        <button
          type="button"
          onClick={() => setSaleEntryMode('PHOTO')}
          className={`py-3 px-3 sm:px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            saleEntryMode === 'PHOTO'
              ? 'bg-primary text-white shadow-sm'
              : 'text-muted hover:text-ink hover:bg-inner'
          }`}
        >
          <Camera className="w-4 h-4 text-white" />
          <span>Add from Bill Photo</span>
        </button>
      </div>

      {saleEntryMode === 'PHOTO' ? (
        <BillPhotoSaleView
          products={products}
          customers={customers}
          settings={settings}
          onConfirmSale={onCompleteSale}
          onQuickAddCustomer={onQuickAddCustomer}
          onSwitchToManual={() => setSaleEntryMode('MANUAL')}
        />
      ) : (
        <>
          {/* Sales Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <span>New Sale (Point of Sale)</span>
              </h2>
              <p className="text-xs text-muted">
                Manual entry &amp; automatic profit / stock calculations
              </p>
            </div>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-badge-red-text hover:text-badge-red-text/80 font-medium px-2 py-1 rounded bg-badge-red-bg"
              >
                Clear Cart ({cart.length})
              </button>
            )}
          </div>

      {/* Validation Error Alert */}
      {validationError && (
        <div className="p-3 rounded-xl bg-badge-red-bg border border-badge-red-text/35 flex items-start gap-2.5 text-xs text-badge-red-text">
          <AlertCircle className="w-4 h-4 text-badge-red-text shrink-0 mt-0.5" />
          <div>{validationError}</div>
        </div>
      )}

      {/* Two Column Layout on Desktop, Stacked on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Product Selection (NO SCANNING - Manual Search & Selection) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-card border border-line rounded-2xl p-3.5 space-y-3 shadow-card">
            {/* Search Input */}
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
                placeholder="Search products by name, brand..."
                className="w-full bg-card border border-line-strong rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder-placeholder focus:outline-none focus:ring-1 focus:ring-primary text-left"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-ink"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg whitespace-nowrap text-[11px] font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-inner text-muted hover:bg-inner hover:text-ink'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Product Grid / List */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted">
                  No matching products found.
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const inCart = cart.find((item) => item.product.id === p.id);
                  const isOutOfStock = p.currentStock <= 0;
                  const isLowStock = p.currentStock <= p.minStockLevel && !isOutOfStock;

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all text-xs ${
                        inCart
                          ? 'bg-badge-green-bg border-badge-green-text/35'
                          : 'bg-card border-line hover:border-line-strong shadow-card'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-ink truncate">{p.name}</div>
                        <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2">
                          <span>{p.category}</span>
                          <span>·</span>
                          <span>Brand: {p.brand}</span>
                          <span>·</span>
                          <span
                            className={
                              isOutOfStock
                                ? 'text-badge-red-text font-bold'
                                : isLowStock
                                ? 'text-badge-yellow-text font-semibold'
                                : 'text-muted'
                            }
                          >
                            Stock: {p.currentStock} {p.unit}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="font-bold font-mono text-ink text-xs">
                            {p.sellingPrice !== null && p.sellingPrice !== undefined ? (
                              formatCurrency(p.sellingPrice, settings.currencySymbol)
                            ) : (
                              <span className="text-badge-yellow-text font-sans text-[10px]">Price not set</span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted">/{p.unit}</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddToCart(p)}
                          className="min-h-[36px] min-w-[36px] px-2.5 rounded-lg bg-badge-green-bg hover:bg-badge-green-bg/80 text-badge-green-text border border-badge-green-text/35 flex items-center justify-center font-bold active:scale-95 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Cart, Customer & Checkout */}
        <div className="lg:col-span-5 space-y-3">
          {/* Customer Selection Card */}
          <div className="bg-card border border-line rounded-2xl p-3.5 space-y-2.5 shadow-card">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" />
                <span>Customer</span>
              </label>

              <button
                type="button"
                onClick={() => setShowQuickCustomerModal(true)}
                className="text-[11px] text-primary hover:text-primary-hover font-semibold flex items-center gap-1"
              >
                <UserPlus className="w-3 h-3" />
                <span>+ Quick New</span>
              </button>
            </div>

            <select
              value={selectedCustomerId}
              style={{ direction: 'ltr', textAlign: 'left' }}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''} {c.outstandingBalance > 0 ? `· Due: ${formatCurrency(c.outstandingBalance, settings.currencySymbol)}` : ''}
                </option>
              ))}
            </select>

            {selectedCustomer && selectedCustomer.outstandingBalance > 0 && (
              <div className="px-2.5 py-1.5 rounded-lg bg-badge-yellow-bg border border-badge-yellow-text/35 text-[11px] text-badge-yellow-text flex items-center justify-between">
                <span>Existing Outstanding Balance:</span>
                <strong className="font-mono text-badge-yellow-text">
                  {formatCurrency(selectedCustomer.outstandingBalance, settings.currencySymbol)}
                </strong>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="bg-card border border-line rounded-2xl p-3.5 space-y-3 shadow-card">
            <div className="flex items-center justify-between text-xs font-bold text-ink border-b border-line pb-2">
              <span>Sale Items ({cart.length})</span>
              <span>Subtotal</span>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted">
                Cart is empty. Select products from the left to start billing.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {cart.map((item) => {
                  const effectivePrice =
                    item.customSellingPrice !== undefined && item.customSellingPrice !== null
                      ? item.customSellingPrice
                      : item.product.sellingPrice;
                  const isPriceSet = effectivePrice !== null && effectivePrice !== undefined;
                  const subtotal = isPriceSet ? effectivePrice * item.quantity : 0;
                  const hasStockWarning = item.quantity > item.product.currentStock;

                  return (
                    <div
                      key={item.product.id}
                      className={`p-2 rounded-xl bg-inner border ${
                        hasStockWarning ? 'border-badge-yellow-text/35 bg-badge-yellow-bg' : 'border-line-strong'
                      } text-xs`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-ink truncate">
                            {item.product.name}
                          </div>
                          <div className="text-[11px] text-muted">
                            {isPriceSet ? (
                              `${formatCurrency(effectivePrice, settings.currencySymbol)} / ${item.product.unit}`
                            ) : (
                              <span className="text-badge-yellow-text font-semibold">Price not set</span>
                            )}
                          </div>
                          {hasStockWarning && (
                            <div className="text-[10px] text-badge-yellow-text font-semibold mt-0.5">
                              Exceeds stock ({item.product.currentStock} avail)
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <div className="font-bold font-mono text-ink">
                            {isPriceSet ? formatCurrency(subtotal, settings.currencySymbol) : '—'}
                          </div>
                          <div className="text-[10px] text-badge-green-text font-mono">
                            {isPriceSet
                              ? `Profit: +${formatCurrency((effectivePrice - item.product.purchasePrice) * item.quantity, settings.currencySymbol)}`
                              : 'Profit: —'}
                          </div>
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-line-strong">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-card border border-line-strong text-ink hover:bg-inner flex items-center justify-center font-bold"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            dir="ltr"
                            style={{ direction: 'ltr', textAlign: 'center' }}
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^0-9]/g, '');
                              const val = cleaned === '' ? 0 : parseInt(cleaned, 10);
                              handleUpdateQuantity(item.product.id, val);
                            }}
                            onBlur={() => {
                              if (!item.quantity || item.quantity < 1) {
                                handleUpdateQuantity(item.product.id, 1);
                              }
                            }}
                            className="w-14 text-center bg-card border border-line-strong rounded-lg py-1 text-xs text-ink font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-card border border-line-strong text-ink hover:bg-inner flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                          <span className="text-[11px] text-muted ml-1">{item.product.unit}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.product.id)}
                          className="p-1.5 text-muted hover:text-badge-red-text"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Calculations Breakdown */}
            {cart.length > 0 && (
              <div className="border-t border-line pt-3 space-y-2 text-xs">
                {/* Total Bill */}
                <div className="flex items-center justify-between">
                  <span className="text-ink font-medium">Total Bill Amount:</span>
                  <span className="text-lg font-bold font-mono text-ink">
                    {formatCurrency(totalBill, settings.currencySymbol)}
                  </span>
                </div>

                {/* Owner Confidential Gross Profit calculation */}
                <div className="flex items-center justify-between text-[11px] text-badge-green-text font-mono bg-badge-green-bg px-2 py-1 rounded-lg border border-badge-green-text/35">
                  <span>Gross Profit Calculation:</span>
                  <span className="font-bold">+{formatCurrency(grossProfit, settings.currencySymbol)}</span>
                </div>

                {/* Payment Amount Input & Quick Chips */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-ink font-medium">Amount Received Now:</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSetAmountPaidPreset('full')}
                        className="px-2 py-0.5 rounded text-[10px] bg-inner hover:bg-inner text-badge-green-text border border-line-strong font-semibold"
                      >
                        Full
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetAmountPaidPreset('half')}
                        className="px-2 py-0.5 rounded text-[10px] bg-inner hover:bg-inner text-ink border border-line-strong"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetAmountPaidPreset('zero')}
                        className="px-2 py-0.5 rounded text-[10px] bg-inner hover:bg-inner text-badge-red-text border border-line-strong font-semibold"
                      >
                        Credit (₹0)
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted text-xs">
                      {settings.currencySymbol}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      style={{ direction: 'ltr', textAlign: 'left' }}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={isManualPaidEdited ? amountPaidInput : totalBill === 0 ? '' : String(totalBill)}
                      onFocus={() => {
                        if (!isManualPaidEdited) {
                          setIsManualPaidEdited(true);
                          setAmountPaidInput(totalBill > 0 ? String(totalBill) : '');
                        }
                      }}
                      onChange={(e) => {
                        setIsManualPaidEdited(true);
                        setAmountPaidInput(e.target.value);
                      }}
                      className="w-full bg-card border border-line-strong rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-ink focus:outline-none focus:ring-1 focus:ring-primary text-left"
                      placeholder="Enter amount paid"
                    />
                  </div>
                </div>

                {/* Remaining Balance Due */}
                <div className="flex items-center justify-between text-xs pt-1 font-semibold">
                  <span className="text-ink">Remaining Balance:</span>
                  <span
                    className={`font-mono ${
                      remainingBalance > 0 ? 'text-badge-red-text' : 'text-badge-green-text'
                    }`}
                  >
                    {formatCurrency(remainingBalance, settings.currencySymbol)}
                  </span>
                </div>

                {/* Payment Method */}
                <div className="pt-1">
                  <label className="text-[11px] text-muted block mb-1">Payment Method</label>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {(['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`py-1.5 px-2 rounded-lg text-center font-medium transition-colors ${
                          paymentMethod === method
                            ? 'bg-primary text-white font-bold shadow-sm'
                            : 'bg-inner text-muted hover:bg-inner hover:text-ink'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <input
                    type="text"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    placeholder="Optional memo (e.g. site delivery, cheque details)"
                    className="w-full bg-card border border-line-strong rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder-placeholder focus:outline-none focus:ring-1 focus:ring-primary text-left"
                  />
                </div>

                {/* Complete Sale CTA */}
                <button
                  type="button"
                  onClick={handleCompleteSaleSubmit}
                  className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all mt-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Complete Sale & Generate Bill</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Add Customer Modal */}
      {showQuickCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-line rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                <span>Quick Add Customer</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickCustomerModal(false)}
                className="text-muted hover:text-ink text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddCustomerSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-ink font-medium block mb-1">Customer / Firm Name *</label>
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar (Contractor)"
                  className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-ink font-medium block mb-1">Mobile Number</label>
                <input
                  type="tel"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  inputMode="tel"
                  autoComplete="off"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="e.g. +91 98234 11223"
                  className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink font-mono text-left focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-ink font-medium block mb-1">Address / Site</label>
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  placeholder="e.g. Sector 18, House 42"
                  className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowQuickCustomerModal(false)}
                  className="flex-1 py-2 rounded-xl bg-inner text-muted hover:bg-inner font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary-hover font-bold text-white shadow-sm"
                >
                  Create & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
