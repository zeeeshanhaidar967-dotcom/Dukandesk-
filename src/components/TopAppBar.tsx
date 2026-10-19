import React from 'react';
import {
  ShieldCheck,
  Bell,
  Cloud,
  LogOut,
  User,
  Shield,
  Eye,
  Wifi,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import { AppUserProfile } from '../types/database';
import { SyncState } from '../services/firebaseSyncService';

interface TopAppBarProps {
  shopName: string;
  ownerName: string;
  lowStockCount?: number;
  userProfile?: AppUserProfile | null;
  syncState?: SyncState;
  onLogout?: () => void;
  onNotificationClick?: () => void;
  onOpenGoogleDrive?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  shopName,
  ownerName,
  lowStockCount = 0,
  userProfile,
  syncState,
  onLogout,
  onNotificationClick,
  onOpenGoogleDrive,
  theme = 'light',
  onToggleTheme,
}) => {
  const isAdmin = userProfile?.role === 'admin';

  // Format sync status presentation
  const isOffline = syncState?.status === 'offline';
  const isSyncing = syncState?.status === 'syncing';
  const isError = syncState?.status === 'error';
  const pendingCount = syncState?.pendingCount || 0;

  return (
    <header className="sticky top-0 z-30 bg-header text-white border-b border-line select-none no-print shadow-sm">
      {/* Real-Time Cloud Status Bar (small info strip above uses card color) */}
      <div className="flex items-center justify-between px-4 py-1 text-[11px] font-mono text-ink bg-card border-b border-line">
        <div className="flex items-center gap-1.5">
          {isSyncing ? (
            <RefreshCw className="w-2.5 h-2.5 text-accent animate-spin" />
          ) : isOffline ? (
            <div className="w-2 h-2 rounded-full bg-muted/60" />
          ) : isError ? (
            <div className="w-2 h-2 rounded-full bg-badge-red-bg" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-badge-green-bg animate-pulse" />
          )}
          <span
            className={`text-[10px] tracking-wider font-semibold ${
              isSyncing
                ? 'text-badge-yellow-text'
                : isOffline
                ? 'text-muted'
                : isError
                ? 'text-badge-red-text'
                : 'text-badge-green-text'
            }`}
          >
            {isSyncing
              ? `SYNCING ${pendingCount > 0 ? `(${pendingCount} PENDING)` : ''}`
              : isOffline
              ? `OFFLINE (CACHED LOCALLY${pendingCount > 0 ? ` • ${pendingCount} PENDING` : ''})`
              : isError
              ? `SYNC RETRYING ${pendingCount > 0 ? `(${pendingCount} QUEUED)` : ''}`
              : 'FIREBASE MULTI-DEVICE CLOUD'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {userProfile && (
            <span className="text-[10px] text-muted hidden sm:inline truncate max-w-[150px]">
              User: <span className="text-ink font-medium">{userProfile.displayName || userProfile.name}</span>
            </span>
          )}
          {userProfile && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                isAdmin
                  ? 'bg-badge-green-bg text-badge-green-text border border-badge-green-text/35'
                  : 'bg-badge-blue-bg text-badge-blue-text border border-badge-blue-text/35'
              }`}
            >
              {isAdmin ? 'ADMIN' : (userProfile?.role?.toUpperCase() || 'VIEWER')}
            </span>
          )}
          <span className="text-muted text-[10px]">
            {isOffline ? 'OFFLINE' : isSyncing ? 'SYNCING' : 'REAL-TIME SYNC'}
          </span>
        </div>
      </div>

      {/* Main App Bar (Header Color) */}
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Left: Shop Branding & Logged In User */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-header-btn border-white/28 text-white">
            {isAdmin ? <Shield className="w-5 h-5 text-white" /> : <Eye className="w-5 h-5 text-white" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white truncate max-w-[150px] sm:max-w-xs uppercase">
              {shopName || 'MAHARAJA MARBLE'}
            </h1>
            <p className="text-[11px] text-white/80 truncate flex items-center gap-1">
              <span className="font-semibold text-white">HAIDAR ALI</span>
              <span className="text-white/70 font-mono truncate">(hmotor786@gmail.com)</span>
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          {/* Google Drive Cloud Button (Admin Only) */}
          {isAdmin && onOpenGoogleDrive && (
            <button
              type="button"
              onClick={onOpenGoogleDrive}
              title="Google Drive Cloud Backups & Files"
              className="min-h-[38px] px-2 rounded-lg bg-header-btn hover:bg-header-btn-hover text-white border border-white/28 flex items-center justify-center gap-1 transition-colors active:scale-95 text-xs font-semibold cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline text-[11px]">Drive</span>
            </button>
          )}

          {/* Low Stock Notification Bell (Visible to both Admin and Stock Viewer) */}
          {lowStockCount > 0 && (
            <button
              type="button"
              onClick={onNotificationClick}
              title={`${lowStockCount} items below minimum stock`}
              className="relative min-h-[38px] min-w-[38px] p-2 rounded-lg bg-header-btn hover:bg-header-btn-hover text-white border border-white/28 flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-white" />
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-text text-[9px] font-bold flex items-center justify-center">
                {lowStockCount}
              </span>
            </button>
          )}

          {/* Theme Toggle Button (Visible to ALL users: Admin & Viewer) */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="min-h-[38px] min-w-[38px] p-2 rounded-lg bg-header-btn hover:bg-header-btn-hover text-white border border-white/28 flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-accent" />
            ) : (
              <Moon className="w-4 h-4 text-white" />
            )}
          </button>

          {/* Secure Logout Button */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out of Firebase"
              className="min-h-[38px] px-2.5 py-1 rounded-lg bg-header-btn hover:bg-header-btn-hover text-white border border-white/28 flex items-center justify-center gap-1 transition-colors active:scale-95 text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline text-[11px]">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
