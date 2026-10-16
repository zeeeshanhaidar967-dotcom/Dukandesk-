import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User as FirebaseUser,
  getAuth,
  signInWithCredential,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, db } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { AppUserProfile, AppUserRole, AppUserStatus } from '../types/database';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';
import { syncGoogleDriveAuthSession, SCOPES } from './googleAuthService';

// Bootstrap Primary Administrators
export interface PrimaryAdminConfig {
  email: string;
  name: string;
}

export const PRIMARY_ADMINS: PrimaryAdminConfig[] = [
  { email: 'hmotor786@gmail.com', name: 'Haidar ali' },
  { email: 'zeeeshanhaidar967@gmail.com', name: 'ZEESHAN HAIDAR' },
];

export const PRIMARY_ADMIN_EMAILS = PRIMARY_ADMINS.map((a) => a.email.toLowerCase().trim());

export function isPrimaryAdmin(email?: string | null): boolean {
  if (!email) return false;
  return PRIMARY_ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export function getPrimaryAdminName(email?: string | null): string | null {
  if (!email) return null;
  const match = PRIMARY_ADMINS.find((a) => a.email.toLowerCase().trim() === email.toLowerCase().trim());
  return match ? match.name : null;
}

export const BOOTSTRAP_ADMIN_EMAIL = 'hmotor786@gmail.com';
export const BOOTSTRAP_ADMIN_NAME = 'Haidar ali';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface LoginGoogleResult {
  user: FirebaseUser;
  accessToken?: string;
  driveConnected?: boolean;
  driveMessage?: string;
}

// Sign in with Google (Native on Android/iOS, Popup on Web) with separated Drive permissions
export async function loginWithGoogle(): Promise<LoginGoogleResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      // Step 1: Core native Google Sign-In (WITHOUT Drive scopes to ensure authentication always succeeds)
      console.log('Google Sign-In: initiating native sign-in...');
      let result;
      try {
        result = await FirebaseAuthentication.signInWithGoogle();
      } catch (firstErr: any) {
        console.warn('Native signInWithGoogle first attempt notice:', firstErr);
        console.log('Full native sign-in first error object:', firstErr);
        try {
          console.log('Full native sign-in first error JSON:', JSON.stringify(firstErr, Object.getOwnPropertyNames(firstErr), 2));
        } catch {}

        // In Android 13/14, Credential Manager may cancel prematurely or report "activity is cancelled by the user".
        // Attempt with useCredentialManager: false (legacy GoogleSignInClient) which either completes successfully
        // or exposes the underlying native ApiException status code (e.g. 10 DEVELOPER_ERROR, 12500, 12501).
        try {
          console.log('Attempting native signInWithGoogle with useCredentialManager: false...');
          result = await FirebaseAuthentication.signInWithGoogle({
            useCredentialManager: false,
          });
          console.log('Native signInWithGoogle with useCredentialManager: false succeeded!');
        } catch (fallbackErr: any) {
          console.error('Native signInWithGoogle fallback also failed:', fallbackErr);
          console.log('Full native sign-in fallback error object:', fallbackErr);
          try {
            console.log('Full native sign-in fallback error JSON:', JSON.stringify(fallbackErr, Object.getOwnPropertyNames(fallbackErr), 2));
          } catch {}

          // Retain all codes, status numbers, and messages across both attempts
          const fullErr: any = new Error(fallbackErr?.message || firstErr?.message || 'Native sign-in failed');
          fullErr.code = fallbackErr?.code || firstErr?.code || 'AUTH_ERROR';
          fullErr.firstAttemptError = firstErr?.message || String(firstErr);
          fullErr.fallbackError = fallbackErr?.message || String(fallbackErr);
          fullErr.firstAttemptCode = firstErr?.code;
          fullErr.fallbackCode = fallbackErr?.code;
          fullErr.firstAttemptData = firstErr?.data;
          fullErr.fallbackData = fallbackErr?.data;

          for (const key of Object.getOwnPropertyNames(firstErr || {})) {
            if (key !== 'stack' && !(key in fullErr)) {
              fullErr[`first_${key}`] = firstErr[key];
            }
          }
          for (const key of Object.getOwnPropertyNames(fallbackErr || {})) {
            if (key !== 'stack' && !(key in fullErr)) {
              fullErr[key] = fallbackErr[key];
            }
          }

          throw fullErr;
        }
      }

      console.log('Google Sign-In: account chosen:', Boolean(result));

      const idToken = result.credential?.idToken || (result as any).idToken;
      let accessToken = result.credential?.accessToken || (result as any).accessToken;

      console.log('Google Sign-In: idToken received:', Boolean(idToken));
      console.log('Google Sign-In: accessToken received:', Boolean(accessToken));

      if (!idToken && !accessToken) {
        const noCredErr: any = new Error('Google Sign-In completed but no authentication credentials were returned.');
        noCredErr.code = 'NO_CREDENTIALS';
        throw noCredErr;
      }

      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const userCredential = await signInWithCredential(auth, credential);
      const user = userCredential.user;

      console.log('Google Sign-In: signInWithCredential result:', Boolean(user?.uid));

      // Step 2: Separate Google Drive Scope Request (Optional; failure does NOT cancel login)
      let driveConnected = false;
      let driveMessage: string | undefined;

      try {
        console.log('Google Sign-In: requesting separate Google Drive permissions...');
        let driveResult;
        try {
          driveResult = await FirebaseAuthentication.signInWithGoogle({
            scopes: SCOPES,
          });
        } catch {
          driveResult = await FirebaseAuthentication.signInWithGoogle({
            scopes: SCOPES,
            useCredentialManager: false,
          });
        }

        const driveAccessToken = driveResult.credential?.accessToken || (driveResult as any).accessToken;
        console.log('Google Sign-In: Drive accessToken received:', Boolean(driveAccessToken));

        if (driveAccessToken) {
          accessToken = driveAccessToken;
          localStorage.setItem('drive_access_token', driveAccessToken);
          localStorage.setItem('drive_token_expires_at', String(Date.now() + 3550 * 1000));
          await syncGoogleDriveAuthSession(user, driveAccessToken);
          driveConnected = true;
        } else {
          driveConnected = false;
          driveMessage = 'Drive backup is not connected.';
        }
      } catch (driveErr: any) {
        console.warn('Google Drive permission step notice (login not affected):', driveErr?.message || driveErr);
        driveConnected = false;
      }

      return { user, accessToken: accessToken || undefined, driveConnected, driveMessage };
    } catch (err: any) {
      console.error('Native Google Sign-In failed:', err);
      console.log('Full Google Sign-In error object:', err);
      try {
        console.log('Full Google Sign-In error JSON:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      } catch {}
      throw err;
    }
  }

  // Web Flow:
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({
      prompt: 'select_account',
      access_type: 'offline',
    });

    const result = await signInWithPopup(auth, provider);
    console.log('Google Sign-In: account chosen:', Boolean(result));

    const credential = GoogleAuthProvider.credentialFromResult(result);
    const idToken = credential?.idToken;
    const token = credential?.accessToken;

    console.log('Google Sign-In: idToken received:', Boolean(idToken));
    console.log('Google Sign-In: accessToken received:', Boolean(token));

    const user = result.user;
    console.log('Google Sign-In: signInWithCredential result:', Boolean(user?.uid));

    let driveConnected = false;
    let driveMessage: string | undefined;

    if (token) {
      try {
        localStorage.setItem('drive_access_token', token);
        localStorage.setItem('drive_token_expires_at', String(Date.now() + 3550 * 1000));
        await syncGoogleDriveAuthSession(user, token);
        driveConnected = true;
      } catch (err) {
        console.warn('Notice syncing Google Drive session:', err);
        driveConnected = false;
        driveMessage = 'Drive backup is not connected.';
      }
    } else {
      driveConnected = false;
      driveMessage = 'Drive backup is not connected.';
    }

    return { user, accessToken: token || undefined, driveConnected, driveMessage };
  } catch (err: any) {
    console.error('Web Google Sign-In failed:', err);
    console.log('Full Google Sign-In error object:', err);
    try {
      console.log('Full Google Sign-In error JSON:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    } catch {}
    throw err;
  }
}

// Sign in with Email and Password
export async function loginWithEmail(email: string, pass: string): Promise<FirebaseUser> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
  return result.user;
}

