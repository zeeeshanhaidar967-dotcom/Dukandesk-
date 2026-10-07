import {
  getAccessToken,
  clearAuthToken,
  clearPersistedSession,
  refreshGoogleDriveToken,
  isDriveTokenValid,
} from './googleAuthService';

export { refreshGoogleDriveToken };

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  description?: string;
}

export interface DriveStorageInfo {
  limit?: string;
  usage?: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
}

export const BACKUP_FOLDER_NAME = 'MAHARAJA MARBLE — App Backups';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Core authenticated fetch wrapper for all Google Drive API requests:
 * 1. Checks if a valid token exists BEFORE making any fetch call.
 *    If no token is present or token is expired, does NOT make the fetch call to avoid 403 / "Method doesn't allow unregistered callers" errors.
 * 2. Includes Authorization: Bearer <token> header.
 * 3. Does NOT automatically trigger signInWithPopup or refresh popups. If 401 is received,
 *    clears the expired token and throws so the UI prompts the user to re-authenticate via a button click.
 * 4. Catches 403 "unregistered callers" errors, clears invalid tokens, and safely informs the UI without popup spam.
 */
export async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getEffectiveToken();
  if (!token) {
    throw new Error('Google Drive is not connected or session expired. Please connect your account first.');
  }

  const reqHeaders = new Headers(init.headers || {});
  reqHeaders.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, {
    ...init,
    headers: reqHeaders,
  });

  // If 401 Unauthorized, clear expired token and prompt user-initiated reconnect
  if (res.status === 401) {
    console.warn('Google Drive API returned 401 Unauthorized (token expired). Clearing token.');
    clearAuthToken();
    throw new Error('Google Drive session expired. Please click "Re-authenticate" or "Connect Google Drive".');
  }

  // If 403 Forbidden
  if (res.status === 403) {
    const errorBody = await res.json().catch(() => null);
    const errMsg = errorBody?.error?.message || '';
    console.warn('Google Drive API returned 403:', errMsg);

    if (
      errMsg.toLowerCase().includes('unregistered caller') ||
      errMsg.toLowerCase().includes('identity') ||
      errMsg.toLowerCase().includes('invalid credential')
    ) {
      clearAuthToken();
      throw new Error('Google Drive session invalid or expired. Please click "Re-authenticate" or "Connect Google Drive".');
    }

    throw new Error(errMsg || 'Google Drive permission required (403). Please click "Re-authenticate" to grant permissions.');
  }

  return res;
}

/**
 * Helper to get active Google Drive OAuth token from memory, session, or direct localStorage.
 * Strictly verifies token validity and non-expiration; returns null if missing or expired.
 */
export const getEffectiveToken = async (): Promise<string | null> => {
  if (!isDriveTokenValid()) {
    clearAuthToken();
    return null;
  }
  return await getAccessToken();
};

/**
 * Locate or create the visible normal Google Drive folder in user's "My Drive".
 * Folder name: MAHARAJA MARBLE — App Backups
 */
export const getOrCreateBackupFolder = async (): Promise<{
  id: string;
  name: string;
  webViewLink?: string;
}> => {
  const token = await getEffectiveToken();
  if (!token) throw new Error('Not authenticated with Google Drive.');

  // 1. Search for existing visible folder in My Drive
  const cleanFolderName = BACKUP_FOLDER_NAME.replace(/'/g, "\\'");
  const folderQuery = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${cleanFolderName}' and trashed = false`
  );

  const searchRes = await driveFetch(
    `${DRIVE_API_URL}/files?q=${folderQuery}&fields=files(id, name, webViewLink)&pageSize=1`
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0];
    }
  }

  // 2. Folder does not exist yet: create in user's normal My Drive root
  const createRes = await driveFetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Official backup storage for MAHARAJA MARBLE Shop Management App',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => null);
    throw new Error(err?.error?.message || 'Failed to create backup folder in Google Drive.');
  }

  return await createRes.json();
};

/**
 * Upload a verified, structured JSON shop database backup directly to the
 * "MAHARAJA MARBLE — App Backups" folder in Google Drive.
 *
 * Saves a timestamped version (e.g. MAHARAJA_MARBLE_Backup_2026-09-30_19-30-00.json)
 * and updates MAHARAJA_MARBLE_Backup_Latest.json.
 */
