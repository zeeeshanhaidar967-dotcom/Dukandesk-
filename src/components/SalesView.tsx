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
}

interface SalesViewProps {
  products: ProductEntity[];
  customers: CustomerEntity[];
  settings: OwnerSettingsEntity;
  onCompleteSale: (saleInput: {
    customerId: string;
    items: Array<{ productId: string; quantity: number }>;
    amountPaid: number;
    paymentMethod: SaleEntity['paymentMethod'];
    notes?: string;
  }) => SaleEntity;
  onQuickAddCustomer: (data: { name: string; phone: string; address: string }) => CustomerEntity;
}

export const SalesView: React.FC<SalesViewProps> = ({
  products,
  customers,
  settings,
  onCompleteSale,
  onQuickAddCustomer,
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
    return cart.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0);
  }, [cart]);

  const totalCost = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.purchasePrice * item.quantity, 0);
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
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-1.5 grid grid-cols-2 gap-1.5 shadow-md">
        <button
          type="button"
          onClick={() => setSaleEntryMode('MANUAL')}
          className={`py-3 px-3 sm:px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            saleEntryMode === 'MANUAL'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <ShoppingCart className="w-4 h-4 text-emerald-300" />
          <span>Manual Entry</span>
        </button>

        <button
          type="button"
          onClick={() => setSaleEntryMode('PHOTO')}
          className={`py-3 px-3 sm:px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
            saleEntryMode === 'PHOTO'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-950/60'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Camera className="w-4 h-4 text-emerald-400" />
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
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
                <span>New Sale (Point of Sale)</span>
              </h2>
              <p className="text-xs text-slate-400">
                Manual entry &amp; automatic profit / stock calculations
              </p>
            </div>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded bg-rose-500/10"
              >
                Clear Cart ({cart.length})
              </button>
            )}
          </div>

      {/* Validation Error Alert */}
      {validationError && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>{validationError}</div>
        </div>
      )}

      {/* Two Column Layout on Desktop, Stacked on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Product Selection (NO SCANNING - Manual Search & Selection) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            {/* Search Input */}
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
                placeholder="Search products by name, brand..."
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-left"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
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
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Product Grid / List */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
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
                          ? 'bg-emerald-950/20 border-emerald-500/40'
                          : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-white truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span>{p.category}</span>
                          <span>·</span>
                          <span>Brand: {p.brand}</span>
                          <span>·</span>
                          <span
                            className={
                              isOutOfStock
                                ? 'text-rose-400 font-bold'
                                : isLowStock
                                ? 'text-amber-400 font-semibold'
                                : 'text-slate-300'
                            }
                          >
                            Stock: {p.currentStock} {p.unit}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className="font-bold font-mono text-white text-xs">
                            {formatCurrency(p.sellingPrice, settings.currencySymbol)}
                          </div>
                          <div className="text-[10px] text-slate-400">/{p.unit}</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddToCart(p)}
                          className="min-h-[36px] min-w-[36px] px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 flex items-center justify-center font-bold active:scale-95 transition-all"
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
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>Customer</span>
              </label>

              <button
                type="button"
                onClick={() => setShowQuickCustomerModal(true)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
              >
                <UserPlus className="w-3 h-3" />
                <span>+ Quick New</span>
              </button>
            </div>

            <select
              value={selectedCustomerId}
              style={{ direction: 'ltr', textAlign: 'left' }}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''} {c.outstandingBalance > 0 ? `· Due: ${formatCurrency(c.outstandingBalance, settings.currencySymbol)}` : ''}
                </option>
              ))}
            </select>

            {selectedCustomer && selectedCustomer.outstandingBalance > 0 && (
              <div className="px-2.5 py-1.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300 flex items-center justify-between">
                <span>Existing Outstanding Balance:</span>
                <strong className="font-mono text-amber-400">
                  {formatCurrency(selectedCustomer.outstandingBalance, settings.currencySymbol)}
                </strong>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-white border-b border-slate-800 pb-2">
              <span>Sale Items ({cart.length})</span>
              <span>Subtotal</span>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                Cart is empty. Select products from the left to start billing.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {cart.map((item) => {
                  const subtotal = item.product.sellingPrice * item.quantity;
                  const hasStockWarning = item.quantity > item.product.currentStock;

                  return (
                    <div
                      key={item.product.id}
                      className={`p-2 rounded-xl bg-slate-950/60 border ${
                        hasStockWarning ? 'border-amber-500/50 bg-amber-950/10' : 'border-slate-800/80'
                      } text-xs`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-white truncate">
                            {item.product.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {formatCurrency(item.product.sellingPrice, settings.currencySymbol)} / {item.product.unit}
                          </div>
                          {hasStockWarning && (
                            <div className="text-[10px] text-amber-400 font-semibold mt-0.5">
                              Exceeds stock ({item.product.currentStock} avail)
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <div className="font-bold font-mono text-white">
                            {formatCurrency(subtotal, settings.currencySymbol)}
                          </div>
                          <div className="text-[10px] text-emerald-400 font-mono">
                            Profit: +{formatCurrency((item.product.sellingPrice - item.product.purchasePrice) * item.quantity, settings.currencySymbol)}
                          </div>
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}
                            className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold"
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
                            className="w-14 text-center bg-slate-900 border border-slate-700 rounded-lg py-1 text-xs text-white font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                          <span className="text-[11px] text-slate-400 ml-1">{item.product.unit}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.product.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400"
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
              <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
                {/* Total Bill */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Total Bill Amount:</span>
                  <span className="text-lg font-bold font-mono text-white">
                    {formatCurrency(totalBill, settings.currencySymbol)}
                  </span>
                </div>

                {/* Owner Confidential Gross Profit calculation */}
                <div className="flex items-center justify-between text-[11px] text-emerald-400 font-mono bg-emerald-950/20 px-2 py-1 rounded-lg border border-emerald-500/20">
                  <span>Gross Profit Calculation:</span>
                  <span className="font-bold">+{formatCurrency(grossProfit, settings.currencySymbol)}</span>
                </div>

                {/* Payment Amount Input & Quick Chips */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-medium">Amount Received Now:</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSetAmountPaidPreset('full')}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold"
                      >
                        Full
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetAmountPaidPreset('half')}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetAmountPaidPreset('zero')}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-rose-400 font-semibold"
                      >
                        Credit (₹0)
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-400 text-xs">
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
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-400 text-left"
                      placeholder="Enter amount paid"
                    />
                  </div>
                </div>

                {/* Remaining Balance Due */}
                <div className="flex items-center justify-between text-xs pt-1 font-semibold">
                  <span className="text-slate-300">Remaining Balance:</span>
                  <span
                    className={`font-mono ${
                      remainingBalance > 0 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {formatCurrency(remainingBalance, settings.currencySymbol)}
                  </span>
                </div>

                {/* Payment Method */}
                <div className="pt-1">
                  <label className="text-[11px] text-slate-400 block mb-1">Payment Method</label>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {(['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`py-1.5 px-2 rounded-lg text-center font-medium transition-colors ${
                          paymentMethod === method
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 text-left"
                  />
                </div>

                {/* Complete Sale CTA */}
                <button
                  type="button"
                  onClick={handleCompleteSaleSubmit}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all mt-2"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Quick Add Customer</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickCustomerModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddCustomerSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">Customer / Firm Name *</label>
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-left"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Mobile Number</label>
                <input
                  type="tel"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  inputMode="tel"
                  autoComplete="off"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="e.g. +91 98234 11223"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-left"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Address / Site</label>
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-left"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowQuickCustomerModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-emerald-500 font-bold text-slate-950"
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