// Register with Email and Password (Self-service fallback)
export async function registerWithEmail(name: string, email: string, pass: string): Promise<FirebaseUser> {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  const user = result.user;
  const isOwner = isPrimaryAdmin(user.email);
  const defaultAdminName = getPrimaryAdminName(user.email);
  const now = new Date().toISOString();
  const displayName = name.trim() || user.displayName || defaultAdminName || (user.email ? user.email.split('@')[0] : 'User');

  const profile: AppUserProfile = {
    uid: user.uid,
    userId: user.uid,
    displayName,
    name: displayName,
    email: user.email || email.trim(),
    role: isOwner ? 'admin' : 'viewer',
    signUpDate: now,
    lastLogin: now,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'users', user.uid), profile);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }

  return user;
}

// Storage key for instant local profile hydration on startup
const PROFILE_CACHE_KEY_PREFIX = 'dukandesk_profile_';

export function getCachedUserProfile(uid: string): AppUserProfile | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = localStorage.getItem(`${PROFILE_CACHE_KEY_PREFIX}${uid}`);
    if (raw) {
      return JSON.parse(raw) as AppUserProfile;
    }
  } catch (err) {
    console.warn('Notice reading cached user profile:', err);
  }
  return null;
}

export function setCachedUserProfile(profile: AppUserProfile): void {
  if (typeof window === 'undefined' || !profile?.uid) return;
  try {
    localStorage.setItem(`${PROFILE_CACHE_KEY_PREFIX}${profile.uid}`, JSON.stringify(profile));
  } catch (err) {
    console.warn('Notice saving cached user profile:', err);
  }
}