export const uploadShopBackupToDrive = async (
  jsonData: string,
  options?: {
    shopName?: string;
    accountEmail?: string;
  }
): Promise<{
  file: GoogleDriveFile;
  folder: { id: string; name: string; webViewLink?: string };
  formattedDate: string;
  sizeBytes: number;
}> => {
  const token = await getEffectiveToken();
  if (!token) throw new Error('Not authenticated with Google Drive. Please sign in first.');

  // 1. Get or create the normal visible folder in My Drive
  const folder = await getOrCreateBackupFolder();

  // 2. Build unique timestamped filename: MAHARAJA_MARBLE_Backup_YYYY-MM-DD_HH-mm-ss.json
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const fileName = `MAHARAJA_MARBLE_Backup_${dateStr}.json`;

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: `Complete database backup for MAHARAJA MARBLE (HAIDAR ALI) generated on ${now.toLocaleString('en-IN')}`,
    parents: [folder.id],
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    jsonData +
    closeDelimiter;

  const res = await driveFetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    if (res.status === 401) {
      await clearPersistedSession();
      clearAuthToken();
      throw new Error('Google Drive session expired. Please sign in again.');
    }
    const errorJson = await res.json().catch(() => null);
    throw new Error(errorJson?.error?.message || 'Failed to upload backup to Google Drive.');
  }

  const uploadedFile: GoogleDriveFile = await res.json();

  // 3. Verify upload was received by checking file metadata
  try {
    const verifyRes = await driveFetch(
      `${DRIVE_API_URL}/files/${uploadedFile.id}?fields=id,name,size,createdTime,webViewLink`
    );
    if (verifyRes.ok) {
      const verifiedData = await verifyRes.json();
      uploadedFile.size = verifiedData.size;
      uploadedFile.createdTime = verifiedData.createdTime;
      uploadedFile.webViewLink = verifiedData.webViewLink;
    }
  } catch (e) {
    console.warn('Metadata verification check warning:', e);
  }

  // 4. Also update MAHARAJA_MARBLE_Backup_Latest.json in the same folder
  try {
    const latestQuery = encodeURIComponent(
      `'${folder.id}' in parents and name = 'MAHARAJA_MARBLE_Backup_Latest.json' and trashed = false`
    );
    const latestSearch = await driveFetch(`${DRIVE_API_URL}/files?q=${latestQuery}&fields=files(id)&pageSize=1`);

    let latestId: string | null = null;
    if (latestSearch.ok) {
      const data = await latestSearch.json();
      if (data.files && data.files.length > 0) {
        latestId = data.files[0].id;
      }
    }

    const latestMeta = {
      name: 'MAHARAJA_MARBLE_Backup_Latest.json',
      mimeType: 'application/json',
      description: `Latest verified database backup for MAHARAJA MARBLE updated on ${now.toLocaleString('en-IN')}`,
      ...(latestId ? {} : { parents: [folder.id] }),
    };

    const latestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(latestMeta) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      jsonData +
      closeDelimiter;

    const latestUrl = latestId
      ? `${DRIVE_UPLOAD_URL}/files/${latestId}?uploadType=multipart`
      : `${DRIVE_UPLOAD_URL}/files?uploadType=multipart`;

    await driveFetch(latestUrl, {
      method: latestId ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: latestBody,
    });
  } catch (e) {
    console.warn('Non-critical: Latest copy update failed, versioned file is safe:', e);
  }

  return {
    file: uploadedFile,
    folder,
    formattedDate: now.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    sizeBytes: new Blob([jsonData]).size,
  };
};

/**
 * List shop backups from Google Drive folder "MAHARAJA MARBLE — App Backups".
 * If on a brand-new device or fresh install, seamlessly locates the folder
 * in the user's My Drive or discovers any previous MAHARAJA_MARBLE_Backup files.
 */
export const listShopBackupsFromDrive = async (): Promise<{
  folder: { id: string; name: string; webViewLink?: string } | null;
  backups: GoogleDriveFile[];
}> => {
  const token = await getEffectiveToken();
  if (!token) {
    return { folder: null, backups: [] };
  }

  let folder: { id: string; name: string; webViewLink?: string } | null = null;
  try {
    folder = await getOrCreateBackupFolder();
  } catch (e) {
    console.warn('Could not locate folder directly, discovering backups globally across Drive:', e);
  }

  const conditions: string[] = ['trashed = false'];
  if (folder?.id) {
    conditions.push(
      `('${folder.id}' in parents or name contains 'MAHARAJA_MARBLE_Backup' or name contains 'DukanMaster_Backup')`
    );
  } else {
    conditions.push("(name contains 'MAHARAJA_MARBLE_Backup' or name contains 'DukanMaster_Backup')");
  }

  const qParam = encodeURIComponent(conditions.join(' and '));
  const fields = encodeURIComponent(
    'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, iconLink, description)'
  );

  const res = await driveFetch(
    `${DRIVE_API_URL}/files?q=${qParam}&fields=${fields}&pageSize=50&orderBy=modifiedTime desc`
  );

  if (!res.ok) {
    if (res.status === 401) {
      await clearPersistedSession();
      clearAuthToken();
      throw new Error('Google Drive session expired. Please sign in again.');
    }
    const errorJson = await res.json().catch(() => null);
    throw new Error(errorJson?.error?.message || `Failed to fetch backups (${res.status})`);
  }

  const data = await res.json();
  const allFiles: GoogleDriveFile[] = data.files || [];

  // Filter and sort backups (excluding non-backup files)
  const backups = allFiles.filter(
    (f) =>
      f.name.includes('MAHARAJA_MARBLE_Backup') ||
      f.name.includes('DukanMaster_Backup') ||
      f.name.endsWith('.json')
  );

  return {
    folder,
    backups,
  };
};

