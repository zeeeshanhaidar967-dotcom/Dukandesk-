import React from 'react';
import {
  Lock,
  ShieldCheck,
  Bell,
  Cloud,
  LogOut,
  User,
  Shield,
  Eye,
  Wifi,
  RefreshCw,
} from 'lucide-react';
import { AppUserProfile } from '../types/database';
import { SyncState } from '../services/firebaseSyncService';

interface TopAppBarProps {
  shopName: string;
  ownerName: string;
  lowStockCount?: number;
  userProfile?: AppUserProfile | null;
  syncState?: SyncState;
  onLock: () => void;
  onLogout?: () => void;
  onNotificationClick?: () => void;
  onOpenGoogleDrive?: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  shopName,
  ownerName,
  lowStockCount = 0,
  userProfile,
  syncState,
  onLock,
  onLogout,
  onNotificationClick,
  onOpenGoogleDrive,
}) => {
  const isAdmin = userProfile?.role === 'admin';

  // Format sync status presentation
  const isOffline = syncState?.status === 'offline';
  const isSyncing = syncState?.status === 'syncing';
  const isError = syncState?.status === 'error';
  const pendingCount = syncState?.pendingCount || 0;

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 select-none no-print">
      {/* Real-Time Cloud Status Bar */}
      <div className="flex items-center justify-between px-4 py-1 text-[11px] font-mono text-slate-400 bg-slate-950/60 border-b border-slate-800/40">
        <div className="flex items-center gap-1.5">
          {isSyncing ? (
            <RefreshCw className="w-2.5 h-2.5 text-amber-400 animate-spin" />
          ) : isOffline ? (
            <div className="w-2 h-2 rounded-full bg-slate-500" />
          ) : isError ? (
            <div className="w-2 h-2 rounded-full bg-rose-400" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
          <span
            className={`text-[10px] tracking-wider font-semibold ${
              isSyncing
                ? 'text-amber-400'
                : isOffline
                ? 'text-slate-400'
                : isError
                ? 'text-rose-400'
                : 'text-emerald-400'
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
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                isAdmin
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                  : 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
              }`}
            >
              {isAdmin ? 'ADMIN' : (userProfile?.role?.toUpperCase() || 'VIEWER')}
            </span>
          )}
          <span className="text-slate-400 text-[10px]">
            {isOffline ? 'OFFLINE' : isSyncing ? 'SYNCING' : 'REAL-TIME SYNC'}
          </span>
        </div>
      </div>

      {/* Main App Bar */}
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Left: Shop Branding & Logged In User */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              isAdmin
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
            }`}
          >
            {isAdmin ? <Shield className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-white truncate max-w-[150px] sm:max-w-xs uppercase">
              {shopName}
            </h1>
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              <span>{userProfile?.displayName || userProfile?.name || ownerName}</span>
              {userProfile?.email && (
                <span className="text-slate-500 truncate hidden sm:inline">({userProfile.email})</span>
              )}
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
              className="min-h-[38px] px-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 flex items-center justify-center gap-1 transition-colors active:scale-95 text-xs font-semibold cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline text-[11px]">Drive</span>
            </button>
          )}

          {/* Low Stock Notification Bell (Visible to both Admin and Stock Viewer) */}
          {lowStockCount > 0 && (
            <button
              type="button"
              onClick={onNotificationClick}
              title={`${lowStockCount} items below minimum stock`}
              className="relative min-h-[38px] min-w-[38px] p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[9px] font-bold flex items-center justify-center">
                {lowStockCount}
              </span>
            </button>
          )}

          {/* Quick Lock Button (For Admin) */}
          {isAdmin && (
            <button
              type="button"
              onClick={onLock}
              title="Lock PIN Screen"
              className="min-h-[38px] min-w-[38px] p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
              aria-label="Lock App"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Secure Logout Button */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out of Firebase"
              className="min-h-[38px] px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 flex items-center justify-center gap-1 transition-colors active:scale-95 text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
