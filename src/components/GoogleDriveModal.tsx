import React, { useState, useEffect, useMemo } from 'react';
import {
  HardDrive,
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  X,
  ShieldCheck,
  Folder,
  History,
  Calendar,
  Clock,
  Database,
  ArrowRight,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { auth } from '../firebase';
import {
  googleSignIn,
  logoutGoogle,
  initAuth,
  clearAuthToken,
  getCurrentlyAuthenticatedUser,
  hasStoredSessionInStorage,
  getAccessToken,
  setAccessTokenInMemory,
  refreshGoogleDriveToken,
  isDriveTokenValid,
  GoogleAuthUser,
} from '../services/googleAuthService';
import {
  listShopBackupsFromDrive,
  uploadShopBackupToDrive,
  downloadDriveFileText,
  deleteDriveFile,
  BACKUP_FOLDER_NAME,
  GoogleDriveFile,
  getOrCreateBackupFolder,
} from '../services/googleDriveService';
import { roomDb } from '../db/roomDatabase';
import { OwnerSettingsEntity, BackupSummaryInfo } from '../types/database';
import { formatCurrency } from '../services/calculations';
import { checkAndRunAutoBackup } from '../services/autoBackupService';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopName: string;
  currencySymbol: string;
  settings: OwnerSettingsEntity;
  onUpdateSettings?: (newSettings: Partial<OwnerSettingsEntity>) => void;
  onRefreshDbState?: () => void;
}

