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
  Share2,
  Printer,
  Package,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import {
  CustomerEntity,
  SaleEntity,
  PaymentEntity,
  OwnerSettingsEntity,
  SaleReturnEntity,
} from '../types/database';
import { formatCurrency } from '../services/calculations';

export type BillHistoryItem =
  | {
      type: 'SALE';
      id: string;
      billNumber: string;
      timestamp: number;
      date: string;
      sale: SaleEntity;
      linkedReturns: SaleReturnEntity[];
    }
  | {
      type: 'RETURN';
      id: string;
      returnBillNumber: string;
      originalBillNumber: string;
      timestamp: number;
      date: string;
      saleReturn: SaleReturnEntity;
      originalSale?: SaleEntity;
    };

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
  onOpenReturnReceipt?: (returnRecord: SaleReturnEntity) => void;
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
  onOpenReturnReceipt,
}) => {
  // Default to 'bills' (Bill History) so the owner immediately sees the customer's sale & return bills
  const [activeTab, setActiveTab] = useState<'bills' | 'timeline' | 'payments'>('bills');
  const [billFilter, setBillFilter] = useState<'all' | 'sales' | 'returns'>('all');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [expandedReturnId, setExpandedReturnId] = useState<string | null>(null);

  // Filter sales and payments for this customer using reliable customer ID
  const customerSales = useMemo(() => {
    if (!customer) return [];
    return sales.filter((s) => s.customerId === customer.id);
  }, [sales, customer]);

  const customerPayments = useMemo(() => {
    if (!customer) return [];
    return payments.filter((p) => p.customerId === customer.id);
  }, [payments, customer]);

  // Associate returns using customer ID or linked sale ID
  const customerReturns = useMemo(() => {
    if (!customer) return [];
    return (returns || []).filter(
      (r) =>
        r.customerId === customer.id ||
        (r.saleId && customerSales.some((s) => s.id === r.saleId))
    );
  }, [returns, customer, customerSales]);

  const totalReturnValue = useMemo(() => {
    return customerReturns.reduce((sum, r) => sum + r.totalReturnValue, 0);
  }, [customerReturns]);

  // Combined Bill History (Sale Bills + Return Bills) sorted newest first
  const billHistoryItems = useMemo((): BillHistoryItem[] => {
    if (!customer) return [];

    const list: BillHistoryItem[] = [];

    customerSales.forEach((s) => {
      const linkedReturns = customerReturns.filter(
        (r) => r.saleId === s.id || (r.billNumber && r.billNumber === s.billNumber)
      );
      list.push({
        type: 'SALE',
        id: `sale-${s.id}`,
        billNumber: s.billNumber,
        timestamp: new Date(s.createdAt).getTime(),
        date: s.createdAt,
        sale: s,
        linkedReturns,
      });
    });

    customerReturns.forEach((r) => {
      const originalSale = customerSales.find(
        (s) => s.id === r.saleId || (s.billNumber && s.billNumber === r.billNumber)
      );
      list.push({
        type: 'RETURN',
        id: `ret-${r.id}`,
        returnBillNumber: r.returnBillNumber || r.id,
        originalBillNumber: r.billNumber,
        timestamp: new Date(r.createdAt).getTime(),
        date: r.createdAt,
        saleReturn: r,
        originalSale,
      });
    });

    // Sort descending by timestamp (newest transactions first)
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [customerSales, customerReturns, customer]);

  const filteredBillHistory = useMemo(() => {
    if (billFilter === 'sales') return billHistoryItems.filter((b) => b.type === 'SALE');
    if (billFilter === 'returns') return billHistoryItems.filter((b) => b.type === 'RETURN');
    return billHistoryItems;
  }, [billHistoryItems, billFilter]);

  // Build combined chronological transaction timeline (Purchases, Payments, Returns)
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

  const toggleExpandReturn = (returnId: string) => {
    setExpandedReturnId((prev) => (prev === returnId ? null : returnId));
  };

  // Guard return statement ONLY after all hooks are executed
  if (!isOpen || !customer) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-card border border-line rounded-3xl max-w-xl w-full p-4 sm:p-5 space-y-3.5 shadow-card max-h-[92vh] flex flex-col">
        {/* Customer Profile Header */}
        <div className="flex items-center justify-between border-b border-line-strong pb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-nav-active-pill text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-badge-green-text/35">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink truncate">{customer.name}</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-inner text-muted border border-line-strong shrink-0">
                  {customer.id}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted mt-0.5 flex-wrap">
                {customer.phone && (
                  <span className="flex items-center gap-1 font-mono">
                    <Phone className="w-3 h-3 text-muted" />
                    {customer.phone}
                  </span>
                )}
                {customer.address && (
                  <span className="flex items-center gap-1 truncate max-w-[200px]">
                    <MapPin className="w-3 h-3 text-muted" />
                    {customer.address}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-inner transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer Ledger Metrics Card (Authoritative Ledger State) */}
        <div className="space-y-2 shrink-0">
          <div className="grid grid-cols-3 gap-2 p-3 bg-inner border border-line-strong rounded-2xl text-xs">
            <div>
              <span className="text-[10px] text-muted block">Total Purchases</span>
              <strong className="text-sm font-bold font-mono text-ink">
                {formatCurrency(customer.totalPurchases, settings.currencySymbol)}
              </strong>
              <span className="text-[10px] text-muted block mt-0.5">
                {customerSales.length} {customerSales.length === 1 ? 'sale bill' : 'sale bills'}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-muted block">Total Paid</span>
              <strong className="text-sm font-bold font-mono text-badge-green-text">
                {formatCurrency(customer.totalPaid, settings.currencySymbol)}
              </strong>
              <span className="text-[10px] text-muted block mt-0.5">
                {customerPayments.length} {customerPayments.length === 1 ? 'payment' : 'payments'}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-muted block">Outstanding Due</span>
              <strong
                className={`text-sm font-bold font-mono ${
                  customer.outstandingBalance > 0 ? 'text-badge-red-text' : 'text-badge-green-text'
                }`}
              >
                {formatCurrency(customer.outstandingBalance, settings.currencySymbol)}
              </strong>
              {customer.outstandingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => onOpenReceivePayment(customer.id)}
                  className="mt-1 px-2 py-0.5 rounded bg-primary hover:bg-primary-hover text-white text-[10px] font-bold active:scale-95 transition-all cursor-pointer"
                >
                  + Receive
                </button>
              )}
            </div>
          </div>

          {/* Return Summary Strip when customer has returns */}
          {customerReturns.length > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-badge-red-bg border border-badge-red-text/35 text-[11px] text-badge-red-text">
              <div className="flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-badge-red-text" />
                <span>
                  Return Bills on File: <strong className="font-mono text-badge-red-text">{customerReturns.length}</strong>
                </span>
              </div>
              <div className="font-mono text-[11px]">
                <span className="text-muted">Total Returned: </span>
                <strong className="text-badge-red-text">-{formatCurrency(totalReturnValue, settings.currencySymbol)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Tab Navigation (Bill History is primary and first) */}
        <div className="flex items-center gap-1 p-1 bg-inner rounded-xl border border-line-strong text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('bills')}
            className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
              activeTab === 'bills'
                ? 'bg-card text-primary shadow-card font-bold'
                : 'text-muted hover:text-ink'
            }`}
          >
            Bill History ({billHistoryItems.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-card text-primary shadow-card font-bold'
                : 'text-muted hover:text-ink'
            }`}
          >
            Timeline ({timelineEvents.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
              activeTab === 'payments'
                ? 'bg-card text-primary shadow-card font-bold'
                : 'text-muted hover:text-ink'
            }`}
          >
            Payments ({customerPayments.length})
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[260px]">
          {/* ========================================================== */}
          {/* TAB 1: BILL HISTORY (SALE BILLS & RETURN BILLS)           */}
          {/* ========================================================== */}
          {activeTab === 'bills' && (
            <div className="space-y-2.5">
              {/* Filter Pills for Bill History */}
              <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                  <Receipt className="w-3.5 h-3.5 text-muted" />
                  <span>Bills &amp; Documents:</span>
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setBillFilter('all')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                      billFilter === 'all'
                        ? 'bg-card text-ink border border-line-strong shadow-card font-bold'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    All ({billHistoryItems.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setBillFilter('sales')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                      billFilter === 'sales'
                        ? 'bg-badge-green-bg text-badge-green-text border border-badge-green-text/35 font-bold'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Sale Bills ({customerSales.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setBillFilter('returns')}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                      billFilter === 'returns'
                        ? 'bg-badge-red-bg text-badge-red-text border border-badge-red-text/35 font-bold'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Return Bills ({customerReturns.length})
                  </button>
                </div>
              </div>

              {/* Bill Items List */}
              {filteredBillHistory.length === 0 ? (
                <div className="text-center py-10 bg-inner rounded-2xl border border-line-strong p-6 space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-card border border-line-strong text-muted flex items-center justify-center mx-auto">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <h4 className="text-xs font-bold text-ink">
                    {billFilter === 'sales'
                      ? 'No Sale Bills Found'
                      : billFilter === 'returns'
                      ? 'No Return Bills Found'
                      : 'No Bills or Returns Recorded'}
                  </h4>
                  <p className="text-[11px] text-muted max-w-xs mx-auto">
                    {billFilter === 'returns'
                      ? 'No products have been returned by this customer yet.'
                      : 'No purchase bills or return invoices have been logged for this customer account.'}
                  </p>
                </div>
              ) : (
                filteredBillHistory.map((item) => {
                  if (item.type === 'SALE') {
                    const sale = item.sale;
                    const isExpanded = expandedSaleId === sale.id;
                    const d = new Date(sale.createdAt);
                    const formattedDate = d.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    });
                    const formattedTime = d.toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 bg-card border border-line rounded-2xl text-xs space-y-2 hover:border-line/40 transition-colors shadow-card"
                      >
                        {/* Top Header Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-badge-green-bg border border-badge-green-text/35 text-badge-green-text font-mono text-[10px] font-bold">
                                SALE BILL
                              </span>
                              <span className="font-bold text-ink font-mono text-xs">
                                #{sale.billNumber}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted mt-1 flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-muted" />
                              <span className="font-mono">{formattedDate} · {formattedTime}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-[10px] text-muted block">Original Bill Amount:</span>
                            <div className="font-bold font-mono text-ink text-sm">
                              {formatCurrency(sale.totalBill, settings.currencySymbol)}
                            </div>
                          </div>
                        </div>

                        {/* Financial Details Row */}
                        <div className="grid grid-cols-3 gap-2 p-2 rounded-xl bg-inner border border-line-strong text-[11px]">
                          <div>
                            <span className="text-muted text-[10px] block">Paid:</span>
                            <span className="font-mono text-badge-green-text font-semibold">
                              {formatCurrency(sale.amountPaid, settings.currencySymbol)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted text-[10px] block">Balance Due:</span>
                            <span className={`font-mono font-semibold ${sale.balanceDue > 0 ? 'text-badge-red-text' : 'text-ink'}`}>
                              {formatCurrency(sale.balanceDue, settings.currencySymbol)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-muted text-[10px] block">Payment Mode:</span>
                            <span className="text-ink font-medium">
                              {sale.paymentMethod}
                            </span>
                          </div>
                        </div>

                        {/* Linked Returns Callout if this bill had returns */}
                        {sale.returnedAmount && sale.returnedAmount > 0 && (
                          <div className="p-2 rounded-xl bg-badge-red-bg border border-badge-red-text/25 text-[11px] space-y-1">
                            <div className="flex items-center justify-between text-badge-red-text font-semibold">
                              <span className="flex items-center gap-1">
                                <RotateCcw className="w-3 h-3 text-badge-red-text" />
                                <span>Returns Processed Against This Bill:</span>
                              </span>
                              <span className="font-mono text-badge-red-text">
                                -{formatCurrency(sale.returnedAmount, settings.currencySymbol)}
                              </span>
                            </div>

                            {item.linkedReturns.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <span className="text-[10px] text-muted">Linked Return Bill(s):</span>
                                {item.linkedReturns.map((lr) => (
                                  <button
                                    key={lr.id}
                                    type="button"
                                    onClick={() => onOpenReturnReceipt?.(lr)}
                                    className="px-1.5 py-0.5 rounded bg-card hover:bg-badge-red-bg text-badge-red-text border border-badge-red-text/35 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <span>#{lr.returnBillNumber || lr.id}</span>
                                    <ExternalLink className="w-2.5 h-2.5 text-badge-red-text" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Products Preview & Expand */}
                        <div className="pt-1 border-t border-line-strong flex items-center justify-between text-[11px]">
                          <span className="text-muted">
                            {sale.items.length} {sale.items.length === 1 ? 'item sold' : 'items sold'}
                          </span>

                          <button
                            type="button"
                            onClick={() => toggleExpandSale(sale.id)}
                            className="text-muted hover:text-ink flex items-center gap-1 text-[11px] cursor-pointer"
                          >
                            <span>{isExpanded ? 'Hide items' : 'View items'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>

                        {/* Expandable Items Breakdown */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-line-strong space-y-1 bg-inner p-2.5 rounded-xl text-[11px]">
                            {sale.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-ink py-0.5 border-b border-line-strong last:border-b-0">
                                <div>
                                  <span className="font-medium text-ink">{it.productName}</span>
                                  <span className="text-muted text-[10px] block">
                                    {it.quantity} {it.unit} @ {formatCurrency(it.sellingPrice, settings.currencySymbol)}
                                    {it.returnedQuantity && it.returnedQuantity > 0 ? (
                                      <span className="text-badge-red-text font-semibold ml-1">
                                        ({it.returnedQuantity} {it.unit} returned)
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                                <div className="font-mono text-ink font-semibold self-center">
                                  {formatCurrency(it.subtotal, settings.currencySymbol)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Action Buttons: View/Print and Share */}
                        <div className="pt-2 border-t border-line-strong flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenSaleReceipt(sale)}
                            className="px-3 py-1.5 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Share2 className="w-3.5 h-3.5 text-primary" />
                            <span>Share Bill</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenSaleReceipt(sale)}
                            className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>View &amp; Print Bill</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // RETURN BILL ENTRY
                  const ret = item.saleReturn;
                  const isExpanded = expandedReturnId === ret.id;
                  const d = new Date(ret.createdAt);
                  const formattedDate = d.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });
                  const formattedTime = d.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 bg-card border border-line rounded-2xl text-xs space-y-2 hover:border-badge-red-text/35 transition-colors shadow-card"
                    >
                      {/* Top Header Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-badge-red-bg border border-badge-red-text/35 text-badge-red-text font-mono text-[10px] font-bold flex items-center gap-1">
                              <RotateCcw className="w-3 h-3 text-badge-red-text" />
                              <span>RETURN BILL</span>
                            </span>
                            <span className="font-bold text-ink font-mono text-xs">
                              #{ret.returnBillNumber || ret.id}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted mt-1 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-muted" />
                            <span className="font-mono">{formattedDate} · {formattedTime}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-muted block">Total Return Value:</span>
                          <div className="font-bold font-mono text-badge-red-text text-sm">
                            -{formatCurrency(ret.totalReturnValue, settings.currencySymbol)}
                          </div>
                        </div>
                      </div>

                      {/* Linked Original Sale Bill Row */}
                      <div className="flex items-center justify-between p-2 rounded-xl bg-inner border border-line-strong text-[11px]">
                        <span className="text-muted flex items-center gap-1">
                          <span>Original Sale Bill:</span>
                          <strong className="text-ink font-mono">#{ret.billNumber}</strong>
                        </span>

                        {item.originalSale && (
                          <button
                            type="button"
                            onClick={() => onOpenSaleReceipt(item.originalSale!)}
                            className="px-2 py-0.5 rounded bg-card hover:bg-inner text-primary border border-line-strong text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span>Open Sale Bill</span>
                            <ExternalLink className="w-2.5 h-2.5 text-primary" />
                          </button>
                        )}
                      </div>

                      {/* Settlement Method Breakdown */}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2 rounded-xl bg-inner border border-line-strong">
                          <span className="text-muted text-[10px] block">Settlement Method:</span>
                          <span className="font-bold text-ink">
                            {ret.settlementType === 'DUE_ADJUSTMENT'
                              ? 'Customer Due Adjustment'
                              : ret.settlementType === 'REFUND'
                              ? 'Cash / UPI Refund Paid'
                              : 'Store Credit'}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-inner border border-line-strong">
                          <span className="text-muted text-[10px] block">Settlement Amount:</span>
                          {ret.dueAdjustment > 0 && (
                            <span className="font-mono font-bold text-badge-green-text">
                              Due Adj: -{formatCurrency(ret.dueAdjustment, settings.currencySymbol)}
                            </span>
                          )}
                          {ret.refundAmount > 0 && (
                            <span className="font-mono font-bold text-badge-red-text">
                              Refund: {formatCurrency(ret.refundAmount, settings.currencySymbol)}
                            </span>
                          )}
                          {ret.creditAmount > 0 && (
                            <span className="font-mono font-bold text-badge-blue-text">
                              Credit: {formatCurrency(ret.creditAmount, settings.currencySymbol)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Notes / Reason if available */}
                      {ret.notes && (
                        <div className="text-[11px] text-muted italic px-1">
                          <span className="text-ink font-normal not-italic">Notes: </span>
                          {ret.notes}
                        </div>
                      )}

                      {/* Products Preview & Expand */}
                      <div className="pt-1 border-t border-line-strong flex items-center justify-between text-[11px]">
                        <span className="text-badge-green-text font-medium flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 text-badge-green-text" />
                          <span>{ret.items.length} {ret.items.length === 1 ? 'item restocked' : 'items restocked'}</span>
                        </span>

                        <button
                          type="button"
                          onClick={() => toggleExpandReturn(ret.id)}
                          className="text-muted hover:text-ink flex items-center gap-1 text-[11px] cursor-pointer"
                        >
                          <span>{isExpanded ? 'Hide items' : 'View items'}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </div>

                      {/* Expandable Returned Items Breakdown */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-line-strong space-y-1 bg-inner p-2.5 rounded-xl text-[11px]">
                          {ret.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-ink py-0.5 border-b border-line-strong last:border-b-0">
                              <div>
                                <span className="text-ink font-medium">{it.productName}</span>
                                <span className="text-muted text-[10px] block">
                                  {it.returnedQuantity} {it.unit} @ {formatCurrency(it.sellingPrice, settings.currencySymbol)}
                                </span>
                              </div>
                              <div className="font-mono text-badge-red-text font-bold self-center">
                                -{formatCurrency(it.returnValue, settings.currencySymbol)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons: View/Print and Share Return Bill */}
                      <div className="pt-2 border-t border-line-strong flex items-center justify-end gap-2">
                        {onOpenReturnReceipt && (
                          <button
                            type="button"
                            onClick={() => onOpenReturnReceipt(ret)}
                            className="px-3 py-1.5 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Share2 className="w-3.5 h-3.5 text-primary" />
                            <span>Share Bill</span>
                          </button>
                        )}

                        {onOpenReturnReceipt && (
                          <button
                            type="button"
                            onClick={() => onOpenReturnReceipt(ret)}
                            className="px-3.5 py-1.5 rounded-xl bg-badge-red-text hover:bg-badge-red-text/90 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>View &amp; Print Return Bill</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* TAB 2: CHRONOLOGICAL TRANSACTION TIMELINE                */}
          {/* ========================================================== */}
          {activeTab === 'timeline' && (
            <div className="space-y-2">
              {timelineEvents.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted">
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
                        className="p-3 bg-card border border-line rounded-2xl text-xs space-y-1.5 shadow-card"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-badge-blue-bg border border-badge-blue-text/35 text-badge-blue-text font-mono text-[10px] font-bold">
                              BILL #{sale.billNumber}
                            </span>
                            <span className="text-[11px] text-muted font-mono">
                              {new Date(sale.createdAt).toLocaleDateString()} {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="text-right">
                            <div className="font-bold font-mono text-ink text-xs">
                              {formatCurrency(sale.totalBill, settings.currencySymbol)}
                            </div>
                            <div className="text-[10px] text-muted">
                              Paid: <span className="text-badge-green-text font-mono">{formatCurrency(sale.amountPaid, settings.currencySymbol)}</span> · Due:{' '}
                              <span className="text-badge-red-text font-mono">{formatCurrency(sale.balanceDue, settings.currencySymbol)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Items Preview */}
                        <div className="pt-1 border-t border-line-strong flex items-center justify-between text-[11px]">
                          <span className="text-muted">
                            {sale.items.length} product(s) purchased
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExpandSale(sale.id)}
                              className="text-muted hover:text-ink flex items-center gap-1 text-[10px] cursor-pointer"
                            >
                              <span>{isExpanded ? 'Hide items' : 'View items'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenSaleReceipt(sale)}
                              className="text-primary hover:underline font-semibold text-[10px] cursor-pointer"
                            >
                              Print Memo
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-line-strong space-y-1 bg-inner p-2 rounded-xl">
                            {sale.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-[11px] text-ink">
                                <span>
                                  {it.productName} ({it.quantity} {it.unit} @ {formatCurrency(it.sellingPrice, settings.currencySymbol)})
                                </span>
                                <span className="font-mono text-ink">
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
                        className="p-3 bg-card border border-line rounded-2xl text-xs flex items-center justify-between shadow-card"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-badge-green-bg text-badge-green-text flex items-center justify-center">
                            <Wallet className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-semibold text-ink">
                              Payment Received
                            </div>
                            <div className="text-[10px] text-muted mt-0.5">
                              {pay.paymentDate} · Method: {pay.paymentMethod} {pay.notes ? `· ${pay.notes}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-bold font-mono text-badge-green-text text-sm">
                            +{formatCurrency(pay.amount, settings.currencySymbol)}
                          </div>
                          <div className="text-[10px] text-muted">Credit Cleared</div>
                        </div>
                      </div>
                    );
                  } else if (item.type === 'RETURN' && item.saleReturn) {
                    const ret = item.saleReturn;
                    return (
                      <div
                        key={item.id}
                        className="p-3.5 bg-card border border-line rounded-2xl text-xs space-y-2 shadow-card"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-badge-red-bg text-badge-red-text flex items-center justify-center font-bold">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <div className="font-bold text-ink flex items-center gap-1.5 flex-wrap">
                                <span>Product Return / Adjustment</span>
                                <span className="px-1.5 py-0.5 rounded bg-badge-red-bg border border-badge-red-text/35 text-badge-red-text font-mono text-[10px] font-bold">
                                  #{ret.returnBillNumber || ret.id}
                                </span>
                                <span className="font-mono text-[10px] text-muted font-normal">
                                  (Bill #{ret.billNumber})
                                </span>
                              </div>
                              <div className="text-[10px] text-muted">
                                {new Date(ret.createdAt).toLocaleDateString()} {new Date(ret.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-mono font-bold text-badge-red-text text-sm">
                              -{formatCurrency(ret.totalReturnValue, settings.currencySymbol)}
                            </div>
                            <div className="text-[10px] text-badge-green-text font-semibold">
                              Due Adj: -{formatCurrency(ret.dueAdjustment, settings.currencySymbol)}
                            </div>
                            {onOpenReturnReceipt && (
                              <button
                                type="button"
                                onClick={() => onOpenReturnReceipt(ret)}
                                className="text-badge-red-text hover:underline font-semibold text-[10px] mt-1 inline-block cursor-pointer"
                              >
                                Print Return Bill
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-line-strong text-[11px] space-y-1">
                          {ret.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-ink">
                              <span>
                                {it.productName} ({it.returnedQuantity} {it.unit} @ {formatCurrency(it.sellingPrice, settings.currencySymbol)})
                              </span>
                              <span className="font-mono text-ink">
                                {formatCurrency(it.returnValue, settings.currencySymbol)}
                              </span>
                            </div>
                          ))}
                          {ret.refundAmount > 0 && (
                            <div className="text-[10px] text-badge-yellow-text font-semibold pt-0.5">
                              💵 Cash/UPI Refunded to Customer: {formatCurrency(ret.refundAmount, settings.currencySymbol)}
                            </div>
                          )}
                          {ret.creditAmount > 0 && (
                            <div className="text-[10px] text-badge-blue-text font-semibold pt-0.5">
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

          {/* ========================================================== */}
          {/* TAB 3: PAYMENTS LIST                                      */}
          {/* ========================================================== */}
          {activeTab === 'payments' && (
            <div className="space-y-2">
              {customerPayments.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted">
                  No payment receipts logged yet.
                </div>
              ) : (
                customerPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 bg-card border border-line rounded-2xl text-xs flex items-center justify-between shadow-card"
                  >
                    <div>
                      <div className="font-bold text-badge-green-text font-mono text-xs">
                        +{formatCurrency(p.amount, settings.currencySymbol)}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        {p.paymentDate} · {p.paymentMethod} {p.notes ? `· ${p.notes}` : ''}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-muted">{p.id}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom Quick Action */}
        <div className="pt-3 border-t border-line-strong flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong text-xs font-semibold cursor-pointer transition-colors"
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
              className="py-2.5 px-5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
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
