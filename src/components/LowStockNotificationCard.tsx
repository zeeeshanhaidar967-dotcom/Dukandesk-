import React, { useState, useMemo } from 'react';
import {
  Bell,
  AlertOctagon,
  AlertTriangle,
  Info,
  PackagePlus,
  TrendingDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';
import { ProductEntity, OwnerSettingsEntity } from '../types/database';
import { formatCurrency } from '../services/calculations';

export type StockSeverity = 'depleted' | 'critical' | 'warning';

export interface LowStockItemInfo {
  product: ProductEntity;
  severity: StockSeverity;
  deficit: number;
  healthPercent: number;
  recommendedRestock: number;
  estimatedRestockCost: number;
}

interface LowStockNotificationCardProps {
  products: ProductEntity[];
  settings: OwnerSettingsEntity;
  onNavigateToAddStock: (productId: string, suggestedQty?: number) => void;
}

export const LowStockNotificationCard: React.FC<LowStockNotificationCardProps> = ({
  products,
  settings,
  onNavigateToAddStock,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'depleted' | 'critical' | 'warning'>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  // Analyze all products and categorize those falling below their minimum stock levels
  const lowStockItems: LowStockItemInfo[] = useMemo(() => {
    const list: LowStockItemInfo[] = [];

    products.forEach((p) => {
      if (p.currentStock <= p.minStockLevel) {
        let severity: StockSeverity = 'warning';
        if (p.currentStock <= 0) {
          severity = 'depleted';
        } else if (p.currentStock <= p.minStockLevel * 0.5) {
          severity = 'critical';
        }

        const deficit = Math.max(0, p.minStockLevel - p.currentStock);
        const healthPercent = p.minStockLevel > 0 
          ? Math.min(100, Math.round((p.currentStock / p.minStockLevel) * 100))
          : 0;

        // Recommended restock to bring stock to at least 1.5x minimum level
        const recommendedRestock = Math.max(deficit > 0 ? deficit : 10, Math.ceil(p.minStockLevel * 1.5 - p.currentStock));
        const estimatedRestockCost = deficit * p.purchasePrice;

        list.push({
          product: p,
          severity,
          deficit,
          healthPercent,
          recommendedRestock,
          estimatedRestockCost,
        });
      }
    });

    // Sort order: depleted first, then critical, then warning, then highest deficit
    return list.sort((a, b) => {
      const severityWeight: Record<StockSeverity, number> = {
        depleted: 3,
        critical: 2,
        warning: 1,
      };
      if (severityWeight[a.severity] !== severityWeight[b.severity]) {
        return severityWeight[b.severity] - severityWeight[a.severity];
      }
      return b.deficit - a.deficit;
    });
  }, [products]);

  // Counts for each category
  const counts = useMemo(() => {
    return {
      total: lowStockItems.length,
      depleted: lowStockItems.filter((i) => i.severity === 'depleted').length,
      critical: lowStockItems.filter((i) => i.severity === 'critical').length,
      warning: lowStockItems.filter((i) => i.severity === 'warning').length,
      totalShortageUnits: lowStockItems.reduce((acc, i) => acc + i.deficit, 0),
      totalEstCost: lowStockItems.reduce((acc, i) => acc + i.estimatedRestockCost, 0),
    };
  }, [lowStockItems]);

  // Filtered items based on active tab
  const filteredItems = useMemo(() => {
    if (filterSeverity === 'all') return lowStockItems;
    return lowStockItems.filter((i) => i.severity === filterSeverity);
  }, [lowStockItems, filterSeverity]);

  // If no items are low stock, show clean inventory healthy status
  if (lowStockItems.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white text-xs">Inventory Health Normal</div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              All catalogue items for {settings.shopName} are safely above minimum stock levels.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          100% Stocked
        </span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3.5 relative overflow-hidden">
      {/* Top Notification System Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            {counts.depleted > 0 ? (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900 animate-ping" />
            ) : (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-slate-900" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Low Stock Alert Notifications
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                {counts.total} items
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Items falling below safety threshold in {settings.shopName}
            </p>
          </div>
        </div>

        {/* View toggle button */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={isExpanded ? 'Collapse Alert Panel' : 'Expand Alert Panel'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Summary Deficit Banner */}
      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-[11px] font-mono">
        <div>
          <span className="text-slate-500 text-[10px] block">Stock Shortage:</span>
          <span className="text-white font-bold text-xs">
            -{counts.totalShortageUnits} units
          </span>
        </div>
        <div>
          <span className="text-slate-500 text-[10px] block">Est. Restock Cost:</span>
          <span className="text-amber-400 font-bold text-xs">
            {formatCurrency(counts.totalEstCost, settings.currencySymbol)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-slate-500 text-[10px] block">Depleted / Zero:</span>
          <span className={`font-bold text-xs ${counts.depleted > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {counts.depleted} item(s)
          </span>
        </div>
      </div>

      {/* Filter Tabs for Notification Types */}
      {isExpanded && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setFilterSeverity('all')}
            className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap transition-all ${
              filterSeverity === 'all'
                ? 'bg-slate-700 text-white font-bold shadow-sm'
                : 'bg-slate-800/70 text-slate-400 hover:text-white'
            }`}
          >
            All Alerts ({counts.total})
          </button>

          {counts.depleted > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('depleted')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap flex items-center gap-1.5 transition-all ${
                filterSeverity === 'depleted'
                  ? 'bg-rose-500/25 text-rose-200 border border-rose-500/40 font-bold'
                  : 'bg-slate-800/70 text-rose-400/80 hover:text-rose-300'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>Depleted (0 left) ({counts.depleted})</span>
            </button>
          )}

          {counts.critical > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('critical')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap flex items-center gap-1.5 transition-all ${
                filterSeverity === 'critical'
                  ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40 font-bold'
                  : 'bg-slate-800/70 text-amber-400/80 hover:text-amber-300'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Critical Shortage ({counts.critical})</span>
            </button>
          )}

          {counts.warning > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('warning')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap flex items-center gap-1.5 transition-all ${
                filterSeverity === 'warning'
                  ? 'bg-yellow-500/25 text-yellow-200 border border-yellow-500/40 font-bold'
                  : 'bg-slate-800/70 text-yellow-400/80 hover:text-yellow-300'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
              <span>Low Warning ({counts.warning})</span>
            </button>
          )}
        </div>
      )}

      {/* Alert Item Cards List with Subtle Color Indicators */}
      {isExpanded && (
        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
          {filteredItems.map((item) => {
            const p = item.product;

            // Subtle color themes based on severity level
            const themeConfig = {
              depleted: {
                cardBorder: 'border-rose-500/30 bg-rose-950/20 hover:border-rose-500/50',
                badgeBg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
                dotColor: 'bg-rose-500',
                barColor: 'bg-rose-500',
                label: 'Depleted (Out of Stock)',
              },
              critical: {
                cardBorder: 'border-amber-500/30 bg-amber-950/20 hover:border-amber-500/50',
                badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
                dotColor: 'bg-amber-400',
                barColor: 'bg-amber-400',
                label: 'Critical Low Stock',
              },
              warning: {
                cardBorder: 'border-yellow-500/25 bg-yellow-950/15 hover:border-yellow-500/40',
                badgeBg: 'bg-yellow-500/10 border-yellow-500/25 text-yellow-300',
                dotColor: 'bg-yellow-400',
                barColor: 'bg-yellow-400',
                label: 'Below Minimum Level',
              },
            }[item.severity];

            return (
              <div
                key={p.id}
                className={`p-3 rounded-2xl border transition-all text-xs ${themeConfig.cardBorder}`}
              >
                {/* Product Title & Subtle Color Indicator Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {/* Subtle Color Dot Indicator */}
                      <span className={`w-2.5 h-2.5 rounded-full ${themeConfig.dotColor} shrink-0 shadow-sm`} />
                      <h4 className="font-bold text-white text-xs truncate">{p.name}</h4>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                      <span>{p.category}</span>
                      <span>·</span>
                      <span>Brand: {p.brand}</span>
                      <span>·</span>
                      <span className="text-slate-500">Supplier: {p.supplier}</span>
                    </div>
                  </div>

                  {/* Subtle Severity Pill */}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 flex items-center gap-1 ${themeConfig.badgeBg}`}
                  >
                    <span>{themeConfig.label}</span>
                  </span>
                </div>

                {/* Stock Health Progress Bar Indicator */}
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <span>Current:</span>
                      <strong className="text-white">
                        {p.currentStock} {p.unit}
                      </strong>
                    </span>
                    <span>
                      Safety Threshold: <strong className="text-slate-300">{p.minStockLevel} {p.unit}</strong>
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${themeConfig.barColor}`}
                      style={{ width: `${item.healthPercent}%` }}
                    />
                  </div>
                </div>

                {/* Action & Deficit Metrics Row */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-rose-400 font-bold">
                      Shortage: -{item.deficit} {p.unit}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400 text-[10px]">
                      Cost: {formatCurrency(item.estimatedRestockCost, settings.currencySymbol)}
                    </span>
                  </div>

                  {/* One-Tap Restock Action */}
                  <button
                    type="button"
                    onClick={() => onNavigateToAddStock(p.id, item.recommendedRestock)}
                    className="px-3 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-500/10"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>+ Restock Now</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
