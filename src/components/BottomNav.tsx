import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Settings,
  UserCheck,
  Boxes,
  ShieldCheck,
} from 'lucide-react';
import { AppUserRole } from '../types/database';

export type NavTabId =
  | 'dashboard'
  | 'sales'
  | 'inventory'
  | 'customers'
  | 'reports'
  | 'settings'
  | 'users'
  | 'admin_panel'
  | 'stock_dashboard';

interface BottomNavProps {
  activeTab: NavTabId;
  onTabChange: (tab: NavTabId) => void;
  cartCount?: number;
  unpaidCustomersCount?: number;
  role?: AppUserRole;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  cartCount = 0,
  unpaidCustomersCount = 0,
  role = 'admin',
}) => {
  // If user is a Viewer / Stock Viewer, show ONLY stock-related tabs
  const isManagement = role === 'admin' || role === 'manager';
  if (!isManagement) {
    const stockTabs = [
      {
        id: 'stock_dashboard' as NavTabId,
        label: 'Stock Status',
        icon: LayoutDashboard,
      },
      {
        id: 'inventory' as NavTabId,
        label: 'Catalogue',
        icon: Boxes,
      },
    ];

    return (
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 text-slate-400 no-print select-none">
        <div className="max-w-4xl mx-auto grid grid-cols-2 items-center h-16 px-4">
          {stockTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center min-h-[48px] py-1.5 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'text-cyan-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 active:scale-95'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                </div>
                <span className={`text-[11px] tracking-tight mt-1 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // Admin tabs (Full 7 sections)
  const adminTabs = [
    {
      id: 'dashboard' as NavTabId,
      label: 'Home',
      icon: LayoutDashboard,
    },
    {
      id: 'sales' as NavTabId,
      label: 'Sales',
      icon: ShoppingCart,
      badge: cartCount > 0 ? cartCount : undefined,
    },
    {
      id: 'inventory' as NavTabId,
      label: 'Stock',
      icon: Package,
    },
    {
      id: 'customers' as NavTabId,
      label: 'Clients',
      icon: Users,
      badge: unpaidCustomersCount > 0 ? unpaidCustomersCount : undefined,
    },
    {
      id: 'reports' as NavTabId,
      label: 'Reports',
      icon: BarChart3,
    },
    {
      id: 'admin_panel' as NavTabId,
      label: 'Admin',
      icon: ShieldCheck,
    },
    {
      id: 'settings' as NavTabId,
      label: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 text-slate-400 no-print select-none">
      <div className="max-w-4xl mx-auto grid grid-cols-7 items-center h-16 px-1 sm:px-4">
        {adminTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center min-h-[48px] py-1.5 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'text-emerald-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 active:scale-95'
              }`}
            >
              <div className="relative">
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[9px] sm:text-[10px] tracking-tight mt-1 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                {tab.label}
              </span>
              {isActive && (
                <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