/**
 * Generic files listing in Drive for the file browser tab
 */
export const listDriveFiles = async (options?: {
  searchQuery?: string;
  onlyBackups?: boolean;
  pageSize?: number;
}): Promise<GoogleDriveFile[]> => {
  const conditions: string[] = ['trashed = false'];

  if (options?.onlyBackups) {
    conditions.push(
      "(name contains 'MAHARAJA_MARBLE_Backup' or name contains 'DukanMaster_Backup' or name contains 'ShopBackup')"
    );
  }

  if (options?.searchQuery && options.searchQuery.trim()) {
    const cleanQ = options.searchQuery.replace(/'/g, "\\'");
    conditions.push(`name contains '${cleanQ}'`);
  }

  const qParam = encodeURIComponent(conditions.join(' and '));
  const fields = encodeURIComponent(
    'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, iconLink, description)'
  );
  const pageSize = options?.pageSize || 30;

  const url = `${DRIVE_API_URL}/files?q=${qParam}&fields=${fields}&pageSize=${pageSize}&orderBy=modifiedTime desc`;

  const res = await driveFetch(url);

  if (!res.ok) {
    if (res.status === 401) {
      await clearPersistedSession();
      clearAuthToken();
      throw new Error('Google Drive session expired. Please sign in again.');
    }
    const errorJson = await res.json().catch(() => null);
    throw new Error(
      errorJson?.error?.message || `Failed to fetch files from Google Drive (${res.status})`
    );
  }

  const data = await res.json();
  return data.files || [];
};

/**
 * Get Google Drive storage quota
 */
export const getDriveQuota = async (): Promise<{
  quota: DriveStorageInfo;
  user: { displayName?: string; emailAddress?: string; photoLink?: string };
}> => {
  const res = await driveFetch(`${DRIVE_API_URL}/about?fields=storageQuota,user`);

  if (!res.ok) {
    throw new Error('Failed to fetch Drive quota');
  }

  const data = await res.json();
  return {
    quota: data.storageQuota || {},
    user: data.user || {},
  };
};

/**
 * Upload a JSON database backup directly to Google Drive (alias for backward compatibility)
 */
export const uploadDatabaseBackupToDrive = async (
  jsonData: string,
  shopName: string
): Promise<GoogleDriveFile> => {
  const res = await uploadShopBackupToDrive(jsonData, { shopName });
  return res.file;
};

/**
 * Upload a generic file (receipt, invoice, document, brochure) to Google Drive
 */
export const uploadGenericFileToDrive = async (
  file: File,
  customName?: string
): Promise<GoogleDriveFile> => {
  const folder = await getOrCreateBackupFolder().catch(() => null);

  const fileName = customName || file.name;
  const metadata = {
    name: fileName,
    mimeType: file.type || 'application/octet-stream',
    description: 'Uploaded via MAHARAJA MARBLE shop management app',
    ...(folder?.id ? { parents: [folder.id] } : {}),
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const fileArrayBuffer = await file.arrayBuffer();

  const metadataPart = new Blob([
    delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
  ]);

  const closePart = new Blob([closeDelimiter]);
  const bodyBlob = new Blob([metadataPart, fileArrayBuffer, closePart]);

  const res = await driveFetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: bodyBlob,
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => null);
    throw new Error(errorJson?.error?.message || 'Failed to upload file to Google Drive');
  }

  return await res.json();
};

/**
 * Download file text/json content from Google Drive (used for database restoration)
 */
export const downloadDriveFileText = async (fileId: string): Promise<string> => {
  const res = await driveFetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`);

  if (!res.ok) {
    throw new Error(`Failed to download file from Google Drive (${res.status})`);
  }

  return await res.text();
};

/**
 * Delete a file from Google Drive (Mandatory user confirmation must precede this call)
 */
export const deleteDriveFile = async (fileId: string): Promise<void> => {
  const res = await driveFetch(`${DRIVE_API_URL}/files/${fileId}`, {
    method: 'DELETE',
  });

  if (!res.ok && res.status !== 204) {
    const errorJson = await res.json().catch(() => null);
    throw new Error(errorJson?.error?.message || 'Failed to delete file from Google Drive');
  }
};
