import { roomDb } from '../db/roomDatabase';
import { getAccessToken, getCurrentlyAuthenticatedUser } from './googleAuthService';
import { uploadShopBackupToDrive } from './googleDriveService';

let schedulerInterval: any = null;
let isBackupRunning = false;

export interface AutoBackupResult {
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  message: string;
  timestamp: string;
}

/**
 * Check conditions and execute automatic backup if due (> 24 hours since last backup)
 */
export async function checkAndRunAutoBackup(force = false): Promise<AutoBackupResult> {
  if (isBackupRunning) {
    return {
      status: 'SKIPPED',
      message: 'Backup operation already in progress.',
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Verify network status
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      status: 'SKIPPED',
      message: 'Device is offline. Automatic backup deferred until internet is restored.',
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Check settings
  const state = roomDb.getState();
  const settings = state.settings;
  if (!force && settings.automaticBackupEnabled === false) {
    return {
      status: 'SKIPPED',
      message: 'Automatic backup is turned OFF in settings.',
      timestamp: new Date().toISOString(),
    };
  }

  // 3. Check authentication status
  const token = await getAccessToken();
  const authUser = getCurrentlyAuthenticatedUser();
  if (!token || !authUser) {
    return {
      status: 'SKIPPED',
      message: 'Google Drive is not connected. Connect account to enable cloud backups.',
      timestamp: new Date().toISOString(),
    };
  }

  // 4. Check time elapsed since last successful backup (24 hours threshold)
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  if (!force && settings.lastBackupDate) {
    const lastBackupTime = new Date(settings.lastBackupDate).getTime();
    const elapsed = Date.now() - lastBackupTime;
    if (!isNaN(lastBackupTime) && elapsed < TWENTY_FOUR_HOURS_MS) {
      const remainingHours = Math.round((TWENTY_FOUR_HOURS_MS - elapsed) / (1000 * 60 * 60));
      return {
        status: 'SKIPPED',
        message: `Last backup was created ${Math.round(elapsed / (1000 * 60 * 60))}h ago. Next automatic backup in ~${remainingHours}h.`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // 5. Execute safe backup
  isBackupRunning = true;
  const nowIso = new Date().toISOString();

  try {
    const backupJson = await roomDb.exportStructuredBackupJSON();
    const uploadResult = await uploadShopBackupToDrive(backupJson, {
      shopName: settings.shopName || 'MAHARAJA MARBLE',
      accountEmail: authUser.email || undefined,
    });

    // Update settings in database
    const sizeStr = `${(uploadResult.sizeBytes / 1024).toFixed(1)} KB`;
    roomDb.updateSettings({
      lastBackupDate: nowIso,
      lastBackupFileId: uploadResult.file.id,
      lastBackupFileSize: sizeStr,
      lastBackupAccount: authUser.email || undefined,
      lastAutoBackupAttempt: nowIso,
      lastAutoBackupStatus: 'SUCCESS',
    });

    console.log('Automatic Google Drive backup completed successfully:', uploadResult.file.name);
    return {
      status: 'SUCCESS',
      message: `Backup "${uploadResult.file.name}" saved to Google Drive.`,
      timestamp: nowIso,
    };
  } catch (err: any) {
    console.warn('Automatic Google Drive backup attempt failed:', err);
    try {
      roomDb.updateSettings({
        lastAutoBackupAttempt: nowIso,
        lastAutoBackupStatus: 'FAILED',
      });
    } catch {
      // ignore
    }
    return {
      status: 'FAILED',
      message: err.message || 'Cloud backup failed due to network or authorization error.',
      timestamp: nowIso,
    };
  } finally {
    isBackupRunning = false;
  }
}

/**
 * Start the background automatic backup scheduler.
 * Runs on startup, when returning online, and periodically checks every 30 minutes.
 */
export function startAutoBackupScheduler(onBackupFinished?: () => void): () => void {
  // Clear any existing timer
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Initial check shortly after startup (give app 5 seconds to load state)
  const initialTimeout = setTimeout(() => {
    checkAndRunAutoBackup(false).then((res) => {
      if (res.status === 'SUCCESS' && onBackupFinished) {
        onBackupFinished();
      }
    });
  }, 5000);

  // Periodic check every 30 minutes
  schedulerInterval = setInterval(() => {
    checkAndRunAutoBackup(false).then((res) => {
      if (res.status === 'SUCCESS' && onBackupFinished) {
        onBackupFinished();
      }
    });
  }, 30 * 60 * 1000);

  // Online network restoration listener
  const handleOnline = () => {
    console.log('Network connected. Checking automatic backup...');
    checkAndRunAutoBackup(false).then((res) => {
      if (res.status === 'SUCCESS' && onBackupFinished) {
        onBackupFinished();
      }
    });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  // Cleanup handler
  return () => {
    clearTimeout(initialTimeout);
    if (schedulerInterval) clearInterval(schedulerInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline);
    }
  };
}