type TabType = 'overview' | 'restore' | 'history';

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  shopName,
  currencySymbol,
  settings,
  onUpdateSettings,
  onRefreshDbState,
}) => {
  // Direct Google Drive OAuth token from localStorage (strictly null if missing or expired)
  const [driveToken, setDriveToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && isDriveTokenValid()) {
      return localStorage.getItem('drive_access_token');
    }
    return null;
  });

  // Auth state: only populated if drive_access_token is present in storage and valid
  const [currentUser, setCurrentUser] = useState<User | GoogleAuthUser | null>(() => {
    if (!isDriveTokenValid()) return null; // Disconnected by default if token is missing or expired
    const existing = getCurrentlyAuthenticatedUser();
    if (existing) return existing;
    if (auth.currentUser) return auth.currentUser;
    return {
      uid: 'google-session',
      email: null,
      displayName: 'Google Account',
      photoURL: null,
    };
  });

  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string>('');
  const [scopeError, setScopeError] = useState<boolean>(false);

  // Tab & Files state
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [backups, setBackups] = useState<GoogleDriveFile[]>([]);
  const [backupFolder, setBackupFolder] = useState<{ id: string; name: string; webViewLink?: string } | null>(null);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  // Operation statuses
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Restore confirmation modal state
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<GoogleDriveFile | null>(null);
  const [previewBackupData, setPreviewBackupData] = useState<{
    summary?: BackupSummaryInfo;
    shopName?: string;
    exportedAt?: string;
    jsonContent?: string;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Delete confirmation
  const [fileToDelete, setFileToDelete] = useState<GoogleDriveFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Restore success receipt
  const [restoreReceipt, setRestoreReceipt] = useState<{
    backupName: string;
    counts: BackupSummaryInfo;
  } | null>(null);

  // Synchronize Google Drive token and load backups strictly when a valid token exists on open
  useEffect(() => {
    if (!isOpen) return;

    if (!isDriveTokenValid()) {
      // Disconnected: do NOT trigger popup, do NOT call Drive API
      clearAuthToken();
      setDriveToken(null);
      setCurrentUser(null);
      setIsCheckingAuth(false);
      setBackups([]);
      setBackupFolder(null);
      setScopeError(false);
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('drive_access_token') : null;
    if (token) {
      setDriveToken(token);
      setAccessTokenInMemory(token);
      const activeUser = auth.currentUser || getCurrentlyAuthenticatedUser();
      if (activeUser) {
        setCurrentUser(activeUser);
      } else {
        setCurrentUser({
          uid: 'google-session',
          email: null,
          displayName: 'Google Account',
          photoURL: null,
        });
      }
      setIsCheckingAuth(false);
      // Valid token exists: gracefully load backups
      loadCloudBackups(token);
    } else {
      setDriveToken(null);
      setCurrentUser(null);
      setIsCheckingAuth(false);
      setBackups([]);
      setBackupFolder(null);
      setScopeError(false);
    }
  }, [isOpen]);

  // Load backups list directly from Google Drive - ONLY called when valid token exists
  const loadCloudBackups = async (tokenOverride?: string) => {
    if (!isDriveTokenValid()) {
      setIsLoadingBackups(false);
      setDriveToken(null);
      setCurrentUser(null);
      setBackups([]);
      setBackupFolder(null);
      return;
    }

    const token =
      tokenOverride ||
      driveToken ||
      (typeof window !== 'undefined' ? localStorage.getItem('drive_access_token') : null);

    // Guard: strictly DO NOT make fetch if no token is present
    if (!token) {
      setIsLoadingBackups(false);
      setBackups([]);
      setBackupFolder(null);
      return;
    }

    setIsLoadingBackups(true);
    setStatusMessage(null);
    try {
      const result = await listShopBackupsFromDrive();
      setBackupFolder(result.folder);
      setBackups(result.backups);
      setScopeError(false);
    } catch (err: any) {
      const msg = err.message || '';
      console.warn('loadCloudBackups notice:', msg);
      const isScopeErr =
        msg.toLowerCase().includes('insufficient') ||
        msg.toLowerCase().includes('scope') ||
        (msg.includes('403') && !msg.toLowerCase().includes('unregistered'));
      const isExpiredOrUnregistered =
        msg.includes('401') ||
        msg.toLowerCase().includes('unregistered') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('invalid');

      if (isScopeErr) {
        setScopeError(true);
        setStatusMessage({
          type: 'error',
          text: 'Google Drive permission required. Please click "Re-authenticate" below to grant permissions.',
        });
      } else if (isExpiredOrUnregistered) {
        // DO NOT trigger popup automatically! Clear expired token and set state to Disconnected
        clearAuthToken();
        setDriveToken(null);
        setCurrentUser(null);
        setBackups([]);
        setBackupFolder(null);
        setStatusMessage({
          type: 'error',
          text: 'Google Drive session expired or disconnected. Please click "Connect Google Drive" or "Re-authenticate" to reconnect.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: msg || 'Failed to connect to Google Drive. Check internet connection.',
        });
      }
    } finally {
      setIsLoadingBackups(false);
    }
  };

  // User-initiated refresh button handler
  const handleRefresh = async () => {
    if (!isDriveTokenValid()) {
      clearAuthToken();
      setDriveToken(null);
      setCurrentUser(null);
      setBackups([]);
      setBackupFolder(null);
      setStatusMessage({
        type: 'error',
        text: 'Google Drive session expired. Please click "Re-authenticate" or "Connect Google Drive" below.',
      });
      return;
    }
    await loadCloudBackups();
  };

  // USER-INITIATED OAUTH FLOW ONLY (Direct click event handler attached directly to a button)
  const handleConnectDrive = async () => {
    setIsSigningIn(true);
    setAuthError('');
    setStatusMessage(null);
    try {
      const result = await googleSignIn(true);
      if (result && result.accessToken) {
        setDriveToken(result.accessToken);
        setAccessTokenInMemory(result.accessToken);
        if (typeof window !== 'undefined') {
          localStorage.setItem('drive_access_token', result.accessToken);
          localStorage.setItem('drive_token_expires_at', String(Date.now() + 3550 * 1000));
        }
        setCurrentUser(result.user);
        setScopeError(false);
        setStatusMessage({
          type: 'success',
          text: `✓ Successfully connected to Google Drive (${result.user.email || result.user.displayName || 'Google Account'})!`,
        });
        await loadCloudBackups(result.accessToken);
      }
    } catch (err: any) {
      console.error('Google Drive sign-in error:', err);
      const isPopupBlocked =
        err.code === 'auth/popup-blocked' ||
        err.message?.toLowerCase().includes('popup') ||
        err.message?.toLowerCase().includes('blocked');
      if (isPopupBlocked) {
        setAuthError('Sign-in popup was blocked by your browser. Please allow popups for this site and click Connect again.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in was cancelled before completion.');
      } else {
        setAuthError(err.message || 'Failed to authenticate with Google Drive.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignIn = handleConnectDrive;
  const handleReauthenticate = handleConnectDrive;

  const handleSignOut = async () => {
    await logoutGoogle();
    clearAuthToken();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('drive_access_token');
    }
    setDriveToken(null);
    setCurrentUser(null);
    setScopeError(false);
    setBackups([]);
    setBackupFolder(null);
    setStatusMessage({ type: 'info', text: 'Disconnected from Google Drive.' });
  };

  // Manual "Backup Now" Flow
  const handleBackupNow = async () => {
    if (!isDriveTokenValid()) {
      clearAuthToken();
      setDriveToken(null);
      setCurrentUser(null);
      setStatusMessage({
        type: 'error',
        text: 'Google Drive is disconnected or session expired. Please click "Connect Google Drive" or "Re-authenticate" first.',
      });
      return;
    }

    setIsBackingUp(true);
    setStatusMessage(null);
    try {
      // 1. Generate full validated database backup snapshot
      const backupJson = await roomDb.exportStructuredBackupJSON();

      // 2. Upload to visible "MAHARAJA MARBLE — App Backups" folder
      const result = await uploadShopBackupToDrive(backupJson, {
        shopName: settings.shopName || 'MAHARAJA MARBLE',
        accountEmail: currentUser?.email || undefined,
      });

      // 3. Update local database settings
      const nowIso = new Date().toISOString();
      const sizeStr = `${(result.sizeBytes / 1024).toFixed(1)} KB`;
      const updatedFields = {
        lastBackupDate: nowIso,
        lastBackupFileId: result.file.id,
        lastBackupFileSize: sizeStr,
        lastBackupAccount: currentUser?.email || undefined,
        lastAutoBackupAttempt: nowIso,
        lastAutoBackupStatus: 'SUCCESS' as const,
      };

      roomDb.updateSettings(updatedFields);
      if (onUpdateSettings) onUpdateSettings(updatedFields);
      if (onRefreshDbState) onRefreshDbState();

      setStatusMessage({
        type: 'success',
        text: `✓ Backup completed successfully! Saved "${result.file.name}" to Google Drive (${sizeStr}).`,
      });

      // Refresh files list
      await loadCloudBackups();
    } catch (err: any) {
      const msg = err.message || '';
      if (
        msg.includes('401') ||
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('unregistered')
      ) {
        // DO NOT trigger automatic popup!
        clearAuthToken();
        setDriveToken(null);
        setCurrentUser(null);
        setStatusMessage({
          type: 'error',
          text: '⚠ Google Drive session expired. Please click "Re-authenticate" above to reconnect.',
        });
      } else {
        console.error('Backup Now failed:', err);
        setStatusMessage({
          type: 'error',
          text: `⚠ Backup failed: ${err.message || 'Network or authorization error. Local data remains safe.'}`,
        });
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  // Toggle Automatic Backup
  const handleToggleAutoBackup = () => {
    const nextVal = settings.automaticBackupEnabled === false ? true : false;
    const update = { automaticBackupEnabled: nextVal };
    roomDb.updateSettings(update);
    if (onUpdateSettings) onUpdateSettings(update);
    if (onRefreshDbState) onRefreshDbState();

    if (nextVal) {
      checkAndRunAutoBackup(false);
    }
  };

  // Safe Restore: Step 1 - Select and Preview Backup
  const handleSelectBackupForRestore = async (file: GoogleDriveFile) => {
    if (!isDriveTokenValid()) {
      clearAuthToken();
      setDriveToken(null);
      setCurrentUser(null);
      setStatusMessage({
        type: 'error',
        text: 'Google Drive is disconnected or session expired. Please click "Connect Google Drive" or "Re-authenticate" first.',
      });
      return;
    }

    setSelectedBackupForRestore(file);
    setIsLoadingPreview(true);
    setPreviewBackupData(null);
    setStatusMessage(null);

    try {
      const jsonContent = await downloadDriveFileText(file.id);
      const validation = roomDb.validateBackupPayload(jsonContent);

      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid backup structure.');
      }

      setPreviewBackupData({
        summary: validation.summary,
        shopName: validation.shopName,
        exportedAt: validation.exportedAt,
        jsonContent,
      });
    } catch (err: any) {
      const msg = err.message || '';
      if (
        msg.includes('401') ||
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('unregistered')
      ) {
        clearAuthToken();
        setDriveToken(null);
        setCurrentUser(null);
        setStatusMessage({
          type: 'error',
          text: '⚠ Google Drive session expired. Please click "Re-authenticate" above to reconnect.',
        });
      } else {
        console.error('Failed to preview backup:', err);
        setStatusMessage({
          type: 'error',
          text: `Cannot prepare restore: ${err.message || 'Corrupted file'}`,
        });
      }
      setSelectedBackupForRestore(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Safe Restore: Step 2 - Execute Safe Restore with Rollback Protection
  const handleConfirmExecuteRestore = async () => {
    if (!previewBackupData?.jsonContent || !selectedBackupForRestore) return;

    setIsRestoring(true);
    setStatusMessage(null);

    try {
      // roomDb.restoreDatabase automatically:
      // 1. Creates a local safety rollback of current database
      // 2. Validates structure & schema
      // 3. Replaces database atomically
      // 4. Recalculates and verifies ledger totals
      // 5. Automatically rolls back to safety copy if an error occurs
      const result = roomDb.restoreDatabase(previewBackupData.jsonContent);

      if (onRefreshDbState) {
        onRefreshDbState();
      }

      setRestoreReceipt({
        backupName: selectedBackupForRestore.name,
        counts: result.restoredCounts,
      });

      setSelectedBackupForRestore(null);
      setPreviewBackupData(null);
      setStatusMessage({
        type: 'success',
        text: `✓ Database successfully restored from Google Drive backup "${selectedBackupForRestore.name}"!`,
      });
    } catch (err: any) {
      console.error('Restore execution failed:', err);
      setStatusMessage({
        type: 'error',
        text: `⚠ Restore failed: ${err.message || 'Restoration aborted. Local database was safely rolled back.'}`,
      });
    } finally {
      setIsRestoring(false);
    }
  };

  // Delete Backup from Drive
  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;
    if (!isDriveTokenValid()) {
      clearAuthToken();
      setDriveToken(null);
      setCurrentUser(null);
      setStatusMessage({
        type: 'error',
        text: 'Google Drive is disconnected or session expired. Please click "Connect Google Drive" or "Re-authenticate" first.',
      });
      return;
    }

    setIsDeleting(true);
    try {
      await deleteDriveFile(fileToDelete.id);
      setStatusMessage({
        type: 'success',
        text: `Backup "${fileToDelete.name}" deleted from Google Drive.`,
      });
      setFileToDelete(null);
      await loadCloudBackups();
    } catch (err: any) {
      const msg = err.message || '';
      if (
        msg.includes('401') ||
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('unauthorized') ||
        msg.toLowerCase().includes('unregistered')
      ) {
        clearAuthToken();
        setDriveToken(null);
        setCurrentUser(null);
        setStatusMessage({
          type: 'error',
          text: '⚠ Google Drive session expired. Please click "Re-authenticate" above to reconnect.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: `Delete failed: ${err.message || 'Could not delete file from Google Drive'}`,
        });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return '—';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatBackupDate = (isoStr?: string) => {
    if (!isoStr) return 'Never';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  // Filter timestamped versioned backups
  const versionedBackups = useMemo(() => {
    return backups.filter((b) => !b.name.includes('_Latest.json'));
  }, [backups]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500/20 to-emerald-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>{shopName} — Cloud Backup & Restore</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Google Drive My Drive
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Independent disaster-recovery backup in normal visible Google Drive folder
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast Notification */}
        {statusMessage && (
          <div
            className={`p-3 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                : 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : statusMessage.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-blue-400 shrink-0" />
              )}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable Container */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          {/* 1. Account Connection & Status Card (Requirements 2 & 12) */}
          {(() => {
            const hasDriveToken = Boolean(driveToken && isDriveTokenValid());
            const isDriveConnected = Boolean(currentUser && hasDriveToken);
            const displayUser =
              currentUser ||
              auth.currentUser ||
              (hasDriveToken
                ? {
                    displayName: 'Google Account',
                    email: 'Active Google Session',
                    photoURL: null,
                    uid: 'google-session',
                  }
                : null);

            return (
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
                {isCheckingAuth && !isDriveConnected ? (
                  <div className="flex items-center gap-3 py-4 px-2 text-xs text-slate-300">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                    <span>Checking Google Drive connection...</span>
                  </div>
                ) : !isDriveConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">Connect Google Drive</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          Sign in with your Google account to back up {shopName} database records directly to your personal Google Drive storage in a normal visible folder.
                        </p>
                      </div>
                    </div>

                    {authError && (
                      <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
                        {authError}
                      </div>
                    )}

                    {/* Google Sign-in button */}
                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={isSigningIn}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-semibold text-xs flex items-center justify-center gap-3 shadow-md active:scale-95 transition-all disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                      </svg>
                      <span>{isSigningIn ? 'Connecting to Google Drive...' : 'Connect Google Drive / Re-authenticate'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Account Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-3">
                        {displayUser?.photoURL ? (
                          <img
                            src={displayUser.photoURL}
                            alt="Google Avatar"
                            className="w-10 h-10 rounded-full border border-emerald-500/40"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold">
                            {displayUser?.displayName?.[0] || displayUser?.email?.[0] || 'G'}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {displayUser?.displayName || 'Google Account'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              ✓ Connected
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono truncate max-w-[220px]">
                            {displayUser?.email || 'Active Google Session'}
                          </p>
                        </div>
                      </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={isLoadingBackups}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title="Refresh backups list"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Refresh</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>

                {/* Section 12 Status Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400">Google Drive Backup Location</div>
                    <div className="font-semibold text-white flex items-center gap-1.5 truncate">
                      <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">My Drive / {BACKUP_FOLDER_NAME}</span>
                    </div>
                    {backupFolder?.webViewLink && (
                      <a
                        href={backupFolder.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 pt-0.5"
                      >
                        <span>Open Folder in Google Drive</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400">Last Successful Backup</div>
                    <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{formatBackupDate(settings.lastBackupDate)}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Size: <span className="text-slate-300 font-mono">{settings.lastBackupFileSize || '—'}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Automatic 24h Backup</span>
                      <button
                        type="button"
                        onClick={handleToggleAutoBackup}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                          settings.automaticBackupEnabled !== false
                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {settings.automaticBackupEnabled !== false ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-300">
                      {settings.automaticBackupEnabled !== false
                        ? 'Automated daily snapshot when connected'
                        : 'Automatic cloud backup is disabled'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400">Available Cloud Backups</div>
                    <div className="font-semibold text-white font-mono flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>{backups.length} version(s) in Drive</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Includes latest + dated snapshots
                    </div>
                  </div>
                </div>

                {/* Scope error prompt */}
                {scopeError && (
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-bold">Google Drive Permissions Required</div>
                      <p className="text-[11px] text-slate-300">
                        Please re-authenticate with Google and ensure the Drive permissions are granted.
                      </p>
                      <button
                        type="button"
                        onClick={handleSignIn}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                      >
                        Grant Permissions
                      </button>
                    </div>
                  </div>
                )}

                {/* Section 12 Buttons Row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={handleBackupNow}
                    disabled={isBackingUp}
                    className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <CloudUpload className="w-4 h-4" />
                    <span>{isBackingUp ? 'Backing Up...' : '☁ Backup Now'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('restore')}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      activeTab === 'restore'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                        : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/60'
                    }`}
                  >
                    <CloudDownload className="w-4 h-4 text-blue-400" />
                    <span>☁ Restore from Drive</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('history')}
                    className={`col-span-2 sm:col-span-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      activeTab === 'history'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                        : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/60'
                    }`}
                  >
                    <History className="w-4 h-4 text-cyan-400" />
                    <span>📋 Backup History</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

          {/* 2. Primary Tabs Content (When Connected) */}
          {Boolean(currentUser && driveToken && isDriveTokenValid()) && (
            <>
              {/* RESTORE FROM GOOGLE DRIVE VIEW (Requirements 8, 9, 10) */}
              {activeTab === 'restore' && (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <CloudDownload className="w-4 h-4 text-blue-400" />
                        <span>Available Cloud Backups in Google Drive</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Discovered from "{BACKUP_FOLDER_NAME}". Select a backup to safely restore your shop database.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRefresh}
                      disabled={isLoadingBackups}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Refresh</span>
                    </button>
                  </div>

                  {isLoadingBackups ? (
                    <div className="text-center py-8 text-xs text-slate-400 flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                      <span>Loading backups from Google Drive...</span>
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 space-y-2">
                      <Folder className="w-8 h-8 text-slate-600 mx-auto" />
                      <div className="font-semibold text-slate-300">No cloud backups found yet</div>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Press "☁ Backup Now" above to create your first secure snapshot in Google Drive.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {backups.map((b) => {
                        const isLatest = b.name.includes('_Latest.json');
                        return (
                          <div
                            key={b.id}
                            className={`p-3 rounded-2xl border transition-all text-xs space-y-2 ${
                              isLatest
                                ? 'bg-gradient-to-r from-blue-950/30 to-slate-900 border-blue-500/40'
                                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white truncate max-w-[240px] sm:max-w-xs">
                                    {b.name}
                                  </span>
                                  {isLatest && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                      Latest Version
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1 font-mono">
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    {formatBackupDate(b.modifiedTime || b.createdTime)}
                                  </span>
                                  <span>·</span>
                                  <span>{formatFileSize(b.size)}</span>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleSelectBackupForRestore(b)}
                                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-95 transition-all shrink-0"
                              >
                                <CloudDownload className="w-3.5 h-3.5" />
                                <span>Restore This Backup</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* BACKUP HISTORY VIEW */}
              {activeTab === 'history' && (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <History className="w-4 h-4 text-cyan-400" />
                        <span>Dated Backup History ({backups.length})</span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Permanent snapshots stored in Google Drive. Stored independently of the device.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {backups.map((b) => (
                      <div
                        key={b.id}
                        className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-white text-[11px] truncate">{b.name}</div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{formatBackupDate(b.modifiedTime || b.createdTime)}</span>
                            <span>·</span>
                            <span>{formatFileSize(b.size)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {b.webViewLink && (
                            <a
                              href={b.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                              title="View in Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setFileToDelete(b)}
                            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                            title="Delete backup"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* OVERVIEW DISASTER RECOVERY GUIDANCE */}
              {activeTab === 'overview' && (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Disaster Recovery & Phone Replacement Guarantee</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-300">
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <strong className="text-white block text-[11px]">1. Visible Google Drive</strong>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Backups live in your normal visible "My Drive" folder. They are not tied to app cache or phone memory.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <strong className="text-white block text-[11px]">2. New Phone Ready</strong>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        If your phone is lost or reset, just install the app, sign in with {currentUser?.email || 'your Google Account'}, and restore your shop in 1 click.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                      <strong className="text-white block text-[11px]">3. Safe Rollback</strong>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Restores are atomic. An emergency safety copy is automatically taken before applying any changes.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span className="font-mono text-[10px]">
            {shopName} · {settings.ownerName} ({settings.phone})
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* SAFE RESTORE CONFIRMATION DIALOG (Requirements 9 & 10) */}
      {selectedBackupForRestore && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Restore Shop Data from Cloud?</h4>
                <p className="text-[11px] text-amber-300">
                  Restoring this backup will replace the current local shop data.
                </p>
              </div>
            </div>

            {isLoadingPreview ? (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                <span>Downloading and validating backup structure...</span>
              </div>
            ) : previewBackupData ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">File Name:</span>
                    <strong className="text-white font-mono text-[11px] truncate max-w-[200px]">
                      {selectedBackupForRestore.name}
                    </strong>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Shop Identity:</span>
                    <strong className="text-white">{previewBackupData.shopName || shopName}</strong>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Export Timestamp:</span>
                    <strong className="text-slate-300">{formatBackupDate(previewBackupData.exportedAt)}</strong>
                  </div>

                  {previewBackupData.summary && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                      <span className="text-slate-400 font-bold block">Records in this Backup:</span>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-300 font-mono">
                        <div>📦 Products: <strong className="text-white">{previewBackupData.summary.totalProducts}</strong></div>
                        <div>👥 Customers: <strong className="text-white">{previewBackupData.summary.totalCustomers}</strong></div>
                        <div>🧾 Sales/Bills: <strong className="text-white">{previewBackupData.summary.totalSales}</strong></div>
                        <div>💳 Payments: <strong className="text-white">{previewBackupData.summary.totalPayments}</strong></div>
                        <div>↩ Returns: <strong className="text-white">{previewBackupData.summary.totalReturns}</strong></div>
                        <div>🚚 Movements: <strong className="text-white">{previewBackupData.summary.totalStockMovements}</strong></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    A local safety rollback copy of your current database will be saved automatically. If any issue occurs, your data is restored instantly.
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedBackupForRestore(null);
                  setPreviewBackupData(null);
                }}
                disabled={isRestoring}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmExecuteRestore}
                disabled={isRestoring || !previewBackupData}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 active:scale-95 transition-all disabled:opacity-50"
              >
                <CloudDownload className="w-4 h-4" />
                <span>{isRestoring ? 'Restoring Database...' : 'Confirm & Restore'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESTORE SUCCESS RECEIPT MODAL */}
      {restoreReceipt && (
        <div className="fixed inset-0 z-70 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-base font-bold text-white">Database Restored Successfully!</h4>
              <p className="text-xs text-slate-400 mt-1">
                Restored from <strong className="text-emerald-300 font-mono">{restoreReceipt.backupName}</strong>
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-left text-xs font-mono space-y-1.5">
              <div className="flex justify-between"><span>Products:</span> <strong className="text-white">{restoreReceipt.counts.totalProducts}</strong></div>
              <div className="flex justify-between"><span>Customers:</span> <strong className="text-white">{restoreReceipt.counts.totalCustomers}</strong></div>
              <div className="flex justify-between"><span>Sales/Bills:</span> <strong className="text-white">{restoreReceipt.counts.totalSales}</strong></div>
              <div className="flex justify-between"><span>Payments:</span> <strong className="text-white">{restoreReceipt.counts.totalPayments}</strong></div>
              <div className="flex justify-between"><span>Returns:</span> <strong className="text-white">{restoreReceipt.counts.totalReturns}</strong></div>
              <div className="flex justify-between"><span>Stock Movements:</span> <strong className="text-white">{restoreReceipt.counts.totalStockMovements}</strong></div>
            </div>

            <button
              type="button"
              onClick={() => setRestoreReceipt(null)}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20"
            >
              Done & Return to App
            </button>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {fileToDelete && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Delete Backup from Google Drive?</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete backup <strong className="font-mono text-white">{fileToDelete.name}</strong> from your Google Drive folder?
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                {isDeleting ? 'Deleting...' : 'Delete Backup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
