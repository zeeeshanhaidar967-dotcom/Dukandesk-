import { roomDb } from '../db/roomDatabase';
import { getAccessToken, getCurrentlyAuthenticatedUser } from './googleAuthService';
import { uploadShopBackupToDrive } from './googleDriveService';

// Storage & session keys for persistent multi-device & multi-session safety
export const STORAGE_KEY_LAST_DAILY_BACKUP = 'dukandesk_last_daily_backup_iso';
export const STORAGE_KEY_LAST_LOGIN_BACKUP = 'dukandesk_last_login_backup_iso';
export const STORAGE_KEY_LAST_MANUAL_BACKUP = 'dukandesk_last_manual_backup_iso';
export const SESSION_KEY_LOGIN_BACKUP_DONE = 'dukandesk_login_backup_done_session';
export const STORAGE_KEY_CONCURRENCY_LOCK = 'dukandesk_backup_in_progress_lock';

// Policy timing thresholds
export const DAILY_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Exactly 24 hours
export const LOGIN_BACKUP_COOLDOWN_MS = 60 * 60 * 1000;      // 60 minutes minimum between login backups
export const CONCURRENCY_LOCK_TIMEOUT_MS = 2 * 60 * 1000;    // 2 minutes auto-release lock

let schedulerInterval: any = null;
let isLocalBackupRunning = false;

export interface AutoBackupResult {
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED';
  message: string;
  timestamp: string;
  fileId?: string;
  fileName?: string;
  sizeBytes?: number;
}

/**
 * Read the persistent timestamp of the last successful scheduled daily backup.
 * Checks localStorage first (immune to Firestore sync overwrites), then roomDb state.
 */
export function getPersistentDailyBackupDate(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(STORAGE_KEY_LAST_DAILY_BACKUP);
  const settings = roomDb.getState().settings;
  const fromDb = settings.lastDailyBackupDate || null;

  if (fromStorage && fromDb) {
    const timeStorage = new Date(fromStorage).getTime();
    const timeDb = new Date(fromDb).getTime();
    return !isNaN(timeStorage) && timeStorage >= timeDb ? fromStorage : fromDb;
  }
  return fromStorage || fromDb || null;
}

/**
 * Read the persistent timestamp of the last successful login backup.
 */
export function getPersistentLoginBackupDate(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_LAST_LOGIN_BACKUP) || roomDb.getState().settings.lastLoginBackupDate || null;
}

/**
 * Read the persistent timestamp of the last successful manual backup.
 */
export function getPersistentManualBackupDate(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_LAST_MANUAL_BACKUP) || roomDb.getState().settings.lastManualBackupDate || null;
}

/**
 * Cross-tab & multi-instance concurrency lock.
 * Prevents simultaneous components, tabs, or listeners from creating duplicate backups.
 */
function acquireBackupLock(triggerType: string): boolean {
  if (isLocalBackupRunning) return false;

  if (typeof window === 'undefined') {
    isLocalBackupRunning = true;
    return true;
  }

  try {
    const rawLock = localStorage.getItem(STORAGE_KEY_CONCURRENCY_LOCK);
    if (rawLock) {
      const lockData = JSON.parse(rawLock);
      const now = Date.now();
      if (lockData.expiresAt && now < lockData.expiresAt) {
        // Active lock held by another tab or process
        return false;
      }
    }

    const newLock = {
      trigger: triggerType,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + CONCURRENCY_LOCK_TIMEOUT_MS,
    };
    localStorage.setItem(STORAGE_KEY_CONCURRENCY_LOCK, JSON.stringify(newLock));
    isLocalBackupRunning = true;
    return true;
  } catch {
    isLocalBackupRunning = true;
    return true;
  }
}

function releaseBackupLock(): void {
  isLocalBackupRunning = false;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY_CONCURRENCY_LOCK);
    } catch {
      // ignore
    }
  }
}

/**
 * Core upload engine that executes a single verified Google Drive backup.
 * Preserves the exact existing serialization and upload format.
 */
