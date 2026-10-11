import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User as FirebaseUser,
  getAuth,
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
import { auth, db } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { AppUserProfile, AppUserRole, AppUserStatus } from '../types/database';
import { handleFirestoreError, OperationType } from './firestoreErrorHandler';
import { syncGoogleDriveAuthSession } from './googleAuthService';

export const BOOTSTRAP_ADMIN_EMAIL = 'zeeeshanhaidar967@gmail.com';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// Sign in with Google (Popup) with Google Drive scope included
export async function loginWithGoogle(): Promise<{ user: FirebaseUser; accessToken?: string }> {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.setCustomParameters({
    prompt: 'select_account',
    access_type: 'offline',
  });
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken;

  if (token) {
    try {
      localStorage.setItem('drive_access_token', token);
      localStorage.setItem('drive_token_expires_at', String(Date.now() + 3550 * 1000));
      await syncGoogleDriveAuthSession(result.user, token);
    } catch (err) {
      console.warn('Notice syncing Google Drive session:', err);
    }
  }

  return { user: result.user, accessToken: token || undefined };
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
  const isOwner = (user.email || '').toLowerCase().trim() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim();
  const now = new Date().toISOString();
  const displayName = name.trim() || user.displayName || (user.email ? user.email.split('@')[0] : 'User');

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
    role: (d.role as AppUserRole) || 'viewer',
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
  const isOwner = userEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim();
  const now = new Date().toISOString();

  // 1. Read cached profile if available for fast startup hydration
  const cached = getCachedUserProfile(user.uid);
  const existingRole: AppUserRole = isOwner ? 'admin' : (cached?.role || 'viewer');
  const displayName = cached?.displayName || user.displayName || (user.email ? user.email.split('@')[0] : 'User');

  const baselineProfile: AppUserProfile = {
    uid: user.uid,
    userId: user.uid,
    displayName,
    name: displayName,
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
      // Owner admin retains admin authority
      if (isOwner && cloudProfile.role !== 'admin') {
        cloudProfile.role = 'admin';
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
      const roleOrder: Record<string, number> = { admin: 1, manager: 2, staff: 3, viewer: 4, stock_viewer: 5 };
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

// Subscribe to all users in Firestore (Admin & Manager)
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
      // Sort: Admins first, then managers, then by name
      list.sort((a, b) => {
        const roleOrder: Record<string, number> = { admin: 1, manager: 2, staff: 3, viewer: 4, stock_viewer: 5 };
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

// Admin: Create a new account (Viewer, Staff, or Admin) without logging out the Admin
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
