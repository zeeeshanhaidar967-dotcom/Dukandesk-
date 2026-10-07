import React, { useState, useMemo } from 'react';
import {
  X,
  User,
  Phone,
  MapPin,
  Calendar,
  Receipt,
  Wallet,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import {
  CustomerEntity,
  SaleEntity,
  PaymentEntity,
  OwnerSettingsEntity,
  SaleReturnEntity,
} from '../types/database';
import { formatCurrency } from '../services/calculations';

interface CustomerDashboardModalProps {
  customer: CustomerEntity | null;
  sales: SaleEntity[];
  payments: PaymentEntity[];
  returns?: SaleReturnEntity[];
  settings: OwnerSettingsEntity;
  isOpen: boolean;
  onClose: () => void;
  onOpenReceivePayment: (customerId: string) => void;
  onOpenSaleReceipt: (sale: SaleEntity) => void;
}

export const CustomerDashboardModal: React.FC<CustomerDashboardModalProps> = ({
  customer,
  sales,
  payments,
  returns = [],
  settings,
  isOpen,
  onClose,
  onOpenReceivePayment,
  onOpenSaleReceipt,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'purchases' | 'payments'>('timeline');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Filter sales and payments for this customer (safe with null customer)
  const customerSales = useMemo(() => {
    if (!customer) return [];
    return sales.filter((s) => s.customerId === customer.id);
  }, [sales, customer]);

  const customerPayments = useMemo(() => {
    if (!customer) return [];
    return payments.filter((p) => p.customerId === customer.id);
  }, [payments, customer]);

  const customerReturns = useMemo(() => {
    if (!customer) return [];
    return (returns || []).filter((r) => r.customerId === customer.id);
  }, [returns, customer]);

  // Build combined chronological transaction timeline (Section 6 & 7 requirements)
  const timelineEvents = useMemo(() => {
    if (!customer) return [];

    type TimelineItem = {
      id: string;
      date: string;
      timestamp: number;
      type: 'PURCHASE' | 'PAYMENT' | 'RETURN';
      sale?: SaleEntity;
      payment?: PaymentEntity;
      saleReturn?: SaleReturnEntity;
    };

    const list: TimelineItem[] = [];

    customerSales.forEach((s) => {
      list.push({
        id: `sale-${s.id}`,
        date: s.createdAt,
        timestamp: new Date(s.createdAt).getTime(),
        type: 'PURCHASE',
        sale: s,
      });
    });

    customerPayments.forEach((p) => {
      list.push({
        id: `pay-${p.id}`,
        date: p.createdAt,
        timestamp: new Date(p.createdAt).getTime(),
        type: 'PAYMENT',
        payment: p,
      });
    });

    customerReturns.forEach((r) => {
      list.push({
        id: `ret-${r.id}`,
        date: r.createdAt,
        timestamp: new Date(r.createdAt).getTime(),
        type: 'RETURN',
        saleReturn: r,
      });
    });

    // Sort descending by timestamp
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [customerSales, customerPayments, customerReturns, customer]);

  const toggleExpandSale = (saleId: string) => {
    setExpandedSaleId((prev) => (prev === saleId ? null : saleId));
  };

  // Guard return statement ONLY after all hooks are executed
  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{customer.name}</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                  {customer.id}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                {customer.phone && (
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="w-3 h-3 text-slate-500" />
                    {customer.phone}
                  </span>
                )}
                {customer.address && (
                  <span className="flex items-center gap-1 truncate max-w-[200px]">
                    <MapPin className="w-3 h-3 text-slate-500" />
                    {customer.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer Ledger Metrics Card (Section 6 exact requirement) */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block">Total Purchases</span>
            <strong className="text-sm font-bold font-mono text-white">
              {formatCurrency(customer.totalPurchases, settings.currencySymbol)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {customerSales.length} bills
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-400 block">Total Paid</span>
            <strong className="text-sm font-bold font-mono text-emerald-400">
              {formatCurrency(customer.totalPaid, settings.currencySymbol)}
            </strong>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {customerPayments.length} payments
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Outstanding Due</span>
            <strong
              className={`text-sm font-bold font-mono ${
                customer.outstandingBalance > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {formatCurrency(customer.outstandingBalance, settings.currencySymbol)}
            </strong>
            {customer.outstandingBalance > 0 && (
              <button
                type="button"
                onClick={() => onOpenReceivePayment(customer.id)}
                className="mt-1 px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-bold active:scale-95 transition-all"
              >
                + Receive
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
              activeTab === 'timeline'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Transaction Timeline ({timelineEvents.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('purchases')}
            className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
              activeTab === 'purchases'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Bills ({customerSales.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
              activeTab === 'payments'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Payments ({customerPayments.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[260px]">
          {activeTab === 'timeline' && (
            <div className="space-y-2">
              {timelineEvents.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No transaction history recorded for this customer yet.
                </div>
              ) : (
                timelineEvents.map((item) => {
                  if (item.type === 'PURCHASE' && item.sale) {
                    const sale = item.sale;
                    const isExpanded = expandedSaleId === sale.id;

                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-400 font-mono text-[10px] font-bold">
                              BILL #{sale.billNumber}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {new Date(sale.createdAt).toLocaleDateString()} {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="text-right">
                            <div className="font-bold font-mono text-white text-xs">
                              {formatCurrency(sale.totalBill, settings.currencySymbol)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Paid: <span className="text-emerald-400 font-mono">{formatCurrency(sale.amountPaid, settings.currencySymbol)}</span> · Due:{' '}
                              <span className="text-rose-400 font-mono">{formatCurrency(sale.balanceDue, settings.currencySymbol)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Items Preview */}
                        <div className="pt-1 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">
                            {sale.items.length} product(s) purchased
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExpandSale(sale.id)}
                              className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px]"
                            >
                              <span>{isExpanded ? 'Hide items' : 'View items'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenSaleReceipt(sale)}
                              className="text-emerald-400 hover:text-emerald-300 font-semibold text-[10px]"
                            >
                              Print Memo
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1 bg-slate-900/60 p-2 rounded-xl">
                            {sale.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-[11px] text-slate-300">
                                <span>
                                  {it.productName} ({it.quantity} {it.unit} @ {formatCurrency(it.sellingPrice, settings.currencySymbol)})
                                </span>
                                <span className="font-mono font-semibold text-white">
                                  {formatCurrency(it.subtotal, settings.currencySymbol)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  } else if (item.type === 'PAYMENT' && item.payment) {
                    const pay = item.payment;
                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Wallet className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-semibold text-white">
                              Payment Received
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {pay.paymentDate} · Method: {pay.paymentMethod} {pay.notes ? `· ${pay.notes}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold font-mono text-emerald-400 text-sm">
                            +{formatCurrency(pay.amount, settings.currencySymbol)}
                          </div>
                          <div className="text-[10px] text-slate-400">Credit Cleared</div>
                        </div>
                      </div>
                    );
                  } else if (item.type === 'RETURN' && item.saleReturn) {
                    const ret = item.saleReturn;
                    return (
                      <div
                        key={item.id}
                        className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-2xl text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span>Product Return / Adjustment</span>
                                <span className="font-mono text-[10px] text-slate-400 font-normal">
                                  (Bill #{ret.billNumber})
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {new Date(ret.createdAt).toLocaleDateString()} {new Date(ret.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-mono font-bold text-rose-400 text-sm">
                              -{formatCurrency(ret.totalReturnValue, settings.currencySymbol)}
                            </div>
                            <div className="text-[10px] text-emerald-400 font-semibold">
                              Due Adj: -{formatCurrency(ret.dueAdjustment, settings.currencySymbol)}
                            </div>
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-slate-800/60 text-[11px] space-y-1">
                          {ret.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-slate-300">
                              <span>
                                {it.productName} ({it.returnedQuantity} {it.unit} @ {formatCurrency(it.sellingPrice, settings.currencySymbol)})
                              </span>
                              <span className="font-mono text-slate-200">
                                {formatCurrency(it.returnValue, settings.currencySymbol)}
                              </span>
                            </div>
                          ))}
                          {ret.refundAmount > 0 && (
                            <div className="text-[10px] text-amber-300 font-semibold pt-0.5">
                              💵 Cash/UPI Refunded to Customer: {formatCurrency(ret.refundAmount, settings.currencySymbol)}
                            </div>
                          )}
                          {ret.creditAmount > 0 && (
                            <div className="text-[10px] text-blue-300 font-semibold pt-0.5">
                              🏷️ Store Credit Retained: {formatCurrency(ret.creditAmount, settings.currencySymbol)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })
              )}
            </div>
          )}

          {activeTab === 'purchases' && (
            <div className="space-y-2">
              {customerSales.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No bills found.</div>
              ) : (
                customerSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-white font-mono">#{sale.billNumber}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(sale.createdAt).toLocaleDateString()} · Mode: {sale.paymentMethod}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold font-mono text-white text-xs">
                          {formatCurrency(sale.totalBill, settings.currencySymbol)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Balance Due:{' '}
                          <strong className="text-rose-400 font-mono">
                            {formatCurrency(sale.balanceDue, settings.currencySymbol)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {sale.items.length} items sold
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenSaleReceipt(sale)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                      >
                        View & Print Bill ➔
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-2">
              {customerPayments.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No payment receipts logged yet.
                </div>
              ) : (
                customerPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-emerald-400 font-mono text-xs">
                        +{formatCurrency(p.amount, settings.currencySymbol)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {p.paymentDate} · {p.paymentMethod} {p.notes ? `· ${p.notes}` : ''}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{p.id}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom Quick Action */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
          >
            Close
          </button>

          {customer.outstandingBalance > 0 && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenReceivePayment(customer.id);
              }}
              className="py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <Wallet className="w-4 h-4" />
              <span>Receive Partial / Full Payment</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