async function executeBackupOperation(
  triggerType: 'DAILY' | 'LOGIN' | 'MANUAL'
): Promise<AutoBackupResult> {
  const nowIso = new Date().toISOString();
  const state = roomDb.getState();
  const settings = state.settings;

  // Verify authentication & token
  const token = await getAccessToken();
  const authUser = getCurrentlyAuthenticatedUser();
  if (!token || !authUser) {
    return {
      status: 'SKIPPED',
      message: 'Google Drive is not connected or authorization is unavailable.',
      timestamp: nowIso,
    };
  }

  try {
    // 1. Generate full validated database backup snapshot (unchanged existing format)
    const backupJson = await roomDb.exportStructuredBackupJSON();

    // 2. Upload to visible "MAHARAJA MARBLE — App Backups" folder
    const uploadResult = await uploadShopBackupToDrive(backupJson, {
      shopName: settings.shopName || 'MAHARAJA MARBLE',
      accountEmail: authUser.email || undefined,
    });

    const sizeStr = `${(uploadResult.sizeBytes / 1024).toFixed(1)} KB`;

    // 3. Persist timestamps according to the specific trigger policy
    if (triggerType === 'DAILY') {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_LAST_DAILY_BACKUP, nowIso);
      }
      roomDb.updateSettings({
        lastBackupDate: nowIso,
        lastDailyBackupDate: nowIso,
        lastBackupFileId: uploadResult.file.id,
        lastBackupFileSize: sizeStr,
        lastBackupAccount: authUser.email || undefined,
        lastAutoBackupAttempt: nowIso,
        lastAutoBackupStatus: 'SUCCESS',
      });
    } else if (triggerType === 'LOGIN') {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_LAST_LOGIN_BACKUP, nowIso);
        sessionStorage.setItem(SESSION_KEY_LOGIN_BACKUP_DONE, 'true');
      }
      roomDb.updateSettings({
        lastBackupDate: nowIso,
        lastLoginBackupDate: nowIso,
        lastBackupFileId: uploadResult.file.id,
        lastBackupFileSize: sizeStr,
        lastBackupAccount: authUser.email || undefined,
        lastAutoBackupAttempt: nowIso,
        lastAutoBackupStatus: 'SUCCESS',
      });
    } else if (triggerType === 'MANUAL') {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_LAST_MANUAL_BACKUP, nowIso);
      }
      // Note: Manual backup preserves lastDailyBackupDate so the 24h schedule is not reset!
      roomDb.updateSettings({
        lastBackupDate: nowIso,
        lastManualBackupDate: nowIso,
        lastBackupFileId: uploadResult.file.id,
        lastBackupFileSize: sizeStr,
        lastBackupAccount: authUser.email || undefined,
        lastAutoBackupAttempt: nowIso,
        lastAutoBackupStatus: 'SUCCESS',
      });
    }

    console.log(`[Backup] ${triggerType} Google Drive backup succeeded:`, uploadResult.file.name);
    return {
      status: 'SUCCESS',
      message: `Backup "${uploadResult.file.name}" saved to Google Drive.`,
      timestamp: nowIso,
      fileId: uploadResult.file.id,
      fileName: uploadResult.file.name,
      sizeBytes: uploadResult.sizeBytes,
    };
  } catch (err: any) {
    console.warn(`[Backup] ${triggerType} Google Drive backup attempt failed:`, err);
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
  }
}

// =========================================================================
// TRIGGER A: AUTOMATIC DAILY BACKUP (EVERY 24 HOURS)
// =========================================================================

/**
 * Check conditions and execute automatic daily backup if 24 hours have elapsed
 * since the previous successful scheduled daily backup.
 */
export async function checkAndRunDailyAutoBackup(force = false): Promise<AutoBackupResult> {
  const now = Date.now();
  const nowIso = new Date().toISOString();

  // 1. Verify network status
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      status: 'SKIPPED',
      message: 'Device is offline. Automatic backup deferred until internet is restored.',
      timestamp: nowIso,
    };
  }

  // 2. Check settings
  const settings = roomDb.getState().settings;
  if (!force && settings.automaticBackupEnabled === false) {
    return {
      status: 'SKIPPED',
      message: 'Automatic backup is turned OFF in settings.',
      timestamp: nowIso,
    };
  }

  // 3. Check 24-hour elapsed threshold against persistent daily backup date
  const lastDailyDate = getPersistentDailyBackupDate();
  if (!force && lastDailyDate) {
    const lastDailyTime = new Date(lastDailyDate).getTime();
    const elapsed = now - lastDailyTime;
    if (!isNaN(lastDailyTime) && elapsed < DAILY_BACKUP_INTERVAL_MS) {
      const remainingHours = Math.max(1, Math.round((DAILY_BACKUP_INTERVAL_MS - elapsed) / (1000 * 60 * 60)));
      return {
        status: 'SKIPPED',
        message: `Last daily backup was created ${Math.round(elapsed / (1000 * 60 * 60))}h ago. Next automatic backup in ~${remainingHours}h.`,
        timestamp: nowIso,
      };
    }
  }

  // 4. Acquire concurrency lock
  if (!acquireBackupLock('DAILY')) {
    return {
      status: 'SKIPPED',
      message: 'A backup operation is already running or being processed in another tab.',
      timestamp: nowIso,
    };
  }

  try {
    return await executeBackupOperation('DAILY');
  } finally {
    releaseBackupLock();
  }
}

