import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  getAuth,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';

// Provider with full Google Drive file scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

export interface GoogleAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface GoogleAuthSession {
  accessToken: string;
  savedAt: number;
  expiresAt: number; // Timestamp in ms
  user: GoogleAuthUser;
  scopes: string[];
}

const STORAGE_KEY = 'dukanmaster_gdrive_auth_session_enc';
const ENCRYPTION_SALT = 'dukanmaster_gdrive_salt_v2';
export const TOKEN_EXPIRY_KEY = 'drive_token_expires_at';

// In-memory token & session cache
let cachedAccessToken: string | null = null;
let cachedSession: GoogleAuthSession | null = null;
let isSigningIn = false;
let isRestorationInProgress = true;
let restorationPromise: Promise<GoogleAuthSession | null> | null = null;

/**
 * Synchronous check whether drive_access_token is currently present and non-expired.
 * If expired or invalid, clears it immediately and returns false.
 */
export function isDriveTokenValid(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const token = localStorage.getItem('drive_access_token');
    if (!token || !token.trim()) {
      return false;
    }

    const expiresAtStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (expiresAtStr) {
      const expiresAt = parseInt(expiresAtStr, 10);
      if (!isNaN(expiresAt) && Date.now() >= expiresAt) {
        clearAuthToken();
        return false;
      }
    }

    if (cachedSession?.expiresAt && Date.now() >= cachedSession.expiresAt) {
      clearAuthToken();
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get stored drive token safely (only if not expired)
 */
export function getStoredDriveToken(): string | null {
  if (!isDriveTokenValid()) {
    return null;
  }
  return localStorage.getItem('drive_access_token');
}

// Auth state subscribers list
type AuthCallback = (user: GoogleAuthUser | User, token: string) => void;
type AuthFailCallback = () => void;
const subscribers: { success: AuthCallback; fail: AuthFailCallback }[] = [];

/**
 * Derive AES-GCM 256-bit encryption key securely using Web Crypto API
 */
async function getCryptoKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;
  try {
    const rawKey = new TextEncoder().encode(
      `${ENCRYPTION_SALT}:${window.location.origin}:${firebaseConfig.projectId || 'dukanmaster'}`
    );
    const hash = await window.crypto.subtle.digest('SHA-256', rawKey);
    return await window.crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (err) {
    console.warn('Web Crypto key generation failed:', err);
    return null;
  }
}

/**
 * Encrypt session data using AES-GCM before saving to localStorage
 */
async function encryptSession(session: GoogleAuthSession): Promise<string> {
  const jsonStr = JSON.stringify(session);
  const key = await getCryptoKey();
  if (!key || !window.crypto?.getRandomValues) {
    // Obfuscated fallback with reverse-salt encoding
    return 'obf:' + btoa(encodeURIComponent(jsonStr));
  }

  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(jsonStr);
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer), iv.length);
    return 'enc:' + btoa(String.fromCharCode(...combined));
  } catch (e) {
    console.warn('AES-GCM encryption failed, using fallback:', e);
    return 'obf:' + btoa(encodeURIComponent(jsonStr));
  }
}

/**
 * Decrypt session data from localStorage
 */
async function decryptSession(rawCipher: string): Promise<GoogleAuthSession | null> {
  if (!rawCipher) return null;

  try {
    if (rawCipher.startsWith('obf:')) {
      const decoded = decodeURIComponent(atob(rawCipher.slice(4)));
      return JSON.parse(decoded) as GoogleAuthSession;
    }

    if (rawCipher.startsWith('enc:')) {
      const key = await getCryptoKey();
      if (!key) return null;

      const binaryStr = atob(rawCipher.slice(4));
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const iv = bytes.slice(0, 12);
      const ciphertext = bytes.slice(12);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      const jsonStr = new TextDecoder().decode(decrypted);
      return JSON.parse(jsonStr) as GoogleAuthSession;
    }
  } catch (e) {
    console.warn('Failed to decrypt stored Google Drive session:', e);
  }

  return null;
}

/**
 * Save persistent session to localStorage
 */
export async function savePersistedSession(session: GoogleAuthSession): Promise<void> {
  try {
    cachedSession = session;
    cachedAccessToken = session.accessToken;
    if (session.accessToken && typeof window !== 'undefined') {
      localStorage.setItem('drive_access_token', session.accessToken);
      if (session.expiresAt) {
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(session.expiresAt));
      }
    }
    const encrypted = await encryptSession(session);
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch (e) {
    console.warn('Failed to store Google Drive session in persistent storage:', e);
  }
}

