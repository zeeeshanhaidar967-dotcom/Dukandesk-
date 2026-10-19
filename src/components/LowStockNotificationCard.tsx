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
      <div className="bg-card border border-badge-green-text/35 rounded-2xl p-4 flex items-center justify-between text-xs shadow-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-badge-green-bg border border-line-strong text-badge-green-text flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-ink text-xs">Inventory Health Normal</div>
            <p className="text-[11px] text-muted mt-0.5">
              All catalogue items for {settings.shopName} are safely above minimum stock levels.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-badge-green-text px-2.5 py-1 rounded-full bg-badge-green-bg border border-line-strong font-semibold">
          100% Stocked
        </span>
      </div>
    );
  }

  return (
    <div className="bg-card border border-line rounded-3xl p-4 sm:p-5 shadow-card space-y-3.5 relative overflow-hidden">
      {/* Top Notification System Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-badge-yellow-bg border border-line-strong text-badge-yellow-text flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            {counts.depleted > 0 ? (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-badge-red-text ring-2 ring-white animate-ping" />
            ) : (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-badge-yellow-text ring-2 ring-white" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                Low Stock Alert Notifications
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-badge-yellow-bg border border-line-strong text-badge-yellow-text">
                {counts.total} items
              </span>
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              Items falling below safety threshold in {settings.shopName}
            </p>
          </div>
        </div>

        {/* View toggle button */}
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-inner transition-colors cursor-pointer"
          title={isExpanded ? 'Collapse Alert Panel' : 'Expand Alert Panel'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Summary Deficit Banner */}
      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-inner border border-line-strong text-[11px] font-mono text-ink">
        <div>
          <span className="text-muted text-[10px] block">Stock Shortage:</span>
          <span className="text-ink font-bold text-xs">
            -{counts.totalShortageUnits} units
          </span>
        </div>
        <div>
          <span className="text-muted text-[10px] block">Est. Restock Cost:</span>
          <span className="text-badge-yellow-text font-bold text-xs">
            {formatCurrency(counts.totalEstCost, settings.currencySymbol)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-muted text-[10px] block">Depleted / Zero:</span>
          <span className={`font-bold text-xs ${counts.depleted > 0 ? 'text-badge-red-text' : 'text-muted'}`}>
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
            className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap transition-all cursor-pointer ${
              filterSeverity === 'all'
                ? 'bg-primary text-white font-bold shadow-sm'
                : 'bg-inner text-muted hover:bg-line'
            }`}
          >
            All Alerts ({counts.total})
          </button>

          {counts.depleted > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('depleted')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                filterSeverity === 'depleted'
                  ? 'bg-badge-red-bg text-badge-red-text border border-badge-red-text/35 font-bold'
                  : 'bg-inner text-badge-red-text hover:bg-badge-red-bg'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-badge-red-text" />
              <span>Depleted (0 left) ({counts.depleted})</span>
            </button>
          )}

          {counts.critical > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('critical')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                filterSeverity === 'critical'
                  ? 'bg-badge-yellow-bg text-badge-yellow-text border border-badge-yellow-text/35 font-bold'
                  : 'bg-inner text-badge-yellow-text hover:bg-badge-yellow-bg'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-badge-yellow-text" />
              <span>Critical Shortage ({counts.critical})</span>
            </button>
          )}

          {counts.warning > 0 && (
            <button
              type="button"
              onClick={() => setFilterSeverity('warning')}
              className={`px-2.5 py-1 rounded-lg font-medium text-[11px] whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                filterSeverity === 'warning'
                  ? 'bg-badge-yellow-bg text-badge-yellow-text border border-badge-yellow-text/35 font-bold'
                  : 'bg-inner text-badge-yellow-text hover:bg-badge-yellow-bg'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-badge-yellow-text" />
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
                cardBorder: 'border-badge-red-text/35 bg-badge-red-bg/30 hover:border-badge-red-text/35',
                badgeBg: 'bg-badge-red-bg border border-badge-red-text/35 text-badge-red-text',
                dotColor: 'bg-badge-red-text',
                barColor: 'bg-badge-red-text',
                label: 'Depleted (Out of Stock)',
              },
              critical: {
                cardBorder: 'border-badge-yellow-text/35 bg-badge-yellow-bg/40 hover:border-badge-yellow-text/35',
                badgeBg: 'bg-badge-yellow-bg border border-badge-yellow-text/35 text-badge-yellow-text',
                dotColor: 'bg-badge-yellow-text',
                barColor: 'bg-badge-yellow-text',
                label: 'Critical Low Stock',
              },
              warning: {
                cardBorder: 'border-line-strong bg-inner hover:border-line/30',
                badgeBg: 'bg-badge-yellow-bg border border-badge-yellow-text/25 text-badge-yellow-text',
                dotColor: 'bg-badge-yellow-text',
                barColor: 'bg-badge-yellow-text',
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
                      <h4 className="font-bold text-ink text-xs truncate">{p.name}</h4>
                    </div>

                    <div className="text-[11px] text-muted mt-0.5 flex items-center gap-1.5">
                      <span>{p.category}</span>
                      <span>·</span>
                      <span>Brand: {p.brand}</span>
                      <span>·</span>
                      <span className="text-muted">Supplier: {p.supplier}</span>
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
                  <div className="flex items-center justify-between text-[10px] text-muted font-mono">
                    <span className="flex items-center gap-1">
                      <span>Current:</span>
                      <strong className="text-ink">
                        {p.currentStock} {p.unit}
                      </strong>
                    </span>
                    <span>
                      Safety Threshold: <strong className="text-ink">{p.minStockLevel} {p.unit}</strong>
                    </span>
                  </div>

                  <div className="w-full h-1.5 rounded-full bg-line-strong/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${themeConfig.barColor}`}
                      style={{ width: `${item.healthPercent}%` }}
                    />
                  </div>
                </div>

                {/* Action & Deficit Metrics Row */}
                <div className="mt-2.5 pt-2 border-t border-line-strong/60 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-badge-red-text font-bold">
                      Shortage: -{item.deficit} {p.unit}
                    </span>
                    <span className="text-muted">·</span>
                    <span className="text-muted text-[10px]">
                      Cost: {formatCurrency(item.estimatedRestockCost, settings.currencySymbol)}
                    </span>
                  </div>

                  {/* One-Tap Restock Action */}
                  <button
                    type="button"
                    onClick={() => onNavigateToAddStock(p.id, item.recommendedRestock)}
                    className="px-3 py-1 rounded-xl bg-accent hover:bg-accent/90 active:scale-95 text-accent-text text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-accent-text" />
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
