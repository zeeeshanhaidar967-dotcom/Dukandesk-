import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  TrendingUp,
  Receipt,
  Users,
  Package,
  Layers,
  FileSpreadsheet,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  PaymentEntity,
  StockMovementEntity,
  OwnerSettingsEntity,
} from '../types/database';
import {
  DateFilterType,
  DateRange,
  getDateRangeFromFilter,
  computePeriodMetrics,
  computeMonthlyBusinessSummary,
  computeProductPerformance,
  formatCurrency,
  exportToCSV,
} from '../services/calculations';

interface ReportsViewProps {
  products: ProductEntity[];
  customers: CustomerEntity[];
  sales: SaleEntity[];
  payments: PaymentEntity[];
  stockMovements: StockMovementEntity[];
  settings: OwnerSettingsEntity;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  products,
  customers,
  sales,
  payments,
  stockMovements,
  settings,
}) => {
  const [reportType, setReportType] = useState<
    'monthly_summary' | 'sales_profit' | 'product_wise' | 'customer_wise' | 'outstanding' | 'stock_audit'
  >('monthly_summary');

  // Month selector for Section 14 Monthly Business Summary
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()); // 0 = Jan, 8 = Sep
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  // Date filter for period reports
  const [dateFilter, setDateFilter] = useState<DateFilterType>('this_month');
  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  });

  const activeRange = getDateRangeFromFilter(dateFilter, customRange);
  const periodMetrics = computePeriodMetrics(sales, payments, customers, products, activeRange);

  // Compute Monthly Business Summary (Section 14 exact specifications)
  const monthlySummary = useMemo(() => {
    return computeMonthlyBusinessSummary(selectedMonth, selectedYear, sales, payments, customers);
  }, [selectedMonth, selectedYear, sales, payments, customers]);

  // Product performance report data
  const productPerformance = useMemo(() => {
    return computeProductPerformance(sales, products, activeRange);
  }, [sales, products, activeRange]);

  // Outstanding payments ranking
  const outstandingCustomers = useMemo(() => {
    return customers
      .filter((c) => c.outstandingBalance > 0)
      .sort((a, b) => b.outstandingBalance - a.outstandingBalance);
  }, [customers]);

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

  // Handle CSV exports
  const handleExportCSV = () => {
    const symbol = settings.currencySymbol;

    if (reportType === 'monthly_summary') {
      const rows: (string | number)[][] = [
        ['DUKANDESK - MONTHLY BUSINESS SUMMARY'],
        ['Month', `${monthlySummary.monthName} ${monthlySummary.year}`],
        ['Generated At', new Date().toISOString()],
        [],
        ['Metric', 'Value'],
        ['Total Gross Sales', monthlySummary.totalGrossSales],
        ['Total Purchase Cost', monthlySummary.totalPurchaseCost],
        ['Total Gross Profit', monthlySummary.grossProfit],
        ['Total Products Sold (Units)', monthlySummary.productsSold],
        ['Total Bills', monthlySummary.billsCount],
        ['Total Payments Received', monthlySummary.paymentsReceived],
        ['Total Outstanding Customer Balance', monthlySummary.outstandingBalance],
      ];
      exportToCSV(`Monthly_Business_Summary_${monthlySummary.monthName}_${monthlySummary.year}`, rows);
    } else if (reportType === 'product_wise') {
      const headers = ['Product Name', 'Category', 'Unit', 'Qty Sold', 'Revenue', 'Cost', 'Gross Profit', 'Margin %', 'Current Stock'];
      const data = productPerformance.map((p) => [
        p.productName,
        p.category,
        p.unit,
        p.quantitySold,
        p.totalRevenue,
        p.totalCost,
        p.grossProfit,
        p.marginPercent.toFixed(1) + '%',
        p.currentStock,
      ]);
      exportToCSV(`Product_Sales_Profit_Report_${activeRange.startDate}_${activeRange.endDate}`, [headers, ...data]);
    } else if (reportType === 'customer_wise') {
      const headers = ['Customer ID', 'Customer Name', 'Phone', 'Total Purchases', 'Total Paid', 'Outstanding Balance'];
      const data = customers.map((c) => [
        c.id,
        c.name,
        c.phone,
        c.totalPurchases,
        c.totalPaid,
        c.outstandingBalance,
      ]);
      exportToCSV(`Customer_Ledger_Report_${new Date().toISOString().slice(0, 10)}`, [headers, ...data]);
    } else if (reportType === 'outstanding') {
      const headers = ['Customer ID', 'Customer Name', 'Phone', 'Address', 'Outstanding Balance'];
      const data = outstandingCustomers.map((c) => [
        c.id,
        c.name,
        c.phone,
        c.address,
        c.outstandingBalance,
      ]);
      exportToCSV(`Outstanding_Credit_Report_${new Date().toISOString().slice(0, 10)}`, [headers, ...data]);
    } else if (reportType === 'stock_audit') {
      const headers = ['ID', 'Date', 'Product', 'Type', 'Qty', 'Prev Stock', 'New Stock', 'Reference', 'Notes'];
      const data = sortedStockMovements.map((sm) => [
        sm.id,
        sm.createdAt,
        sm.productName,
        sm.type,
        sm.quantity,
        sm.previousStock,
        sm.newStock,
        sm.reference,
        sm.notes || '',
      ]);
      exportToCSV(`Stock_Movements_Audit_${new Date().toISOString().slice(0, 10)}`, [headers, ...data]);
    } else {
      // Sales & Profit report
      const headers = ['Bill Number', 'Date', 'Customer', 'Items Count', 'Gross Sales', 'Purchase Cost', 'Gross Profit', 'Amount Paid', 'Balance Due'];
      const data = sales.map((s) => [
        s.billNumber,
        s.createdAt,
        s.customerName,
        s.items.length,
        s.totalBill,
        s.totalCost,
        s.grossProfit,
        s.amountPaid,
        s.balanceDue,
      ]);
      exportToCSV(`Sales_Profit_Report_${activeRange.startDate}_${activeRange.endDate}`, [headers, ...data]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Top Header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span>Automatic Financial Reports</span>
          </h2>
          <p className="text-xs text-muted">
            Calculated directly from local transaction records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-xl bg-inner hover:bg-inner text-ink text-xs font-semibold flex items-center gap-1.5 border border-line-strong active:scale-95 transition-all"
            title="Export as CSV"
          >
            <Download className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            title="Print or Save PDF"
          >
            <Printer className="w-4 h-4" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs no-print">
        {[
          { id: 'monthly_summary', label: 'Monthly Summary' },
          { id: 'sales_profit', label: 'Sales & Profit' },
          { id: 'product_wise', label: 'Product-Wise' },
          { id: 'customer_wise', label: 'Customer-Wise' },
          { id: 'outstanding', label: 'Outstanding Dues' },
          { id: 'stock_audit', label: 'Stock Movements' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setReportType(t.id as any)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-medium transition-all ${
              reportType === t.id
                ? 'bg-primary text-white font-bold shadow-card'
                : 'bg-card border border-line-strong text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. SECTION 14: MONTHLY BUSINESS SUMMARY                       */}
      {/* ------------------------------------------------------------- */}
      {reportType === 'monthly_summary' && (
        <div className="space-y-4 printable-area">
          {/* Month & Year Picker */}
          <div className="p-3 bg-card border border-line rounded-2xl flex items-center justify-between no-print text-xs shadow-card">
            <span className="font-semibold text-ink">Select Business Month:</span>
            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                style={{ direction: 'ltr', textAlign: 'left' }}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="bg-card border border-line-strong rounded-lg px-2.5 py-1.5 text-ink text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {[
                  'January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'
                ].map((m, idx) => (
                  <option key={idx} value={idx}>{m}</option>
                ))}
              </select>

              <select
                value={selectedYear}
                style={{ direction: 'ltr', textAlign: 'left' }}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="bg-card border border-line-strong rounded-lg px-2.5 py-1.5 text-ink text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 14 Card Format */}
          <div className="bg-card border border-line rounded-3xl p-6 shadow-card space-y-5">
            <div className="border-b border-line pb-4">
              <div className="text-[11px] font-mono text-primary font-bold uppercase tracking-wider">
                Section 14 Business Summary
              </div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight text-ink mt-1">
                {monthlySummary.monthName} {monthlySummary.year}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Computed from actual verified transaction logs in Room SQLite
              </p>
            </div>

            {/* Exact 7 Metrics Specified in User Brief Section 14 */}
            <div className="space-y-3 divide-y divide-line text-xs">
              {/* Metric 1 */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-muted font-medium">Total Gross Sales:</span>
                <span className="text-lg font-bold font-mono text-ink">
                  {formatCurrency(monthlySummary.totalGrossSales, settings.currencySymbol)}
                </span>
              </div>

              {/* Metric 2 */}
              <div className="flex items-center justify-between pt-3">
                <span className="text-muted font-medium">Total Purchase Cost:</span>
                <span className="text-base font-bold font-mono text-muted">
                  {formatCurrency(monthlySummary.totalPurchaseCost, settings.currencySymbol)}
                </span>
              </div>

              {/* Metric 3 */}
              <div className="flex items-center justify-between pt-3 bg-badge-green-bg p-3 rounded-xl border border-badge-green-text/35">
                <span className="text-badge-green-text font-bold text-sm">Gross Profit:</span>
                <span className="text-xl font-black font-mono text-badge-green-text">
                  {formatCurrency(monthlySummary.grossProfit, settings.currencySymbol)}
                </span>
              </div>

              {/* Metric 4 */}
              <div className="flex items-center justify-between pt-3">
                <span className="text-muted font-medium">Products Sold:</span>
                <span className="text-base font-bold font-mono text-ink">
                  {monthlySummary.productsSold.toLocaleString('en-IN')} units
                </span>
              </div>

              {/* Metric 5 */}
              <div className="flex items-center justify-between pt-3">
                <span className="text-muted font-medium">Bills (Transactions):</span>
                <span className="text-base font-bold font-mono text-ink">
                  {monthlySummary.billsCount.toLocaleString('en-IN')}
                </span>
              </div>

              {/* Metric 6 */}
              <div className="flex items-center justify-between pt-3">
                <span className="text-muted font-medium">Payments Received:</span>
                <span className="text-base font-bold font-mono text-badge-green-text">
                  {formatCurrency(monthlySummary.paymentsReceived, settings.currencySymbol)}
                </span>
              </div>

              {/* Metric 7 */}
              <div className="flex items-center justify-between pt-3 bg-badge-red-bg p-3 rounded-xl border border-badge-red-text/35">
                <span className="text-badge-red-text font-bold">Outstanding Customer Balance:</span>
                <span className="text-lg font-bold font-mono text-badge-red-text">
                  {formatCurrency(monthlySummary.outstandingBalance, settings.currencySymbol)}
                </span>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-muted text-center font-mono border-t border-line">
              {settings.shopName} · Owner: {settings.ownerName} · Generated locally
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. SALES & PROFIT REPORTS (Daily, Weekly, Monthly, Custom)     */}
      {/* ------------------------------------------------------------- */}
      {reportType === 'sales_profit' && (
        <div className="space-y-3">
          {/* Period Filter */}
          <div className="bg-card border border-line rounded-2xl p-3 no-print space-y-2 shadow-card">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
              {(
                [
                  { id: 'today', label: 'Daily (Today)' },
                  { id: 'this_week', label: 'Weekly' },
                  { id: 'this_month', label: 'Monthly' },
                  { id: 'prev_month', label: 'Prev Month' },
                  { id: 'custom', label: 'Custom Range' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDateFilter(item.id)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all ${
                    dateFilter === item.id
                      ? 'bg-primary text-white font-bold shadow-sm'
                      : 'bg-inner text-muted hover:bg-inner hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {dateFilter === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line text-xs">
                <div>
                  <label className="text-[10px] text-muted block mb-1">Start Date</label>
                  <input
                    type="date"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    value={customRange.startDate}
                    onChange={(e) => setCustomRange((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="w-full bg-card border border-line-strong rounded-lg px-2.5 py-1.5 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted block mb-1">End Date</label>
                  <input
                    type="date"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    value={customRange.endDate}
                    onChange={(e) => setCustomRange((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="w-full bg-card border border-line-strong rounded-lg px-2.5 py-1.5 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Aggregate KPI Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-card border border-line rounded-2xl p-3 text-xs shadow-card">
              <span className="text-muted block text-[10px]">Gross Sales</span>
              <strong className="text-sm sm:text-base font-bold font-mono text-ink">
                {formatCurrency(periodMetrics.totalSales, settings.currencySymbol)}
              </strong>
              <span className="text-[10px] text-muted block mt-0.5">
                {periodMetrics.numberOfBills} bills
              </span>
            </div>

            <div className="bg-card border border-line rounded-2xl p-3 text-xs shadow-card">
              <span className="text-muted block text-[10px]">Gross Profit</span>
              <strong className="text-sm sm:text-base font-bold font-mono text-badge-green-text">
                {formatCurrency(periodMetrics.grossProfit, settings.currencySymbol)}
              </strong>
              <span className="text-[10px] text-badge-green-text/80 block mt-0.5 font-mono">
                {periodMetrics.profitMarginPercent.toFixed(1)}% margin
              </span>
            </div>

            <div className="bg-card border border-line rounded-2xl p-3 text-xs shadow-card">
              <span className="text-muted block text-[10px]">Items Sold</span>
              <strong className="text-sm sm:text-base font-bold font-mono text-badge-blue-text">
                {periodMetrics.totalProductsSoldCount}
              </strong>
              <span className="text-[10px] text-muted block mt-0.5">Units</span>
            </div>
          </div>

          {/* Sales Transaction Log Table */}
          <div className="bg-card border border-line rounded-2xl overflow-hidden text-xs shadow-card">
            <div className="p-3 border-b border-line font-bold text-ink flex items-center justify-between">
              <span>Period Sales Records</span>
              <span className="text-[11px] text-muted font-mono">
                {activeRange.startDate} to {activeRange.endDate}
              </span>
            </div>

            <div className="divide-y divide-line max-h-[400px] overflow-y-auto">
              {sales.length === 0 ? (
                <div className="p-6 text-center text-muted">No sales recorded.</div>
              ) : (
                sales.map((sale) => (
                  <div key={sale.id} className="p-3 flex items-center justify-between hover:bg-inner/50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink">{sale.customerName}</span>
                        <span className="font-mono text-[10px] text-muted">#{sale.billNumber}</span>
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        {new Date(sale.createdAt).toLocaleDateString()} · {sale.items.length} items · Mode: {sale.paymentMethod}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold font-mono text-ink text-xs">
                        {formatCurrency(sale.totalBill, settings.currencySymbol)}
                      </div>
                      <div className="text-[10px] font-mono text-badge-green-text font-semibold">
                        Profit: +{formatCurrency(sale.grossProfit, settings.currencySymbol)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. PRODUCT-WISE PERFORMANCE REPORT                            */}
      {/* ------------------------------------------------------------- */}
      {reportType === 'product_wise' && (
        <div className="space-y-3">
          <div className="p-3 bg-card border border-line rounded-2xl flex items-center justify-between text-xs shadow-card">
            <div>
              <h3 className="font-bold text-ink">Product-Wise Sales & Profitability</h3>
              <p className="text-[11px] text-muted">Top-grossing catalogue items</p>
            </div>
            <span className="text-[11px] font-mono text-muted">{productPerformance.length} items</span>
          </div>

          <div className="space-y-2">
            {productPerformance.map((p) => (
              <div
                key={p.productId}
                className="p-3 bg-card border border-line rounded-2xl text-xs space-y-2 shadow-card"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 pr-2">
                    <h4 className="font-bold text-ink text-xs truncate">{p.productName}</h4>
                    <span className="text-[11px] text-muted">
                      {p.category} · In Stock: <strong className="text-ink font-mono">{p.currentStock} {p.unit}</strong>
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold font-mono text-badge-green-text text-xs">
                      Profit: +{formatCurrency(p.grossProfit, settings.currencySymbol)}
                    </div>
                    <span className="text-[10px] font-mono text-badge-green-text/80">
                      {p.marginPercent.toFixed(1)}% margin
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-inner border border-line-strong text-[11px]">
                  <div>
                    <span className="text-muted text-[10px] block">Sold:</span>
                    <strong className="text-ink font-mono">{p.quantitySold} {p.unit}</strong>
                  </div>
                  <div>
                    <span className="text-muted text-[10px] block">Total Revenue:</span>
                    <span className="text-ink font-mono font-semibold">
                      {formatCurrency(p.totalRevenue, settings.currencySymbol)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted text-[10px] block">Purchase Cost:</span>
                    <span className="text-muted font-mono">
                      {formatCurrency(p.totalCost, settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. CUSTOMER-WISE & OUTSTANDING REPORT                         */}
      {/* ------------------------------------------------------------- */}
      {(reportType === 'customer_wise' || reportType === 'outstanding') && (
        <div className="space-y-3">
          <div className="p-3 bg-card border border-line rounded-2xl flex items-center justify-between text-xs shadow-card">
            <div>
              <h3 className="font-bold text-ink">
                {reportType === 'outstanding' ? 'Outstanding Payment Ledger' : 'Customer Account Ledgers'}
              </h3>
              <p className="text-[11px] text-muted">
                {reportType === 'outstanding' ? 'Sorted by highest pending balance' : 'All registered customer profiles'}
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-badge-red-text">
              Due: {formatCurrency(
                customers.reduce((s, c) => s + c.outstandingBalance, 0),
                settings.currencySymbol
              )}
            </span>
          </div>

          <div className="space-y-2">
            {(reportType === 'outstanding' ? outstandingCustomers : customers).map((c) => (
              <div
                key={c.id}
                className="p-3 bg-card border border-line rounded-2xl text-xs space-y-1.5 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-ink">{c.name}</strong>
                    {c.phone && <span className="text-[11px] text-muted font-mono ml-2">({c.phone})</span>}
                  </div>
                  <div className="font-bold font-mono text-sm text-badge-red-text">
                    {formatCurrency(c.outstandingBalance, settings.currencySymbol)}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted pt-1 border-t border-line">
                  <span>Purchases: <strong className="text-ink font-mono">{formatCurrency(c.totalPurchases, settings.currencySymbol)}</strong></span>
                  <span>Paid: <strong className="text-badge-green-text font-mono">{formatCurrency(c.totalPaid, settings.currencySymbol)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. STOCK MOVEMENTS AUDIT REPORT                               */}
      {/* ------------------------------------------------------------- */}
      {reportType === 'stock_audit' && (
        <div className="space-y-3">
          <div className="p-3 bg-card border border-line rounded-2xl flex items-center justify-between text-xs shadow-card">
            <div>
              <h3 className="font-bold text-ink">Stock In & Stock Out Movement Audit</h3>
              <p className="text-[11px] text-muted">Latest stock movements on top, earlier records below</p>
            </div>
            <span className="text-xs font-mono text-muted">{sortedStockMovements.length} logs</span>
          </div>

          <div className="space-y-2">
            {sortedStockMovements.map((sm) => (
              <div
                key={sm.id}
                className="p-2.5 rounded-xl bg-card border border-line text-xs flex items-center justify-between shadow-card"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        sm.type === 'STOCK_IN'
                          ? 'bg-badge-green-bg text-badge-green-text border border-badge-green-text/35'
                          : 'bg-badge-red-bg text-badge-red-text border border-badge-red-text/35'
                      }`}
                    >
                      {sm.type}
                    </span>
                    <strong className="text-ink">{sm.productName}</strong>
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    {new Date(sm.createdAt).toLocaleDateString()} · Ref: {sm.reference}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`font-mono font-bold text-xs ${
                      sm.quantity > 0 ? 'text-badge-green-text' : 'text-badge-red-text'
                    }`}
                  >
                    {sm.quantity > 0 ? `+${sm.quantity}` : sm.quantity}
                  </div>
                  <div className="text-[10px] text-muted font-mono">
                    {sm.previousStock} ➔ {sm.newStock}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