/**
 * Clear persistent session from storage
 */
export async function clearPersistedSession(): Promise<void> {
  try {
    cachedSession = null;
    cachedAccessToken = null;
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to remove persistent session:', e);
  }
}

/**
 * Restore persistent session from localStorage on application startup
 */
export async function restorePersistedSession(): Promise<GoogleAuthSession | null> {
  if (cachedSession && cachedAccessToken && cachedSession.expiresAt > Date.now()) {
    return cachedSession;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session = await decryptSession(raw);
    if (!session || !session.accessToken) {
      await clearPersistedSession();
      return null;
    }

    // Check expiration - Google OAuth tokens expire in ~1 hour (strictly enforce expiresAt)
    if (session.expiresAt && Date.now() >= session.expiresAt) {
      console.log('Stored Google Drive session has expired. Clearing.');
      await clearPersistedSession();
      clearAuthToken();
      return null;
    }

    cachedSession = session;
    cachedAccessToken = session.accessToken;
    return session;
  } catch (err) {
    console.warn('Error restoring persisted Google session:', err);
    return null;
  }
}

/**
 * Synchronous check if a persisted session payload exists in storage
 */
export function hasStoredSessionInStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

/**
 * Check if session restoration is currently running
 */
export function isCheckingPersistedSession(): boolean {
  return isRestorationInProgress;
}

/**
 * Return currently authenticated user if already known and token is valid
 */
export function getCurrentlyAuthenticatedUser(): GoogleAuthUser | User | null {
  if (!isDriveTokenValid()) {
    return null;
  }
  if (typeof window !== 'undefined') {
    try {
      const token = localStorage.getItem('drive_access_token');
      if (token) {
        if (auth.currentUser) return auth.currentUser;
        if (cachedSession?.user) return cachedSession.user;
        return {
          uid: 'google-session',
          email: null,
          displayName: 'Google Account',
          photoURL: null,
        };
      }
    } catch {}
  }
  if (cachedSession?.user && cachedAccessToken) return cachedSession.user;
  if (auth.currentUser) return auth.currentUser;
  return null;
}

/**
 * Application startup initializer. Run once in App.tsx root.
 */
export async function initializeGoogleAuthOnStartup(): Promise<GoogleAuthSession | null> {
  if (!restorationPromise) {
    restorationPromise = restorePersistedSession().finally(() => {
      isRestorationInProgress = false;
    });
  }
  return restorationPromise;
}

// Auto-kick off restoration immediately when module loads
initializeGoogleAuthOnStartup();

/**
 * Create Google Auth Provider configured with Drive scopes
 */
export const createGoogleProvider = (forceConsent = true): GoogleAuthProvider => {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({
    prompt: forceConsent ? 'consent select_account' : 'select_account',
    access_type: 'offline',
  });
  return provider;
};

/**
 * Primary authentication listener. Checks persistent session immediately,
 * syncs with Firebase auth state, and updates subscribers.
 */
export const initAuth = (
  onAuthSuccess?: (user: GoogleAuthUser | User, token: string) => void,
  onAuthFailure?: () => void
): (() => void) => {
  const sub = {
    success: onAuthSuccess || (() => {}),
    fail: onAuthFailure || (() => {}),
  };
  subscribers.push(sub);

  // 1. If we already have a cached session or token in memory, notify immediately
  if (cachedSession && cachedAccessToken && cachedSession.expiresAt > Date.now()) {
    sub.success(cachedSession.user, cachedAccessToken);
  } else if (hasStoredSessionInStorage()) {
    // Session exists on disk; restore asynchronously and notify
    initializeGoogleAuthOnStartup().then((session) => {
      if (session && session.accessToken && session.expiresAt > Date.now()) {
        sub.success(session.user, session.accessToken);
      } else {
        sub.fail();
      }
    });
  } else {
    sub.fail();
  }

  // 2. Listen to Firebase Auth state
  const unsubscribeFirebase = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
    if (firebaseUser) {
      const session = await initializeGoogleAuthOnStartup();
      if (session && session.accessToken && session.expiresAt > Date.now()) {
        cachedSession = session;
        cachedAccessToken = session.accessToken;
        // Update user profile info from fresh Firebase user
        cachedSession.user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || cachedSession.user.displayName,
          photoURL: firebaseUser.photoURL || cachedSession.user.photoURL,
        };
        sub.success(cachedSession.user, cachedAccessToken);
      } else {
        if (!isSigningIn) {
          sub.fail();
        }
      }
    } else {
      if (cachedSession && cachedAccessToken && cachedSession.expiresAt > Date.now()) {
        sub.success(cachedSession.user, cachedAccessToken);
      } else {
        if (!isSigningIn) {
          sub.fail();
        }
      }
    }
  });

  return () => {
    const idx = subscribers.indexOf(sub);
    if (idx !== -1) subscribers.splice(idx, 1);
    unsubscribeFirebase();
  };
};