export function clearCachedUserProfile(uid?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (uid) {
      localStorage.removeItem(`${PROFILE_CACHE_KEY_PREFIX}${uid}`);
    } else {
      // Clear any profile cache
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PROFILE_CACHE_KEY_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    }
  } catch (err) {
    console.warn('Notice clearing cached user profile:', err);
  }
}

// User Document Mapper: Tolerant of optional fields and correctly maps uid, userId, name, displayName, role, etc.
export function mapFirestoreUserDoc(docId: string, raw: any): AppUserProfile {
  const d = raw || {};
  const resolvedId = String(d.uid || d.userId || docId);
  const resolvedName = String(d.displayName || d.name || (d.email ? d.email.split('@')[0] : 'User'));

  return {
    uid: resolvedId,
    userId: String(d.userId || d.uid || docId),
    displayName: resolvedName,
    name: String(d.name || d.displayName || resolvedName),
    email: String(d.email || ''),
    role: (d.role === 'admin' ? 'admin' : 'viewer') as AppUserRole,
    status: (d.status as AppUserStatus) || 'active',
    signUpDate: d.signUpDate ? String(d.signUpDate) : (d.createdAt ? String(d.createdAt) : ''),
    lastLogin: d.lastLogin ? String(d.lastLogin) : '',
    createdAt: d.createdAt ? String(d.createdAt) : (d.signUpDate ? String(d.signUpDate) : ''),
    updatedAt: d.updatedAt ? String(d.updatedAt) : '',
    createdBy: d.createdBy ? String(d.createdBy) : undefined,
  };
}

// Logout
export async function logoutAppUser(): Promise<void> {
  clearCachedUserProfile();
  try {
    localStorage.removeItem('drive_access_token');
    localStorage.removeItem('drive_token_expires_at');
  } catch {}
  await signOut(auth);
}

