/**
 * Business Calculations & Reporting Engine for DukanDesk
 * Automated math, date-range filtering, profit formulas, and report generation.
 */

import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  PaymentEntity,
  StockMovementEntity,
} from '../types/database';

export type DateFilterType =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'prev_month'
  | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return `${symbol}0`;
  }
  // Format with standard Indian numbering system if symbol is ₹
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}

export function getDateRangeFromFilter(filter: DateFilterType, customRange?: DateRange): DateRange {
  const now = new Date();
  const formatYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (filter === 'custom' && customRange) {
    return customRange;
  }

  if (filter === 'today') {
    const todayStr = formatYMD(now);
    return { startDate: todayStr, endDate: todayStr };
  }

  if (filter === 'yesterday') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yStr = formatYMD(y);
    return { startDate: yStr, endDate: yStr };
  }

  if (filter === 'this_week') {
    const day = now.getDay(); // 0 is Sunday
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diff);
    return { startDate: formatYMD(startOfWeek), endDate: formatYMD(now) };
  }

  if (filter === 'this_month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: formatYMD(startOfMonth), endDate: formatYMD(now) };
  }

  if (filter === 'prev_month') {
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: formatYMD(startOfPrevMonth), endDate: formatYMD(endOfPrevMonth) };
  }

  const today = formatYMD(now);
  return { startDate: today, endDate: today };
}

export interface PeriodSummaryMetrics {
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  profitMarginPercent: number;
  totalProductsSoldCount: number;
  numberOfBills: number;
  totalPaymentsReceived: number;
  totalOutstandingBalance: number;
  currentStockValue: number;
  currentRetailStockValue: number;
  lowStockItemsCount: number;
}

export function computePeriodMetrics(
  sales: SaleEntity[],
  payments: PaymentEntity[],
  customers: CustomerEntity[],
  products: ProductEntity[],
  dateRange: DateRange
): PeriodSummaryMetrics {
  const startDateStr = dateRange.startDate;
  const endDateStr = dateRange.endDate;

  // Filter sales within the period (timezone immune date comparison)
  const periodSales = sales.filter((s) => {
    const saleDateStr = s.createdAt.slice(0, 10);
    return saleDateStr >= startDateStr && saleDateStr <= endDateStr;
  });

  // Filter payments within the period (timezone immune date comparison)
  const periodPayments = payments.filter((p) => {
    const paymentDateStr = p.createdAt.slice(0, 10);
    return paymentDateStr >= startDateStr && paymentDateStr <= endDateStr;
  });

  let totalSales = 0;
  let totalCost = 0;
  let totalProductsSoldCount = 0;

  for (const s of periodSales) {
    totalSales += s.totalBill;
    totalCost += s.totalCost;
    for (const item of s.items) {
      totalProductsSoldCount += item.quantity;
    }
  }

  const grossProfit = totalSales - totalCost;
  const profitMarginPercent = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
  const numberOfBills = periodSales.length;

  let totalPaymentsReceived = 0;
  for (const p of periodPayments) {
    totalPaymentsReceived += p.amount;
  }

  // Total customer outstanding balance (live total balance across all active customer accounts)
  let totalOutstandingBalance = 0;
  for (const c of customers) {
    totalOutstandingBalance += c.outstandingBalance;
  }

  // Stock values
  let currentStockValue = 0;
  let currentRetailStockValue = 0;
  let lowStockItemsCount = 0;

  for (const prod of products) {
    currentStockValue += prod.currentStock * prod.purchasePrice;
    currentRetailStockValue += prod.currentStock * prod.sellingPrice;
    if (prod.currentStock <= prod.minStockLevel) {
      lowStockItemsCount++;
    }
  }

  return {
    totalSales,
    totalCost,
    grossProfit,
    profitMarginPercent,
    totalProductsSoldCount,
    numberOfBills,
    totalPaymentsReceived,
    totalOutstandingBalance,
    currentStockValue,
    currentRetailStockValue,
    lowStockItemsCount,
  };
}

export interface MonthlyBusinessSummaryData {
  monthName: string;
  year: number;
  totalGrossSales: number;
  totalPurchaseCost: number;
  grossProfit: number;
  productsSold: number;
  billsCount: number;
  paymentsReceived: number;
  outstandingBalance: number;
}

export function computeMonthlyBusinessSummary(
  monthIndex: number, // 0-11
  year: number,
  sales: SaleEntity[],
  payments: PaymentEntity[],
  customers: CustomerEntity[]
): MonthlyBusinessSummaryData {
  const start = new Date(year, monthIndex, 1, 0, 0, 0).getTime();
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime();

  const monthSales = sales.filter((s) => {
    const t = new Date(s.createdAt).getTime();
    return t >= start && t <= end;
  });

  const monthPayments = payments.filter((p) => {
    const t = new Date(p.createdAt).getTime();
    return t >= start && t <= end;
  });

  let totalGrossSales = 0;
  let totalPurchaseCost = 0;
  let productsSold = 0;

  for (const s of monthSales) {
    totalGrossSales += s.totalBill;
    totalPurchaseCost += s.totalCost;
    for (const item of s.items) {
      productsSold += item.quantity;
    }
  }

  let paymentsReceived = 0;
  for (const p of monthPayments) {
    paymentsReceived += p.amount;
  }

  let outstandingBalance = 0;
  for (const c of customers) {
    outstandingBalance += c.outstandingBalance;
  }

  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];

  return {
    monthName: monthNames[monthIndex] || 'MONTH',
    year,
    totalGrossSales,
    totalPurchaseCost,
    grossProfit: totalGrossSales - totalPurchaseCost,
    productsSold,
    billsCount: monthSales.length,
    paymentsReceived,
    outstandingBalance,
  };
}

// Product-wise sales & profit aggregation
export interface ProductPerformanceReport {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  quantitySold: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  currentStock: number;
}

export function computeProductPerformance(
  sales: SaleEntity[],
  products: ProductEntity[],
  dateRange: DateRange
): ProductPerformanceReport[] {
  const start = new Date(dateRange.startDate + 'T00:00:00.000Z').getTime();
  const end = new Date(dateRange.endDate + 'T23:59:59.999Z').getTime();

  const map = new Map<string, { qty: number; rev: number; cost: number }>();

  for (const s of sales) {
    const t = new Date(s.createdAt).getTime();
    if (t < start || t > end) continue;

    for (const item of s.items) {
      const existing = map.get(item.productId) || { qty: 0, rev: 0, cost: 0 };
      existing.qty += item.quantity;
      existing.rev += item.subtotal;
      existing.cost += item.itemCost;
      map.set(item.productId, existing);
    }
  }

  const reports: ProductPerformanceReport[] = [];

  for (const p of products) {
    const stats = map.get(p.id) || { qty: 0, rev: 0, cost: 0 };
    const grossProfit = stats.rev - stats.cost;
    const marginPercent = stats.rev > 0 ? (grossProfit / stats.rev) * 100 : 0;

    reports.push({
      productId: p.id,
      productName: p.name,
      category: p.category,
      unit: p.unit,
      quantitySold: stats.qty,
      totalRevenue: stats.rev,
      totalCost: stats.cost,
      grossProfit,
      marginPercent,
      currentStock: p.currentStock,
    });
  }

  // Sort by highest profit or quantity sold
  return reports.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// Helper to trigger CSV file download in browser
export function exportToCSV(filename: string, rows: (string | number)[][]): void {
  const processCell = (val: string | number) => {
    let str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = rows.map((row) => row.map(processCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