/**
 * Sign in with Google Popup and securely persist the session
 */
export const googleSignIn = async (
  forceConsent = true
): Promise<{ user: GoogleAuthUser | User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const provider = createGoogleProvider(forceConsent);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive access token from sign-in.');
    }

    const session: GoogleAuthSession = {
      accessToken: credential.accessToken,
      savedAt: Date.now(),
      expiresAt: Date.now() + 3550 * 1000, // Valid for ~1 hour
      user: {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
      },
      scopes: SCOPES,
    };

    cachedAccessToken = credential.accessToken;
    cachedSession = session;
    await savePersistedSession(session);

    // Notify all subscribers
    subscribers.forEach((s) => s.success(result.user, credential.accessToken!));

    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('Google Sign-In failed:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Synchronize OAuth access token directly from Firebase Google Sign-In flow
 */
export async function syncGoogleDriveAuthSession(
  user: User | GoogleAuthUser | { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null },
  accessToken: string
): Promise<GoogleAuthSession> {
  const session: GoogleAuthSession = {
    accessToken,
    savedAt: Date.now(),
    expiresAt: Date.now() + 3550 * 1000, // Valid for ~1 hour
    user: {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      photoURL: user.photoURL || null,
    },
    scopes: SCOPES,
  };

  cachedAccessToken = accessToken;
  cachedSession = session;
  await savePersistedSession(session);

  // Notify all Google Drive subscribers
  subscribers.forEach((s) => s.success(session.user, accessToken));

  return session;
}

/**
 * Get current Google Drive OAuth access token (strictly returns null if missing or expired)
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (!isDriveTokenValid()) {
    return null;
  }

  if (cachedAccessToken && cachedSession && cachedSession.expiresAt > Date.now()) {
    return cachedAccessToken;
  }

  if (typeof window !== 'undefined') {
    try {
      const directToken = localStorage.getItem('drive_access_token');
      if (directToken) {
        cachedAccessToken = directToken;
        return directToken;
      }
    } catch {}
  }

  const restored = await initializeGoogleAuthOnStartup();
  return restored && restored.accessToken ? restored.accessToken : null;
};

export const setAccessTokenInMemory = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined' && token) {
    try {
      localStorage.setItem('drive_access_token', token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + 3550 * 1000));
    } catch {}
  }
};

export const clearAuthToken = () => {
  cachedAccessToken = null;
  cachedSession = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('drive_access_token');
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
    } catch {}
  }
  clearPersistedSession();
};

/**
 * Explicit user sign out
 */
export const logoutGoogle = async () => {
  try {
    await auth.signOut();
  } catch (e) {
    console.warn('Firebase signOut error:', e);
  }
  clearAuthToken();
  subscribers.forEach((s) => s.fail());
};

/**
 * Prompt Google to issue a fresh access token.
 * CRITICAL: Must ONLY be called within an explicit user click event handler to prevent browser popup block!
 */
export const refreshGoogleDriveToken = async (): Promise<string | null> => {
  const authInstance = getAuth();
  const user = authInstance.currentUser || auth.currentUser;

  if (!user) return null;

  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');

  try {
    let result;
    try {
      result = await reauthenticateWithPopup(user, provider);
    } catch (reauthErr) {
      console.warn('reauthenticateWithPopup notice, attempting signInWithPopup:', reauthErr);
      result = await signInWithPopup(authInstance, provider);
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    const newToken = credential?.accessToken;

    if (newToken) {
      const expiresAt = Date.now() + 3550 * 1000;
      localStorage.setItem('drive_access_token', newToken);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
      cachedAccessToken = newToken;
      try {
        await syncGoogleDriveAuthSession(user, newToken);
      } catch {}
      return newToken;
    }
  } catch (error) {
    console.error('Failed to refresh Google Drive token:', error);
  }
  return null;
};