// Ensure user profile in Firestore (Cloud Firestore is the Source of Truth)
export async function syncUserProfile(user: FirebaseUser): Promise<AppUserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const userEmail = (user.email || '').toLowerCase().trim();
  const isOwner = isPrimaryAdmin(userEmail);
  const primaryAdminName = getPrimaryAdminName(userEmail);
  const now = new Date().toISOString();

  // 1. Read cached profile if available for fast startup hydration
  const cached = getCachedUserProfile(user.uid);
  const existingRole: AppUserRole = isOwner ? 'admin' : (cached?.role || 'viewer');
  const fallbackName = primaryAdminName || (user.email ? user.email.split('@')[0] : 'User');
  const displayName = cached?.displayName || user.displayName || fallbackName;

  const baselineProfile: AppUserProfile = {
    uid: user.uid,
    userId: user.uid,
    displayName: isOwner && (!displayName || displayName === 'User') && primaryAdminName ? primaryAdminName : displayName,
    name: isOwner && (!displayName || displayName === 'User') && primaryAdminName ? primaryAdminName : displayName,
    email: user.email || cached?.email || '',
    role: existingRole,
    signUpDate: cached?.signUpDate || cached?.createdAt || now,
    lastLogin: now,
    status: cached?.status || 'active',
    createdAt: cached?.createdAt || cached?.signUpDate || now,
    updatedAt: now,
  };

  // 2. Cloud synchronization: Query Firestore to get true authoritative role & profile
  try {
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const cloudProfile = mapFirestoreUserDoc(snap.id, snap.data());
      // Primary admin accounts retain permanent admin authority
      if (isOwner) {
        if (cloudProfile.role !== 'admin') cloudProfile.role = 'admin';
        if ((!cloudProfile.displayName || cloudProfile.displayName === 'User') && primaryAdminName) {
          cloudProfile.displayName = primaryAdminName;
          cloudProfile.name = primaryAdminName;
        }
      }
      setCachedUserProfile(cloudProfile);

      // Touch lastLogin on Firestore non-destructively
      setDoc(userRef, { lastLogin: now, updatedAt: now }, { merge: true }).catch((e) =>
        console.warn('Notice updating lastLogin on Firestore:', e)
      );
      return cloudProfile;
    } else {
      // 1. Check if an admin pre-provisioned an authorization record with their email
      const preProvisionedId = 'usr_' + userEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
      let assignedRole: AppUserRole = baselineProfile.role;
      let assignedDisplayName = baselineProfile.displayName;

      try {
        const preSnap = await getDoc(doc(db, 'users', preProvisionedId));
        if (preSnap.exists()) {
          const preData = preSnap.data();
          if (preData.role) assignedRole = preData.role;
          if (preData.displayName) assignedDisplayName = preData.displayName;
          // Clean up the temporary pre-provisioned stub document
          deleteDoc(doc(db, 'users', preProvisionedId)).catch(() => {});
        }
      } catch {
        // Ignore lookup error if permission denied
      }

      const finalizedProfile: AppUserProfile = {
        ...baselineProfile,
        displayName: assignedDisplayName,
        name: assignedDisplayName,
        role: isOwner ? 'admin' : assignedRole,
      };

      try {
        await setDoc(userRef, finalizedProfile);
        setCachedUserProfile(finalizedProfile);
        return finalizedProfile;
      } catch (writeErr) {
        console.warn('Notice creating initial user profile document in Firestore:', writeErr);
        return cached || finalizedProfile;
      }
    }
  } catch (error) {
    console.warn('Notice during user profile sync from Firestore:', error);
    return cached || baselineProfile;
  }
}

// Subscribe to current user profile updates
export function subscribeToUserProfile(
  userId: string,
  onProfile: (profile: AppUserProfile | null) => void,
  onError?: (err: Error) => void
): () => void {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(
    userRef,
    (snap) => {
      if (snap.exists()) {
        const profile = mapFirestoreUserDoc(snap.id, snap.data());
        setCachedUserProfile(profile);
        onProfile(profile);
      }
    },
    (error) => {
      console.warn('User profile listener notice:', error);
      if (onError) onError(error);
    }
  );
}

// Direct one-time fetch of all users from Firestore
export async function loadAllUsersOnce(): Promise<AppUserProfile[]> {
  try {
    const usersCol = collection(db, 'users');
    let snapshot;
    try {
      snapshot = await getDocsFromServer(usersCol);
    } catch {
      snapshot = await getDocs(usersCol);
    }
    const list: AppUserProfile[] = [];
    snapshot.forEach((snap: QueryDocumentSnapshot<DocumentData>) => {
      list.push(mapFirestoreUserDoc(snap.id, snap.data()));
    });
    list.sort((a, b) => {
      const roleOrder: Record<string, number> = { admin: 1, viewer: 2 };
      const orderA = roleOrder[a.role] || 99;
      const orderB = roleOrder[b.role] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.displayName.localeCompare(b.displayName);
    });
    return list;
  } catch (error: any) {
    console.error('loadAllUsersOnce error from Firestore:', error);
    throw error;
  }
}

// ADMIN USER MANAGEMENT FUNCTIONS