/**
 * Backward compatibility alias for checkAndRunDailyAutoBackup
 */
export async function checkAndRunAutoBackup(force = false): Promise<AutoBackupResult> {
  return await checkAndRunDailyAutoBackup(force);
}

// =========================================================================
// TRIGGER B: BACKUP AFTER A GENUINE SUCCESSFUL LOGIN
// =========================================================================

/**
 * Execute a single backup after a genuine user login action.
 * Enforces session deduplication and a 60-minute cooldown to prevent
 * excessive backups during rapid login/logout cycles or page reloads.
 */
export async function triggerLoginBackup(): Promise<AutoBackupResult> {
  const now = Date.now();
  const nowIso = new Date().toISOString();

  // 1. Check if login backup was already created for this browser session
  if (typeof window !== 'undefined') {
    const alreadyDoneInSession = sessionStorage.getItem(SESSION_KEY_LOGIN_BACKUP_DONE);
    if (alreadyDoneInSession === 'true') {
      return {
        status: 'SKIPPED',
        message: 'Login backup already completed for this active browser session.',
        timestamp: nowIso,
      };
    }
  }

  // 2. Check 60-minute cooldown against previous login backup
  const lastLoginDate = getPersistentLoginBackupDate();
  if (lastLoginDate) {
    const lastLoginTime = new Date(lastLoginDate).getTime();
    const elapsed = now - lastLoginTime;
    if (!isNaN(lastLoginTime) && elapsed < LOGIN_BACKUP_COOLDOWN_MS) {
      // Mark current session as satisfied so page reloads don't retry
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_KEY_LOGIN_BACKUP_DONE, 'true');
      }
      const remainingMins = Math.max(1, Math.round((LOGIN_BACKUP_COOLDOWN_MS - elapsed) / 60000));
      return {
        status: 'SKIPPED',
        message: `Login backup skipped due to cooldown (${remainingMins}m remaining).`,
        timestamp: nowIso,
      };
    }
  }

  // 3. Verify online
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      status: 'SKIPPED',
      message: 'Device is offline during login.',
      timestamp: nowIso,
    };
  }

  // 4. Acquire concurrency lock
  if (!acquireBackupLock('LOGIN')) {
    return {
      status: 'SKIPPED',
      message: 'A backup operation is currently in progress.',
      timestamp: nowIso,
    };
  }

  try {
    return await executeBackupOperation('LOGIN');
  } finally {
    releaseBackupLock();
  }
}

/**
 * Reset session tracking upon explicit user logout so subsequent logins can be eligible
 */
export function resetLoginBackupSession(): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_KEY_LOGIN_BACKUP_DONE);
    } catch {
      // ignore
    }
  }
}

// =========================================================================
// TRIGGER C: MANUAL BACKUP ("BACKUP NOW")
// =========================================================================

/**
 * Execute a deliberate user-initiated manual backup from GoogleDriveModal.
 * Protected against double-clicks and concurrent executions.
 * Does NOT reset or interfere with the 24-hour daily backup schedule.
 */
export async function triggerManualBackup(): Promise<AutoBackupResult> {
  const nowIso = new Date().toISOString();

  if (!acquireBackupLock('MANUAL')) {
    return {
      status: 'SKIPPED',
      message: 'A backup operation is already running. Please wait for it to finish.',
      timestamp: nowIso,
    };
  }

  try {
    return await executeBackupOperation('MANUAL');
  } finally {
    releaseBackupLock();
  }
}

// =========================================================================
// BACKGROUND SCHEDULER
// =========================================================================

/**
 * Start the background automatic backup scheduler.
 * Runs an initial overdue check 8 seconds after app boot, then checks every 30 minutes.
 * Does NOT trigger backups on window "online" network events.
 */
export function startAutoBackupScheduler(onBackupFinished?: () => void): () => void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  // Initial overdue check 8 seconds after startup (gives app time to restore auth and DB state)
  const initialTimeout = setTimeout(() => {
    checkAndRunDailyAutoBackup(false).then((res) => {
      if (res.status === 'SUCCESS' && onBackupFinished) {
        onBackupFinished();
      }
    });
  }, 8000);

  // Periodic check every 30 minutes while app is open to catch overdue 24-hour mark
  schedulerInterval = setInterval(() => {
    checkAndRunDailyAutoBackup(false).then((res) => {
      if (res.status === 'SUCCESS' && onBackupFinished) {
        onBackupFinished();
      }
    });
  }, 30 * 60 * 1000);

  // Cleanup handler
  return () => {
    clearTimeout(initialTimeout);
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
  };
}
