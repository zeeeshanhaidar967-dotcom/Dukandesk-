import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  KeyRound,
  Mail,
  User,
  AlertCircle,
  Eye,
  RefreshCw,
  Search,
  Calendar,
  Clock,
  Sparkles,
  Lock,
  Activity,
  Database,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { AppUserProfile, AppUserRole, AppUserStatus } from '../types/database';
import {
  subscribeToAllUsers,
  loadAllUsersOnce,
  createFirestoreUserRecord,
  updateUserRole,
  toggleUserStatus,
  deleteUserDoc,
  syncUserProfile,
  BOOTSTRAP_ADMIN_EMAIL,
} from '../services/firebaseAuthService';
import { auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';

interface UserManagementViewProps {
  currentUserEmail?: string | null;
  currentUserUid?: string | null;
}

export function UserManagementView({ currentUserEmail, currentUserUid }: UserManagementViewProps) {
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [firestoreReadError, setFirestoreReadError] = useState<{ code: string; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'admin' | 'viewer' | 'staff' | 'manager'>('ALL');

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<AppUserRole>('viewer');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Status feedback
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Dedicated function to fetch users from Firestore
  const handleReloadUsers = React.useCallback(async () => {
    setIsLoading(true);
    setFirestoreReadError(null);
    try {
      if (auth.currentUser) {
        try {
          await syncUserProfile(auth.currentUser);
        } catch (syncErr) {
          console.warn('Notice ensuring user profile during reload:', syncErr);
        }
      }
      const list = await loadAllUsersOnce();
      setUsers(list);
      setFirestoreReadError(null);
    } catch (err: any) {
      console.error('Firestore users read error:', err);
      const code = err?.code || (err?.message?.includes('permission-denied') ? 'permission-denied' : 'unknown');
      setFirestoreReadError({
        code,
        message: err?.message || 'Failed to read users collection from Firestore.'
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Subscribe to users collection in Firestore (refreshes on mount and when user auth changes)
  useEffect(() => {
    setIsLoading(true);
    setFirestoreReadError(null);
    setActionError(null);

    // Initial direct load from server
    handleReloadUsers();

    // Set up continuous real-time listener
    const unsubscribe = subscribeToAllUsers(
      (userList) => {
        setUsers(userList);
        setFirestoreReadError(null);
        setActionError(null);
        setIsLoading(false);
      },
      (err: any) => {
        console.error('Firestore users real-time listener error:', err);
        const code = err?.code || (err?.message?.includes('permission-denied') ? 'permission-denied' : 'unknown');
        setFirestoreReadError({
          code,
          message: err?.message || 'Failed to load users list from Firestore.'
        });
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [currentUserUid, currentUserEmail, handleReloadUsers]);

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'ALL') {
      if (roleFilter === 'viewer') {
        if (u.role !== 'viewer' && u.role !== 'stock_viewer') return false;
      } else if (u.role !== roleFilter) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (u.displayName || u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    }
    return true;
  });

  // Confirmation Dialog State
  const [confirmModal, setConfirmModal] = useState<{
    type: 'ROLE_CHANGE' | 'STATUS_TOGGLE' | 'DELETE_USER';
    user: AppUserProfile;
    newRole?: AppUserRole;
    title: string;
    description: string;
  } | null>(null);

  // Trigger Role Change confirmation
  const handleRoleChange = (user: AppUserProfile, newRole: AppUserRole) => {
    setActionError(null);
    setActionSuccess(null);

    const userName = user.displayName || user.name || user.email;
    const userEmail = (user.email || '').toLowerCase().trim();

    // 1. Protection for configured bootstrap admin
    if (userEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim() && newRole !== 'admin') {
      setActionError(
        `Action Denied: ${BOOTSTRAP_ADMIN_EMAIL} is the primary permanent Admin account and cannot be demoted.`
      );
      return;
    }

    // 2. Last Admin Protection: Check if demoting the only remaining admin
    if (user.role === 'admin' && newRole !== 'admin') {
      const adminCount = users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        setActionError(
          'Action Denied: Cannot demote the last remaining Admin. At least one Admin account must exist in the system.'
        );
        return;
      }
    }

    setConfirmModal({
      type: 'ROLE_CHANGE',
      user,
      newRole,
      title: 'Confirm Role Change',
      description: `Change role of "${userName}" (${user.email}) from ${user.role} to ${newRole}? This will immediately update permissions in Firestore and across all active devices.`,
    });
  };

  // Trigger Status Toggle confirmation
  const handleStatusToggle = (user: AppUserProfile) => {
    setActionError(null);
    setActionSuccess(null);

    const userName = user.displayName || user.name || user.email;
    const userEmail = (user.email || '').toLowerCase().trim();

    if (userEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim()) {
      setActionError('The primary owner admin account cannot be deactivated.');
      return;
    }

    const currentStatus = user.status || 'active';
    const actionName = currentStatus === 'active' ? 'Suspend' : 'Activate';

    setConfirmModal({
      type: 'STATUS_TOGGLE',
      user,
      title: `Confirm Account ${actionName}`,
      description: `${actionName} device access for "${userName}" (${user.email})? Suspended accounts cannot access any shop or inventory records.`,
    });
  };

  // Trigger Delete User confirmation
  const handleDeleteUser = (user: AppUserProfile) => {
    setActionError(null);
    setActionSuccess(null);

    const userName = user.displayName || user.name || user.email;
    const userEmail = (user.email || '').toLowerCase().trim();

    if (userEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim()) {
      setActionError('The primary permanent admin account cannot be deleted.');
      return;
    }

    if (user.role === 'admin') {
      const adminCount = users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        setActionError('Cannot delete the last remaining Admin account.');
        return;
      }
    }

    setConfirmModal({
      type: 'DELETE_USER',
      user,
      title: 'Remove User Document',
      description: `Are you sure you want to remove user "${userName}" (${user.email}) from Firestore?`,
    });
  };

  // Execute Confirmed Action
  const executeConfirmedAction = async () => {
    if (!confirmModal) return;
    const { type, user, newRole } = confirmModal;
    const userName = user.displayName || user.name || user.email;

    try {
      if (type === 'ROLE_CHANGE' && newRole) {
        await updateUserRole(user.uid || user.userId || '', newRole, users);
        setActionSuccess(`Role successfully updated to "${newRole}" for ${userName}. Permissions synchronized in Firestore.`);
      } else if (type === 'STATUS_TOGGLE') {
        const currentStatus = user.status || 'active';
        const newStatus = await toggleUserStatus(user.uid || user.userId || '', currentStatus);
        setActionSuccess(`Account status changed to "${newStatus}" for ${userName}`);
      } else if (type === 'DELETE_USER') {
        await deleteUserDoc(user.uid || user.userId || '');
        setActionSuccess(`User record removed for ${userName}`);
      }
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Action failed:', err);
      setActionError(err?.message || 'Operation failed in Firestore.');
    } finally {
      setConfirmModal(null);
    }
  };

  // Handle Authorize User Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = createEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setCreateError('Google email address is required.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await createFirestoreUserRecord({
        name: createName.trim() || 'Team Member',
        email: cleanEmail,
        role: createRole,
      });

      setIsCreateOpen(false);
      setCreateName('');
      setCreateEmail('');
      setCreateRole('viewer');
      setActionSuccess(`Authorized Google account "${cleanEmail}" with ${createRole} role.`);
      setTimeout(() => setActionSuccess(null), 4000);
      handleReloadUsers();
    } catch (err: any) {
      console.warn('Authorize User Notice:', err?.message || err);
      setCreateError(err?.message || 'Failed to authorize account in Firestore.');
    } finally {
      setIsCreating(false);
    }
  };

  // Format Date helper
  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const viewerCount = users.filter((u) => u.role === 'viewer' || u.role === 'stock_viewer').length;
  const otherCount = users.filter((u) => u.role === 'staff' || u.role === 'manager').length;
  const activeCount = users.filter((u) => !u.status || u.status === 'active').length;

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-850 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 font-bold text-[10px] rounded-full uppercase tracking-wider inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Panel
            </span>
            <span className="text-xs text-slate-400">• Role-Based Access Control</span>
          </div>
          <h2 className="text-xl font-black text-white mt-1">Users & Access Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage multi-user accounts, permissions, and device access in Firebase.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            type="button"
            onClick={handleReloadUsers}
            disabled={isLoading}
            title="Refresh users from Firestore"
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Reload</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* Action Notifications */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-rose-950/80 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Security Notice</span>
            <span>{actionError}</span>
          </div>
        </div>
      )}

      {/* Distinct Firestore Read Error Banner */}
      {firestoreReadError && (
        <div className="p-4 bg-rose-950/90 border border-rose-500/50 rounded-2xl text-rose-200 text-xs space-y-2 animate-fadeIn shadow-lg shadow-rose-950/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-white">Firestore Read Error</span>
                  <span className="px-2 py-0.5 bg-rose-900 border border-rose-600/60 text-rose-200 text-[10px] font-mono rounded font-bold uppercase">
                    [{firestoreReadError.code}]
                  </span>
                </div>
                <p className="mt-1 text-slate-300 text-xs">{firestoreReadError.message}</p>
                {firestoreReadError.code === 'permission-denied' && (
                  <p className="text-[11px] text-rose-300/80 mt-1.5 bg-rose-900/40 p-2 rounded-lg border border-rose-800/40">
                    Your authenticated account does not currently have permission to read the users collection in Firestore. In DukanDesk, only active Admin and Manager accounts are authorized to manage team users.
                  </p>
                )}
                {firestoreReadError.code === 'unavailable' && (
                  <p className="text-[11px] text-rose-300/80 mt-1.5 bg-rose-900/40 p-2 rounded-lg border border-rose-800/40">
                    Firestore service is currently unreachable or your device is offline. Existing cached data will remain intact.
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleReloadUsers}
              className="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* User Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Users className="w-3 h-3 text-slate-400" />
            Total Accounts
          </div>
          <div className="text-xl font-black text-white">
            {isLoading ? '...' : firestoreReadError ? '—' : users.length}
          </div>
          <div className="text-[10px] text-slate-500">
            {isLoading
              ? 'Loading...'
              : firestoreReadError
              ? `Read Failed [${firestoreReadError.code}]`
              : users.length === 0
              ? '0 registered accounts'
              : `${activeCount} active devices`}
          </div>
        </div>

        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
          <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Admins
          </div>
          <div className="text-xl font-black text-emerald-300">
            {isLoading ? '...' : firestoreReadError ? '—' : adminCount}
          </div>
          <div className="text-[10px] text-emerald-500/80">Full Access</div>
        </div>

        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
          <div className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Viewers
          </div>
          <div className="text-xl font-black text-cyan-300">
            {isLoading ? '...' : firestoreReadError ? '—' : viewerCount}
          </div>
          <div className="text-[10px] text-cyan-500/80">Stock-Only Access</div>
        </div>

        <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
          <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Staff / Other
          </div>
          <div className="text-xl font-black text-amber-300">
            {isLoading ? '...' : firestoreReadError ? '—' : otherCount}
          </div>
          <div className="text-[10px] text-amber-500/80">Expandable Roles</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-2">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            dir="ltr"
            style={{ direction: 'ltr', textAlign: 'left' }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search registered users by name or Google email..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-left"
          />
        </div>

        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setRoleFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              roleFilter === 'ALL'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All ({firestoreReadError ? '—' : users.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('admin')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              roleFilter === 'admin'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-400'
            }`}
          >
            Admins ({firestoreReadError ? '—' : adminCount})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('viewer')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              roleFilter === 'viewer'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-cyan-400'
            }`}
          >
            Viewers ({firestoreReadError ? '—' : viewerCount})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('manager')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              roleFilter === 'manager'
                ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-amber-400'
            }`}
          >
            Managers ({firestoreReadError ? '—' : users.filter((u) => u.role === 'manager').length})
          </button>
        </div>
      </div>

      {/* Users List with required fields: Name, Google email, Role, Sign-up date, Last login */}
      <div className="space-y-2.5">
        {isLoading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Loading user accounts from Firestore...</span>
          </div>
        ) : firestoreReadError ? (
          <div className="bg-slate-900 border border-rose-500/40 rounded-xl p-8 text-center text-slate-400 text-xs space-y-3">
            <ShieldAlert className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-slate-100 font-bold text-sm">Unable to load registered accounts from Firestore.</p>
            <p className="text-rose-400 font-mono text-xs">Error: [{firestoreReadError.code}] {firestoreReadError.message}</p>
            <div className="bg-slate-950 p-3 rounded-xl max-w-lg mx-auto text-left font-mono text-[11px] text-slate-400 border border-slate-800 space-y-1">
              <div>• Collection: /users</div>
              <div>• Status: Read failed [{firestoreReadError.code}]</div>
              <div>• Database: {(firebaseConfig as any).firestoreDatabaseId || '(default)'}</div>
            </div>
            <button
              type="button"
              onClick={handleReloadUsers}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Query</span>
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs space-y-4">
            <Users className="w-10 h-10 text-slate-600 mx-auto" />
            <div>
              <p className="text-slate-100 font-bold text-sm">0 registered accounts in Firestore</p>
              <p className="text-slate-400 text-xs mt-1 max-w-md mx-auto">
                No user profiles have been stored in the Firestore <code className="text-emerald-400 font-mono">users</code> collection yet.
                {auth.currentUser?.email && (
                  <span className="block mt-1 text-slate-300">
                    You are logged in as <span className="text-emerald-400 font-semibold">{auth.currentUser.email}</span>. Click below to register your admin profile to Firestore:
                  </span>
                )}
              </p>
            </div>
            {auth.currentUser && (
              <button
                type="button"
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    await syncUserProfile(auth.currentUser!);
                    await handleReloadUsers();
                    setActionSuccess('Your account profile has been saved to Firestore.');
                  } catch (err: any) {
                    setActionError(err?.message || 'Failed to save account to Firestore.');
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/60 inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Admin Account to Firestore</span>
              </button>
            )}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-xs">
            No users match the search criteria.
          </div>
        ) : (
          filteredUsers.map((user) => {
            const userName = user.displayName || user.name || 'User';
            const userEmail = (user.email || '').toLowerCase().trim();
            const isOwner = userEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim();
            const isCurrentUser = userEmail === (currentUserEmail || '').toLowerCase().trim();
            const isActive = !user.status || user.status === 'active';
            const isAdmin = user.role === 'admin';

            return (
              <div
                key={user.uid || user.userId}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 transition-colors space-y-3"
              >
                {/* Header row: Avatar, Name, Email, Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                        isAdmin
                          ? 'bg-emerald-950 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10'
                          : 'bg-cyan-950 border-cyan-500/50 text-cyan-300'
                      }`}
                    >
                      {userName.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white truncate">{userName}</span>
                        {isCurrentUser && (
                          <span className="px-1.5 py-0.2 bg-slate-800 text-[10px] text-slate-300 rounded font-semibold">
                            You
                          </span>
                        )}
                        {isOwner && (
                          <span className="px-2 py-0.5 bg-amber-950 border border-amber-500/40 text-amber-300 text-[10px] font-bold rounded-full inline-flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            Primary Admin
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400 truncate mt-0.5">
                        <span className="font-mono text-slate-300 truncate">{user.email}</span>
                        <span>•</span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                            isActive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          {isActive ? 'Active' : 'Suspended'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Role Selector / Controls */}
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    {/* Role Display Dropdown */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400 font-semibold">Role:</span>
                      {isOwner ? (
                        <span className="px-3 py-1 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold text-xs rounded-xl inline-flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          admin (Protected)
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          style={{ direction: 'ltr', textAlign: 'left' }}
                          onChange={(e) => handleRoleChange(user, e.target.value as AppUserRole)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer focus:outline-none transition-colors ${
                            isAdmin
                              ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
                              : 'bg-cyan-950 border-cyan-500/40 text-cyan-300'
                          }`}
                        >
                          <option value="viewer" className="bg-slate-900 text-white">viewer (Stock-Only)</option>
                          <option value="admin" className="bg-slate-900 text-white">admin (Full Access)</option>
                          <option value="staff" className="bg-slate-900 text-white">staff (Standard)</option>
                          <option value="manager" className="bg-slate-900 text-white">manager (Supervisory)</option>
                        </select>
                      )}
                    </div>

                    {/* Non-owner actions */}
                    {!isOwner && (
                      <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                        {/* Status Toggle */}
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(user)}
                          title={isActive ? 'Deactivate access' : 'Activate access'}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-500/20'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-300 border border-emerald-500/20'
                          }`}
                        >
                          {isActive ? 'Suspend' : 'Activate'}
                        </button>

                        {/* Delete User */}
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          title="Delete user document"
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata Row: Sign-up date, Last login, UID */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      Sign-up: <strong className="text-slate-300 font-mono">{formatDate(user.signUpDate)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      Last Login: <strong className="text-slate-300 font-mono">{formatDate(user.lastLogin)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[10px] truncate">
                    <span>UID:</span>
                    <span className="truncate" title={user.uid || user.userId}>
                      {user.uid || user.userId}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE USER MODAL */}
      {/* AUTHORIZE GOOGLE USER MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-950 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Authorize Google Account</h3>
                  <p className="text-[11px] text-slate-400">Grant permissions for a team member's Google account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">User's Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar / Counter Staff"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-left"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Google Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="team.member@gmail.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-left"
                    required
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  The user will log in with this Google account using the "Sign in with Google" button.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateRole('viewer')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      createRole === 'viewer'
                        ? 'bg-cyan-950/80 border-cyan-500/60 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-cyan-400 mb-0.5">
                      <Eye className="w-3.5 h-3.5" />
                      Viewer
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">
                      Stock-only read access. No billing, financial, or customer data.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateRole('admin')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      createRole === 'admin'
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400 mb-0.5">
                      <Shield className="w-3.5 h-3.5" />
                      Admin
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">
                      Full access to all shop records, sales, stock adjustments, & reports.
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Passwordless access: No passwords needed. Cloud Firestore will recognize this Google account instantly on sign in.</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Authorizing...</span>
                    </>
                  ) : (
                    <span>Authorize Account</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* CONFIRMATION ACTION MODAL (Replaces window.confirm) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative animate-fadeIn space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{confirmModal.title}</h3>
                <p className="text-[11px] text-slate-400">Security confirmation</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
              {confirmModal.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedAction}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-colors"
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
