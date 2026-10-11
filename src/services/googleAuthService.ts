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
 * Note: Does NOT aggressively wipe stored tokens on benign expiration to allow silent background renewal.
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
        return false;
      }
    }

    if (cachedSession?.expiresAt && Date.now() >= cachedSession.expiresAt) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a drive access token string exists in localStorage, regardless of expiration timestamp.
 */
export function hasStoredDriveToken(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const token = localStorage.getItem('drive_access_token');
    return Boolean(token && token.trim());
  } catch {
    return false;
  }
}

/**
 * Ensure Google Identity Services SDK (https://accounts.google.com/gsi/client) is loaded.
 */
export function ensureGoogleGsiLoaded(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if ((window as any).google?.accounts?.oauth2?.initTokenClient) {
          clearInterval(interval);
          resolve(true);
        } else if (attempts > 40) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if ((window as any).google?.accounts?.oauth2?.initTokenClient) {
          clearInterval(interval);
          resolve(true);
        } else if (attempts > 30) {
          clearInterval(interval);
          resolve(false);
        }
      }, 50);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

// In-flight silent refresh promise to avoid duplicate concurrent GIS requests
let silentRefreshPromise: Promise<string | null> | null = null;

/**
 * Silent Token Renewal Engine for Google Drive OAuth.
 * Inspects drive_access_token and drive_token_expires_at in localStorage.
 * If the token is expired or expiring within 5 minutes, automatically performs a silent background
 * token refresh using Google Identity Services (window.google.accounts.oauth2.initTokenClient)
 * with { prompt: '' } so no popup window is forced on the user.
 * Automatically persists the newly acquired access token and updated expiration timestamp back into localStorage.
 */
export async function getValidDriveAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const token = localStorage.getItem('drive_access_token');
    const expiresAtStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;
    const now = Date.now();

    // 5 minutes buffer = 300,000 ms
    const FIVE_MINUTES_MS = 5 * 60 * 1000;

    // 1. If valid token exists with more than 5 minutes remaining, return it immediately
    if (token && token.trim() && expiresAt > 0 && expiresAt - now > FIVE_MINUTES_MS) {
      cachedAccessToken = token;
      return token;
    }

    // 2. If no token exists at all and no persisted session, user has never authenticated
    if (!token && !hasStoredSessionInStorage()) {
      return null;
    }

    // 3. Token is expired, expiring within 5 minutes, or session exists: attempt silent renewal
    if (silentRefreshPromise) {
      return await silentRefreshPromise;
    }

    silentRefreshPromise = (async () => {
      try {
        const isGsiLoaded = await ensureGoogleGsiLoaded();
        if (!isGsiLoaded) {
          console.warn('Google Identity Services client is not available for silent token refresh.');
          if (token && expiresAt > 0 && expiresAt > now) {
            return token;
          }
          return null;
        }

        const google = (window as any).google;
        const clientId =
          firebaseConfig.oAuthClientId ||
          '1074744512406-3umppinmrr2m48f39hbloeagq3sdm2dn.apps.googleusercontent.com';

        // Known user hint helps GIS resolve the account silently without prompt
        const knownUser = auth.currentUser || cachedSession?.user || getCurrentlyAuthenticatedUser();
        const emailHint = knownUser?.email || undefined;

        const refreshedToken = await new Promise<string | null>((resolve) => {
          let settled = false;

          const timeoutTimer = setTimeout(() => {
            if (!settled) {
              settled = true;
              console.warn('Google Identity Services silent token renewal timed out.');
              if (token && expiresAt > 0 && expiresAt > now) {
                resolve(token);
              } else {
                resolve(null);
              }
            }
          }, 9000);

          try {
            const tokenClient = google.accounts.oauth2.initTokenClient({
              client_id: clientId,
              scope: SCOPES.join(' '),
              prompt: '',
              callback: (response: any) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);

                if (response && response.access_token) {
                  const expiresInSec = parseInt(response.expires_in, 10) || 3550;
                  const newExpiresAt = Date.now() + expiresInSec * 1000;
                  const newToken = response.access_token;

                  // Automatically persist new token & expiration timestamp to localStorage
                  localStorage.setItem('drive_access_token', newToken);
                  localStorage.setItem(TOKEN_EXPIRY_KEY, String(newExpiresAt));
                  cachedAccessToken = newToken;

                  if (cachedSession) {
                    cachedSession.accessToken = newToken;
                    cachedSession.expiresAt = newExpiresAt;
                    savePersistedSession(cachedSession).catch(() => {});
                  } else if (knownUser) {
                    syncGoogleDriveAuthSession(knownUser, newToken).catch(() => {});
                  }

                  // Notify listeners of updated token
                  subscribers.forEach((s) => {
                    const u = cachedSession?.user || knownUser;
                    if (u) s.success(u, newToken);
                  });

                  resolve(newToken);
                } else {
                  console.warn('Silent token renewal returned without access_token:', response?.error || response);
                  if (token && expiresAt > 0 && expiresAt > now) {
                    resolve(token);
                  } else {
                    resolve(null);
                  }
                }
              },
              error_callback: (err: any) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);
                console.warn('Google Identity Services silent refresh error:', err);
                if (token && expiresAt > 0 && expiresAt > now) {
                  resolve(token);
                } else {
                  resolve(null);
                }
              },
            });

            tokenClient.requestAccessToken({
              prompt: '',
              ...(emailHint ? { hint: emailHint } : {}),
            });
          } catch (initErr) {
            if (!settled) {
              settled = true;
              clearTimeout(timeoutTimer);
              console.warn('Failed to call GIS initTokenClient:', initErr);
              if (token && expiresAt > 0 && expiresAt > now) {
                resolve(token);
              } else {
                resolve(null);
              }
            }
          }
        });

        return refreshedToken;
      } catch (err) {
        console.warn('Silent token renewal exception:', err);
        if (token && expiresAt > 0 && expiresAt > now) {
          return token;
        }
        return null;
      } finally {
        silentRefreshPromise = null;
      }
    })();

    return await silentRefreshPromise;
  } catch (err) {
    console.warn('getValidDriveAccessToken exception:', err);
    return null;
  }
}

/**
 * Get stored drive token safely (only if not expired)
 */
export function getStoredDriveToken(): string | null {
  if (typeof window === 'undefined') return null;
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

    // Restore session into memory without clearing on benign token expiration
    // so user identity is preserved and can be silently renewed
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
 * Return currently authenticated user if known from active auth, cached session, or storage.
 * Does not return null on benign token expiration so user identity remains visible while renewing.
 */
export function getCurrentlyAuthenticatedUser(): GoogleAuthUser | User | null {
  if (auth.currentUser) return auth.currentUser;
  if (cachedSession?.user) return cachedSession.user;

  if (typeof window !== 'undefined') {
    try {
      const token = localStorage.getItem('drive_access_token');
      if (token) {
        return {
          uid: 'google-session',
          email: null,
          displayName: 'Google Account',
          photoURL: null,
        };
      }
    } catch {}
  }
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
 * Get current Google Drive OAuth access token with automatic silent renewal if expired or expiring soon.
 */
export const getAccessToken = async (): Promise<string | null> => {
  return await getValidDriveAccessToken();
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
