import React, { useState } from 'react';
import {
  TrendingUp,
  Receipt,
  PackageCheck,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Plus,
  ShoppingCart,
  Users,
  Layers,
  ChevronRight,
  Calendar,
  Wallet,
  RotateCcw,
} from 'lucide-react';
import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  PaymentEntity,
  OwnerSettingsEntity,
} from '../types/database';
import {
  DateFilterType,
  DateRange,
  getDateRangeFromFilter,
  computePeriodMetrics,
  formatCurrency,
} from '../services/calculations';
import { LowStockNotificationCard } from './LowStockNotificationCard';

interface DashboardViewProps {
  products: ProductEntity[];
  customers: CustomerEntity[];
  sales: SaleEntity[];
  payments: PaymentEntity[];
  settings: OwnerSettingsEntity;
  currencySymbol: string;
  onNavigateToSale: () => void;
  onNavigateToAddStock: (preselectedProductId?: string, suggestedQty?: number) => void;
  onNavigateToAddProduct: () => void;
  onNavigateToCustomers: () => void;
  onOpenSaleReceipt: (sale: SaleEntity) => void;
  onOpenReceivePayment: () => void;
  onOpenReturn?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  customers,
  sales,
  payments,
  settings,
  currencySymbol,
  onNavigateToSale,
  onNavigateToAddStock,
  onNavigateToAddProduct,
  onNavigateToCustomers,
  onOpenSaleReceipt,
  onOpenReceivePayment,
  onOpenReturn,
}) => {
  const [dateFilter, setDateFilter] = useState<DateFilterType>('this_month');
  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });

  const activeRange = getDateRangeFromFilter(dateFilter, customRange);
  const metrics = computePeriodMetrics(sales, payments, customers, products, activeRange);

  // Also pre-calculate Today & This Week for quick comparison cards as specified in section 9
  const todayRange = getDateRangeFromFilter('today');
  const todayMetrics = computePeriodMetrics(sales, payments, customers, products, todayRange);

  const weekRange = getDateRangeFromFilter('this_week');
  const weekMetrics = computePeriodMetrics(sales, payments, customers, products, weekRange);

  // Low stock items
  const lowStockProducts = products.filter((p) => p.currentStock <= p.minStockLevel);

  // Recent 5 sales
  const recentSales = sales.slice(0, 5);

  // Recent 5 payments
  const recentPayments = payments.slice(0, 5);

  return (
    <div className="space-y-5 pb-20">
      {/* Date Filter Bar */}
      <div className="bg-card border border-line rounded-2xl p-3 shadow-card">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span>Time Period Filter</span>
          </div>
          <span className="text-[11px] text-muted font-mono">
            {activeRange.startDate === activeRange.endDate
              ? activeRange.startDate
              : `${activeRange.startDate} to ${activeRange.endDate}`}
          </span>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {(
            [
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
              { id: 'prev_month', label: 'Prev Month' },
              { id: 'custom', label: 'Custom' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDateFilter(item.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all cursor-pointer ${
                dateFilter === item.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-inner text-muted hover:bg-line'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-line text-xs">
            <div>
              <label className="text-[10px] text-muted block mb-1">From</label>
              <input
                type="date"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={customRange.startDate}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))}
                className="w-full bg-card border border-line-strong rounded-lg px-2.5 py-1.5 text-ink text-left"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">To</label>
              <input
                type="date"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={customRange.endDate}
                onChange={(e) => setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))}
                className="w-full bg-card border border-line-strong rounded-lg px-2.5 py-1.5 text-ink text-left"
              />
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Buttons (Thumb-Zone shortcuts) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={onNavigateToSale}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold text-xs active:scale-[0.98] shadow-sm transition-all cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-black/15 flex items-center justify-center">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div>New Sale</div>
            <div className="text-[10px] font-normal opacity-85">Instant Bill</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateToAddStock()}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-accent hover:bg-accent/90 text-accent-text font-semibold text-xs active:scale-[0.98] shadow-sm transition-all cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-black/10 text-accent-text flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div>Add Stock</div>
            <div className="text-[10px] text-accent-text/80 font-normal">Stock-In Arrival</div>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenReceivePayment}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-card hover:bg-inner text-ink font-semibold text-xs border border-line-strong active:scale-[0.98] transition-all cursor-pointer shadow-card"
        >
          <div className="w-8 h-8 rounded-lg bg-badge-yellow-bg text-badge-yellow-text flex items-center justify-center">
            <Wallet className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div>Receive Payment</div>
            <div className="text-[10px] text-muted font-normal">Clear Due Ledger</div>
          </div>
        </button>

        <button
          type="button"
          onClick={onNavigateToAddProduct}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-card hover:bg-inner text-ink font-semibold text-xs border border-line-strong active:scale-[0.98] transition-all cursor-pointer shadow-card"
        >
          <div className="w-8 h-8 rounded-lg bg-badge-blue-bg text-badge-blue-text flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div>Add Product</div>
            <div className="text-[10px] text-muted font-normal">New Catalogue Item</div>
          </div>
        </button>

        {onOpenReturn && (
          <button
            type="button"
            onClick={onOpenReturn}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-card hover:bg-inner text-ink font-semibold text-xs border border-line-strong active:scale-[0.98] transition-all cursor-pointer shadow-card"
          >
            <div className="w-8 h-8 rounded-lg bg-badge-red-bg text-badge-red-text flex items-center justify-center font-bold">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div>↩ Return</div>
              <div className="text-[10px] text-muted font-normal">Sale Adjustment</div>
            </div>
          </button>
        )}
      </div>

      {/* Main Metric Cards Grid (Section 9 requirements) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Sales */}
        <div className="bg-card border border-line rounded-2xl p-4 relative overflow-hidden shadow-card">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span>Total Gross Sales</span>
            <Receipt className="w-4 h-4 text-primary" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-ink">
            {formatCurrency(metrics.totalSales, currencySymbol)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted mt-2 pt-2 border-t border-line">
            <span>Bills: <strong className="text-ink">{metrics.numberOfBills}</strong></span>
            <span>Cost: <strong className="text-muted tabular-nums">{formatCurrency(metrics.totalCost, currencySymbol)}</strong></span>
          </div>
        </div>

        {/* Total Profit */}
        <div className="bg-card border border-line rounded-2xl p-4 relative overflow-hidden shadow-card">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span>Total Gross Profit</span>
            <TrendingUp className="w-4 h-4 text-badge-green-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-badge-green-text">
            {formatCurrency(metrics.grossProfit, currencySymbol)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted mt-2 pt-2 border-t border-line">
            <span>Margin: <strong className="text-badge-green-text">{metrics.profitMarginPercent.toFixed(1)}%</strong></span>
            <span>Items Sold: <strong className="text-ink">{metrics.totalProductsSoldCount}</strong></span>
          </div>
        </div>

        {/* Customer Outstanding Balance */}
        <div className="bg-card border border-line rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span>Outstanding Dues</span>
            <Users className="w-4 h-4 text-badge-red-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-badge-red-text">
            {formatCurrency(metrics.totalOutstandingBalance, currencySymbol)}
          </div>
          <div className="text-[11px] text-muted mt-2 pt-2 border-t border-line flex items-center justify-between">
            <span>Payments Rcvd:</span>
            <span className="text-badge-green-text font-medium tabular-nums">
              {formatCurrency(metrics.totalPaymentsReceived, currencySymbol)}
            </span>
          </div>
        </div>

        {/* Current Stock Value */}
        <div className="bg-card border border-line rounded-2xl p-4 shadow-card">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span>Current Stock Value</span>
            <PackageCheck className="w-4 h-4 text-badge-blue-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-badge-blue-text">
            {formatCurrency(metrics.currentStockValue, currencySymbol)}
          </div>
          <div className="text-[11px] text-muted mt-2 pt-2 border-t border-line flex items-center justify-between">
            <span>Retail Value:</span>
            <span className="text-muted tabular-nums">
              {formatCurrency(metrics.currentRetailStockValue, currencySymbol)}
            </span>
          </div>
        </div>
      </div>

      {/* Snapshot Comparison: Today vs This Week (Section 9 explicit requirement) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Today Snapshot */}
        <div className="bg-inner border border-line-strong rounded-2xl p-3.5 text-xs">
          <div className="text-[11px] font-semibold text-badge-green-text mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-badge-green-text"></span>
            TODAY AT A GLANCE
          </div>
          <div className="space-y-1.5 text-ink">
            <div className="flex justify-between">
              <span className="text-muted">Sales:</span>
              <span className="font-semibold tabular-nums text-ink">{formatCurrency(todayMetrics.totalSales, currencySymbol)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Profit:</span>
              <span className="font-semibold tabular-nums text-badge-green-text">{formatCurrency(todayMetrics.grossProfit, currencySymbol)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Sold:</span>
              <span className="font-medium text-ink">{todayMetrics.totalProductsSoldCount} units ({todayMetrics.numberOfBills} bills)</span>
            </div>
          </div>
        </div>

        {/* This Week Snapshot */}
        <div className="bg-inner border border-line-strong rounded-2xl p-3.5 text-xs">
          <div className="text-[11px] font-semibold text-badge-blue-text mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-badge-blue-text"></span>
            THIS WEEK
          </div>
          <div className="space-y-1.5 text-ink">
            <div className="flex justify-between">
              <span className="text-muted">Sales:</span>
              <span className="font-semibold tabular-nums text-ink">{formatCurrency(weekMetrics.totalSales, currencySymbol)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Profit:</span>
              <span className="font-semibold tabular-nums text-badge-green-text">{formatCurrency(weekMetrics.grossProfit, currencySymbol)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Sold:</span>
              <span className="font-medium text-ink">{weekMetrics.totalProductsSoldCount} units</span>
            </div>
          </div>
        </div>
      </div>

      {/* Low-Stock Alert Notification System (Subtle Color-Coded Indicators & Restock Actions) */}
      <LowStockNotificationCard
        products={products}
        settings={settings}
        onNavigateToAddStock={onNavigateToAddStock}
      />

      {/* Recent Sales Section */}
      <div className="bg-card border border-line rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-ink flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted" />
            <span>Recent Sales</span>
          </div>
          <button
            type="button"
            onClick={onNavigateToSale}
            className="text-[11px] text-primary hover:text-primary-hover font-medium cursor-pointer"
          >
            + New Sale
          </button>
        </div>

        {recentSales.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No sales recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {recentSales.map((sale) => (
              <div
                key={sale.id}
                onClick={() => onOpenSaleReceipt(sale)}
                className="flex items-center justify-between p-2.5 rounded-xl bg-inner hover:bg-line border border-line-strong cursor-pointer text-xs transition-colors"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink truncate">{sale.customerName}</span>
                    <span className="text-[10px] text-muted font-mono">#{sale.billNumber}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {sale.items.length} items · Profit: <span className="text-badge-green-text tabular-nums font-semibold">{formatCurrency(sale.grossProfit, currencySymbol)}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-bold tabular-nums text-ink">
                    {formatCurrency(sale.totalBill, currencySymbol)}
                  </div>
                  {sale.balanceDue > 0 ? (
                    <span className="text-[10px] text-badge-red-text font-semibold">
                      Due: {formatCurrency(sale.balanceDue, currencySymbol)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-badge-green-text font-semibold">
                      Paid Full
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Payments Collected Section */}
      <div className="bg-card border border-line rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-ink flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-muted" />
            <span>Recent Payments Received</span>
          </div>
          <button
            type="button"
            onClick={onOpenReceivePayment}
            className="text-[11px] text-primary hover:text-primary-hover font-medium cursor-pointer"
          >
            + Receive Payment
          </button>
        </div>

        {recentPayments.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {recentPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-inner border border-line-strong text-xs"
              >
                <div>
                  <div className="font-medium text-ink">{p.customerName}</div>
                  <div className="text-[10px] text-muted mt-0.5">
                    {p.paymentDate} · {p.paymentMethod} {p.notes ? `· ${p.notes}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold tabular-nums text-badge-green-text">
                    +{formatCurrency(p.amount, currencySymbol)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