// Subscribe to all users in Firestore (Admin)
export function subscribeToAllUsers(
  onUsers: (users: AppUserProfile[]) => void,
  onError?: (err: Error) => void
): () => void {
  const usersCol = collection(db, 'users');
  return onSnapshot(
    usersCol,
    (snapshot) => {
      const list: AppUserProfile[] = [];
      snapshot.forEach((snap) => {
        list.push(mapFirestoreUserDoc(snap.id, snap.data()));
      });
      // Sort: Admins first, then viewers, then by name
      list.sort((a, b) => {
        const roleOrder: Record<string, number> = { admin: 1, viewer: 2 };
        const orderA = roleOrder[a.role] || 99;
        const orderB = roleOrder[b.role] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.displayName.localeCompare(b.displayName);
      });
      onUsers(list);
    },
    (error) => {
      console.error('Users collection listener error from Firestore:', error);
      if (onError) onError(error);
    }
  );
}

// Admin: Create a new account (Viewer or Admin) without logging out the Admin
export async function createManagedUserAccount(input: {
  name: string;
  email: string;
  password: string;
  role: AppUserRole;
}): Promise<AppUserProfile> {
  const { name, email, password, role } = input;
  const tempAppName = `TempUserApp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const tempApp = initializeApp(firebaseConfig, tempAppName);
  const tempAuth = getAuth(tempApp);
  const now = new Date().toISOString();

  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email.trim(), password);
    const newUid = cred.user.uid;
    const displayName = name.trim() || 'Team Member';

    const profile: AppUserProfile = {
      uid: newUid,
      userId: newUid,
      displayName,
      name: displayName,
      email: email.trim(),
      role,
      signUpDate: now,
      lastLogin: now,
      status: 'active',
      createdBy: auth.currentUser?.email || 'admin',
      createdAt: now,
      updatedAt: now,
    };

    // Write to Firestore users collection
    await setDoc(doc(db, 'users', newUid), profile);
    return profile;
  } catch (err: any) {
    if (err?.code === 'auth/operation-not-allowed') {
      console.warn('Notice: Email/Password provider is not enabled in Firebase Console for this project.');
    } else {
      console.warn('Notice creating managed user:', err?.message || err);
    }
    throw err;
  } finally {
    // Clean up temporary app instance
    try {
      await deleteApp(tempApp);
    } catch {
      // Ignore cleanup error
    }
  }
}

// Admin: Directly create or pre-provision a user record in Firestore
export async function createFirestoreUserRecord(input: {
  name: string;
  email: string;
  role: AppUserRole;
}): Promise<AppUserProfile> {
  const { name, email, role } = input;
  const now = new Date().toISOString();
  const normalizedEmail = email.trim().toLowerCase();
  // Safe document ID that passes isValidId regex (^[a-zA-Z0-9_\-]+$)
  const safeId = 'usr_' + normalizedEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
  const displayName = name.trim() || 'Team Member';

  const profile: AppUserProfile = {
    uid: safeId,
    userId: safeId,
    displayName,
    name: displayName,
    email: normalizedEmail,
    role,
    signUpDate: now,
    lastLogin: '',
    status: 'active',
    createdBy: auth.currentUser?.email || 'admin',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'users', safeId), profile);
  return profile;
}

// Admin: Update user role with Last Admin Protection
export async function updateUserRole(
  userId: string,
  newRole: AppUserRole,
  existingUsers?: AppUserProfile[]
): Promise<void> {
  const userRef = doc(db, 'users', userId);

  // Check last admin protection if existingUsers is provided
  if (existingUsers && newRole !== 'admin') {
    const targetUser = existingUsers.find((u) => u.uid === userId || u.userId === userId);
    if (targetUser && targetUser.role === 'admin') {
      const adminCount = existingUsers.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        throw new Error('Cannot demote the last remaining Admin. Another Admin account must exist first.');
      }
    }
  }

  try {
    await updateDoc(userRef, {
      role: newRole,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
}

// Admin: Toggle user active / inactive status
export async function toggleUserStatus(userId: string, currentStatus: AppUserStatus): Promise<AppUserStatus> {
  const newStatus: AppUserStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
    return newStatus;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
}

// Admin: Delete user from Firestore
export async function deleteUserDoc(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  try {
    await deleteDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

export { refreshGoogleDriveToken } from './googleAuthService';
