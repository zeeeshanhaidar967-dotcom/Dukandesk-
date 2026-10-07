import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  User,
  Package,
  Layers,
  Phone,
  ArrowRight,
  TrendingDown,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import {
  CustomerEntity,
  SaleEntity,
  ProductEntity,
  OwnerSettingsEntity,
  SaleReturnEntity,
} from '../types/database';
import { formatCurrency } from '../services/calculations';

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerEntity[];
  sales: SaleEntity[];
  products: ProductEntity[];
  settings: OwnerSettingsEntity;
  onConfirmReturn: (input: {
    saleId: string;
    items: {
      saleItemId: string;
      productId: string;
      returnQuantity: number;
    }[];
    settlementType: 'DUE_ADJUSTMENT' | 'REFUND' | 'STORE_CREDIT';
    notes?: string;
  }) => SaleReturnEntity;
}

export const ReturnModal: React.FC<ReturnModalProps> = ({
  isOpen,
  onClose,
  customers,
  sales,
  products,
  settings,
  onConfirmReturn,
}) => {
  // Step 1: Customer & Sale selection
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');

  // Step 2: Return item quantities (mapping: saleItemId -> returnQuantity)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [settlementType, setSettlementType] = useState<'DUE_ADJUSTMENT' | 'REFUND' | 'STORE_CREDIT'>('REFUND');
  const [returnNotes, setReturnNotes] = useState('');

  // Step 3: Confirmation modal & completion state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [completedReturn, setCompletedReturn] = useState<SaleReturnEntity | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Reset state when closing or opening
  const handleClose = () => {
    setSelectedCustomerId('');
    setCustomerSearchQuery('');
    setSelectedSaleId('');
    setReturnQuantities({});
    setReturnNotes('');
    setShowConfirmDialog(false);
    setCompletedReturn(null);
    setErrorMessage('');
    onClose();
  };

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        c.id.toLowerCase().includes(q)
    );
  }, [customers, customerSearchQuery]);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Sales belonging to the selected customer
  const customerSales = useMemo(() => {
    if (!selectedCustomerId) return [];
    return sales.filter((s) => s.customerId === selectedCustomerId);
  }, [sales, selectedCustomerId]);

  const selectedSale = useMemo(() => {
    if (!selectedSaleId) return null;
    return customerSales.find((s) => s.id === selectedSaleId) || null;
  }, [customerSales, selectedSaleId]);

  // Handle customer selection
  const handleSelectCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    setSelectedSaleId('');
    setReturnQuantities({});
    setErrorMessage('');

    // If customer has only 1 sale, pre-select it for convenience
    const matchingSales = sales.filter((s) => s.customerId === custId);
    if (matchingSales.length === 1) {
      setSelectedSaleId(matchingSales[0].id);
    }
  };

  // Handle return quantity change for a specific sale item
  const handleQuantityChange = (saleItemId: string, maxEligible: number, val: number) => {
    setErrorMessage('');
    const clamped = Math.max(0, Math.min(val, maxEligible));
    setReturnQuantities((prev) => ({
      ...prev,
      [saleItemId]: clamped,
    }));
  };

  // Calculate return items summary
  const itemsToReturn = useMemo(() => {
    if (!selectedSale) return [];
    return selectedSale.items
      .map((item) => {
        const alreadyReturned = item.returnedQuantity || 0;
        const eligibleQty = Math.max(0, item.quantity - alreadyReturned);
        const returnQty = returnQuantities[item.id] || 0;
        const itemReturnValue = returnQty * item.sellingPrice;
        return {
          saleItem: item,
          alreadyReturned,
          eligibleQty,
          returnQty,
          itemReturnValue,
        };
      })
      .filter((i) => i.returnQty > 0);
  }, [selectedSale, returnQuantities]);

  const totalReturnValue = useMemo(() => {
    return itemsToReturn.reduce((sum, i) => sum + i.itemReturnValue, 0);
  }, [itemsToReturn]);

  // Financial impact calculation
  const currentCustomerDue = selectedCustomer ? selectedCustomer.outstandingBalance : 0;
  const dueAdjustment = Math.min(currentCustomerDue, totalReturnValue);
  const excessAmount = Math.max(0, totalReturnValue - currentCustomerDue);
  const newDue = Math.max(0, currentCustomerDue - dueAdjustment);

  // Validate and open confirmation dialog
  const handleReviewReturn = () => {
    setErrorMessage('');
    if (!selectedSale) {
      setErrorMessage('Please select the original sale/bill first.');
      return;
    }
    if (itemsToReturn.length === 0) {
      setErrorMessage('Please enter a return quantity greater than 0 for at least one item.');
      return;
    }
    // Verify none exceeds eligible
    for (const item of itemsToReturn) {
      if (item.returnQty > item.eligibleQty) {
        setErrorMessage(
          `Return quantity for ${item.saleItem.productName} cannot exceed ${item.eligibleQty} ${item.saleItem.unit}.`
        );
        return;
      }
    }
    setShowConfirmDialog(true);
  };

  // Confirm and execute the return
  const handleExecuteReturn = () => {
    if (!selectedSale || itemsToReturn.length === 0) return;
    try {
      const returnPayload = {
        saleId: selectedSale.id,
        items: itemsToReturn.map((i) => ({
          saleItemId: i.saleItem.id,
          productId: i.saleItem.productId,
          returnQuantity: i.returnQty,
        })),
        settlementType: excessAmount > 0 ? settlementType : 'DUE_ADJUSTMENT',
        notes: returnNotes.trim() || undefined,
      };

      const result = onConfirmReturn(returnPayload);
      setCompletedReturn(result);
      setShowConfirmDialog(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process return.');
      setShowConfirmDialog(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Customer Sale Return</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  Bill Linked
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Return sold products, restock inventory & adjust customer dues automatically
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          {completedReturn ? (
            /* SUCCESS CONFIRMATION STATE */
            <div className="text-center py-6 px-4 space-y-4 bg-slate-950/70 border border-emerald-500/30 rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-base font-bold text-white">Return Processed Successfully</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Return reference ID: <strong className="font-mono text-emerald-400">{completedReturn.id}</strong> (Original Bill #{completedReturn.billNumber})
                </p>
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-left p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <span className="text-slate-400 text-[10px] block">Customer</span>
                  <span className="font-bold text-white truncate block">{completedReturn.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Return Value</span>
                  <span className="font-mono font-bold text-rose-400">
                    {formatCurrency(completedReturn.totalReturnValue, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Due Adjusted</span>
                  <span className="font-mono font-bold text-emerald-400">
                    -{formatCurrency(completedReturn.dueAdjustment, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Refund/Credit</span>
                  <span className="font-mono font-bold text-amber-400">
                    {completedReturn.refundAmount > 0
                      ? `Refund ${formatCurrency(completedReturn.refundAmount, settings.currencySymbol)}`
                      : completedReturn.creditAmount > 0
                      ? `Credit ${formatCurrency(completedReturn.creditAmount, settings.currencySymbol)}`
                      : 'None (Full Due)'}
                  </span>
                </div>
              </div>

              {/* Items Restocked List */}
              <div className="text-left text-xs bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-300 text-[11px] flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Items Restocked into Inventory:</span>
                </div>
                {completedReturn.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-slate-300 py-1 border-t border-slate-800/60 text-[11px]">
                    <span>
                      {it.productName} ({it.returnedQuantity} {it.unit} @ {formatCurrency(it.sellingPrice, settings.currencySymbol)})
                    </span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{it.returnedQuantity} {it.unit} added to stock
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  Done & Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* STEP 1: SELECT CUSTOMER */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span>1. Select Customer</span>
                  </label>
                  {selectedCustomer && (
                    <span className="text-[11px] text-slate-400 font-mono">
                      Current Due:{' '}
                      <strong
                        className={
                          selectedCustomer.outstandingBalance > 0
                            ? 'text-rose-400 font-bold'
                            : 'text-emerald-400'
                        }
                      >
                        {formatCurrency(selectedCustomer.outstandingBalance, settings.currencySymbol)}
                      </strong>
                    </span>
                  )}
                </div>

                {/* Customer search & select */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      dir="ltr"
                      style={{ direction: 'ltr', textAlign: 'left' }}
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      placeholder="Type name e.g. Vivek..."
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-left"
                    />
                  </div>

                  <select
                    value={selectedCustomerId}
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    onChange={(e) => handleSelectCustomer(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="">-- Choose Customer ({filteredCustomers.length}) --</option>
                    {filteredCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''} · Due:{' '}
                        {formatCurrency(c.outstandingBalance, settings.currencySymbol)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* STEP 2: SELECT ORIGINAL SALE / BILL */}
              {selectedCustomerId && (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <label className="text-xs font-bold text-white flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-blue-400" />
                      <span>2. Select Original Sale / Bill</span>
                    </span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      {customerSales.length} bill(s) found
                    </span>
                  </label>

                  {customerSales.length === 0 ? (
                    <div className="p-3 rounded-xl bg-slate-900 text-center text-xs text-slate-400">
                      No previous sales recorded for {selectedCustomer?.name}.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {customerSales.map((sale) => {
                        const isSelected = selectedSaleId === sale.id;
                        const dateFormatted = new Date(sale.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });

                        return (
                          <div
                            key={sale.id}
                            onClick={() => {
                              setSelectedSaleId(sale.id);
                              setReturnQuantities({});
                            }}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all text-xs space-y-1 ${
                              isSelected
                                ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                                : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-white text-[11px]">
                                BILL #{sale.billNumber}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {dateFormatted}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Total Bill:</span>
                              <span className="font-mono font-bold text-white">
                                {formatCurrency(sale.totalBill, settings.currencySymbol)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>
                                Paid: <strong className="text-emerald-400 font-mono">{formatCurrency(sale.amountPaid, settings.currencySymbol)}</strong>
                              </span>
                              <span>
                                Due: <strong className="text-rose-400 font-mono">{formatCurrency(sale.balanceDue, settings.currencySymbol)}</strong>
                              </span>
                            </div>

                            <div className="text-[10px] text-slate-500 truncate pt-0.5">
                              {sale.items.map((i) => `${i.productName} (${i.quantity} ${i.unit})`).join(', ')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: SHOW PRODUCTS & ENTER RETURN QUANTITIES */}
              {selectedSale && (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-amber-400" />
                      <span>3. Products in Bill #{selectedSale.billNumber}</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Enter quantity to return
                    </span>
                  </div>

                  {/* Products Table/Cards */}
                  <div className="space-y-2.5">
                    {selectedSale.items.map((item) => {
                      const alreadyReturned = item.returnedQuantity || 0;
                      const eligibleQty = Math.max(0, item.quantity - alreadyReturned);
                      const returnQty = returnQuantities[item.id] || 0;
                      const itemCalcTotal = returnQty * item.sellingPrice;

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border text-xs space-y-2 transition-colors ${
                            returnQty > 0
                              ? 'bg-rose-950/20 border-rose-500/40'
                              : 'bg-slate-900/90 border-slate-800'
                          }`}
                        >
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-white text-xs">
                                {item.productName}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <span>Selling Rate: <strong className="font-mono text-white">{formatCurrency(item.sellingPrice, settings.currencySymbol)} / {item.unit}</strong></span>
                                <span>·</span>
                                <span>Sold: <strong className="font-mono text-slate-200">{item.quantity} {item.unit}</strong></span>
                              </div>
                            </div>

                            {/* Eligibility badge */}
                            <div className="text-right shrink-0">
                              {eligibleQty === 0 ? (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">
                                  Fully Returned
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                  Eligible: {eligibleQty} {item.unit}
                                </span>
                              )}
                              {alreadyReturned > 0 && (
                                <span className="block text-[9px] text-slate-500 mt-0.5">
                                  Prev returned: {alreadyReturned} {item.unit}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Stepper & return quantity row */}
                          {eligibleQty > 0 && (
                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-300 font-semibold">
                                  Return Qty ({item.unit}):
                                </span>
                                <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuantityChange(
                                        item.id,
                                        eligibleQty,
                                        Math.max(0, returnQty - 1)
                                      )
                                    }
                                    className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    dir="ltr"
                                    style={{ direction: 'ltr', textAlign: 'center' }}
                                    min="0"
                                    max={eligibleQty}
                                    value={returnQty === 0 ? '' : returnQty}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      handleQuantityChange(item.id, eligibleQty, val);
                                    }}
                                    className="w-12 text-center bg-transparent text-white font-mono font-bold text-xs focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuantityChange(
                                        item.id,
                                        eligibleQty,
                                        Math.min(eligibleQty, returnQty + 1)
                                      )
                                    }
                                    className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 block">Item Return Value:</span>
                                <strong className="font-mono text-rose-400 text-xs font-bold">
                                  {formatCurrency(itemCalcTotal, settings.currencySymbol)}
                                </strong>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 4: FINANCIAL SUMMARY & EXCESS DUE HANDLING */}
              {itemsToReturn.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-slate-950 via-slate-900 to-rose-950/20 border border-rose-500/30 space-y-3">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                      <span>Financial Adjustment Summary</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {itemsToReturn.length} item(s) selected
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Total Return Value:</div>
                      <div className="font-mono font-bold text-base text-rose-400">
                        {formatCurrency(totalReturnValue, settings.currencySymbol)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ({itemsToReturn.map((i) => `${i.returnQty} ${i.saleItem.unit}`).join(' + ')})
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Customer Current Due:</div>
                      <div className="font-mono font-bold text-base text-white">
                        {formatCurrency(currentCustomerDue, settings.currencySymbol)}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-semibold">
                        Due reduction: -{formatCurrency(dueAdjustment, settings.currencySymbol)}
                      </div>
                    </div>
                  </div>

                  {/* Resulting balance line */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">Resulting Customer Due:</span>
                    <strong
                      className={`font-mono text-sm font-bold ${
                        newDue > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {formatCurrency(newDue, settings.currencySymbol)}{' '}
                      {newDue === 0 ? '(Due Cleared)' : ''}
                    </strong>
                  </div>

                  {/* Handling excess amount (Section 8 & 9) */}
                  {excessAmount > 0 && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs space-y-2">
                      <div className="flex items-center justify-between text-amber-300 font-bold text-[11px]">
                        <span>Return Value Exceeds Due by:</span>
                        <span className="font-mono text-sm">
                          {formatCurrency(excessAmount, settings.currencySymbol)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        The entire due of {formatCurrency(currentCustomerDue, settings.currencySymbol)} is cleared. How should the remaining {formatCurrency(excessAmount, settings.currencySymbol)} be settled with the customer?
                      </p>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <label
                          className={`p-2 rounded-xl border cursor-pointer text-center font-semibold text-xs transition-all ${
                            settlementType === 'REFUND'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="settlementType"
                            checked={settlementType === 'REFUND'}
                            onChange={() => setSettlementType('REFUND')}
                            className="hidden"
                          />
                          <span>💵 Refund Cash/UPI</span>
                          <span className="block text-[10px] font-normal opacity-80 mt-0.5">Pay customer back</span>
                        </label>

                        <label
                          className={`p-2 rounded-xl border cursor-pointer text-center font-semibold text-xs transition-all ${
                            settlementType === 'STORE_CREDIT'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="settlementType"
                            checked={settlementType === 'STORE_CREDIT'}
                            onChange={() => setSettlementType('STORE_CREDIT')}
                            className="hidden"
                          />
                          <span>🏷️ Store Credit</span>
                          <span className="block text-[10px] font-normal opacity-80 mt-0.5">Credit for next bill</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Return Notes */}
                  <div>
                    <input
                      type="text"
                      dir="ltr"
                      style={{ direction: 'ltr', textAlign: 'left' }}
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      placeholder="Optional return reason (e.g. Excess tiles after renovation)..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-400 text-left"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!completedReturn && (
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={itemsToReturn.length === 0}
              onClick={handleReviewReturn}
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-500/20 active:scale-95 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Review & Confirm Return</span>
            </button>
          </div>
        )}
      </div>

      {/* CONFIRMATION SUMMARY DIALOG (Section 14) */}
      {showConfirmDialog && selectedCustomer && selectedSale && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Confirm Product Return</h4>
                <p className="text-[11px] text-slate-400">Review final return breakdown</p>
              </div>
            </div>

            {/* Exact summary matching Section 14 & 19 */}
            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <strong className="text-white">{selectedCustomer.name}</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Product:</span>
                <strong className="text-white truncate max-w-[180px]">
                  {itemsToReturn.map((i) => i.saleItem.productName).join(', ')}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Return Quantity:</span>
                <strong className="text-rose-400 font-mono">
                  {itemsToReturn.map((i) => `${i.returnQty} ${i.saleItem.unit}`).join(', ')}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Return Value:</span>
                <strong className="font-mono text-rose-400 font-bold">
                  {formatCurrency(totalReturnValue, settings.currencySymbol)}
                </strong>
              </div>

              <div className="border-t border-slate-800/80 pt-1.5 flex justify-between">
                <span className="text-slate-400">Stock Update:</span>
                <strong className="font-mono text-emerald-400 font-bold">
                  +{itemsToReturn.map((i) => `${i.returnQty} ${i.saleItem.unit}`).join(', ')}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Due Adjustment:</span>
                <strong className="font-mono text-emerald-400 font-bold">
                  -{formatCurrency(dueAdjustment, settings.currencySymbol)}
                </strong>
              </div>

              <div className="border-t border-slate-800/80 pt-1.5 flex justify-between font-bold text-slate-200">
                <span>New Customer Due:</span>
                <strong className="font-mono text-emerald-400 text-sm">
                  {formatCurrency(newDue, settings.currencySymbol)}
                </strong>
              </div>

              {excessAmount > 0 && (
                <div className="flex justify-between text-amber-300 font-bold pt-1 border-t border-slate-800/80">
                  <span>{settlementType === 'REFUND' ? 'Cash/UPI Refund:' : 'Store Credit:'}</span>
                  <span className="font-mono">{formatCurrency(excessAmount, settings.currencySymbol)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleExecuteReturn}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30 active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Return</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
