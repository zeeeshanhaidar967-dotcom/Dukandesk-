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
  isPrimaryAdmin,
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
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'admin' | 'viewer'>('ALL');

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
      if (u.role !== roleFilter) return false;
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

    // 1. Protection for configured primary admins
    if (isPrimaryAdmin(userEmail) && newRole !== 'admin') {
      setActionError(
        `Action Denied: ${user.email} is a primary permanent Admin account and cannot be demoted.`
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

    if (isPrimaryAdmin(userEmail)) {
      setActionError('Primary admin accounts cannot be deactivated.');
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

    if (isPrimaryAdmin(userEmail)) {
      setActionError('Primary permanent admin accounts cannot be deleted.');
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
  const viewerCount = users.filter((u) => u.role === 'viewer').length;
  const activeCount = users.filter((u) => !u.status || u.status === 'active').length;

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-card p-4 sm:p-5 rounded-2xl border border-line shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-badge-green-bg border border-badge-green-text/35 text-badge-green-text font-bold text-[10px] rounded-full uppercase tracking-wider inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin Panel
            </span>
            <span className="text-xs text-muted">• Role-Based Access Control</span>
          </div>
          <h2 className="text-xl font-black text-ink mt-1">Users & Access Management</h2>
          <p className="text-xs text-muted mt-0.5">
            Manage multi-user accounts, permissions, and device access in Firebase.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            type="button"
            onClick={handleReloadUsers}
            disabled={isLoading}
            title="Refresh users from Firestore"
            className="px-3 py-2 bg-inner hover:bg-inner text-ink border border-line-strong text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-primary' : ''}`} />
            <span>Reload</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* Action Notifications */}
      {actionSuccess && (
        <div className="p-3.5 bg-badge-green-bg border border-badge-green-text/35 rounded-xl text-badge-green-text text-xs flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-badge-green-text shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-badge-red-bg border border-badge-red-text/35 rounded-xl text-badge-red-text text-xs flex items-start gap-2.5 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-badge-red-text shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Security Notice</span>
            <span>{actionError}</span>
          </div>
        </div>
      )}

      {/* Distinct Firestore Read Error Banner */}
      {firestoreReadError && (
        <div className="p-4 bg-badge-red-bg border border-badge-red-text/35 rounded-2xl text-badge-red-text text-xs space-y-2 animate-fadeIn shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-badge-red-text shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-ink">Firestore Read Error</span>
                  <span className="px-2 py-0.5 bg-card border border-badge-red-text/35 text-badge-red-text text-[10px] font-mono rounded font-bold uppercase">
                    [{firestoreReadError.code}]
                  </span>
                </div>
                <p className="mt-1 text-muted text-xs">{firestoreReadError.message}</p>
                {firestoreReadError.code === 'permission-denied' && (
                  <p className="text-[11px] text-badge-red-text mt-1.5 bg-card/60 p-2 rounded-lg border border-badge-red-text/35">
                    Your authenticated account does not currently have permission to read the users collection in Firestore. In DukanDesk, only active Admin accounts are authorized to manage team users.
                  </p>
                )}
                {firestoreReadError.code === 'unavailable' && (
                  <p className="text-[11px] text-badge-red-text mt-1.5 bg-card/60 p-2 rounded-lg border border-badge-red-text/35">
                    Firestore service is currently unreachable or your device is offline. Existing cached data will remain intact.
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleReloadUsers}
              className="px-3 py-1.5 bg-badge-red-text hover:bg-badge-red-text/90 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* User Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-card p-3 rounded-xl border border-line shadow-card">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <Users className="w-3 h-3 text-muted" />
            Total Accounts
          </div>
          <div className="text-xl font-black text-ink">
            {isLoading ? '...' : firestoreReadError ? '—' : users.length}
          </div>
          <div className="text-[10px] text-muted">
            {isLoading
              ? 'Loading...'
              : firestoreReadError
              ? `Read Failed [${firestoreReadError.code}]`
              : users.length === 0
              ? '0 registered accounts'
              : `${activeCount} active devices`}
          </div>
        </div>

        <div className="bg-card p-3 rounded-xl border border-line shadow-card">
          <div className="text-[10px] font-semibold text-badge-green-text uppercase tracking-wider mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Admins
          </div>
          <div className="text-xl font-black text-badge-green-text">
            {isLoading ? '...' : firestoreReadError ? '—' : adminCount}
          </div>
          <div className="text-[10px] text-badge-green-text/80">Full Access</div>
        </div>

        <div className="bg-card p-3 rounded-xl border border-line shadow-card">
          <div className="text-[10px] font-semibold text-badge-blue-text uppercase tracking-wider mb-1 flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Viewers
          </div>
          <div className="text-xl font-black text-badge-blue-text">
            {isLoading ? '...' : firestoreReadError ? '—' : viewerCount}
          </div>
          <div className="text-[10px] text-badge-blue-text/80">Stock-Only Access</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card p-3 rounded-xl border border-line flex flex-col sm:flex-row items-center gap-2 shadow-card">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-muted absolute left-3 top-2.5" />
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
            className="w-full bg-card border border-line-strong rounded-lg pl-9 pr-3 py-1.5 text-xs text-ink placeholder-placeholder focus:outline-none focus:ring-1 focus:ring-primary text-left"
          />
        </div>

        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setRoleFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              roleFilter === 'ALL'
                ? 'bg-primary text-white'
                : 'text-muted hover:text-ink'
            }`}
          >
            All ({firestoreReadError ? '—' : users.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('admin')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              roleFilter === 'admin'
                ? 'bg-badge-green-bg text-badge-green-text border border-badge-green-text/35'
                : 'text-muted hover:text-badge-green-text'
            }`}
          >
            Admins ({firestoreReadError ? '—' : adminCount})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('viewer')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
              roleFilter === 'viewer'
                ? 'bg-badge-blue-bg text-badge-blue-text border border-badge-blue-text/35'
                : 'text-muted hover:text-badge-blue-text'
            }`}
          >
            Viewers ({firestoreReadError ? '—' : viewerCount})
          </button>
        </div>
      </div>

      {/* Users List with required fields: Name, Google email, Role, Sign-up date, Last login */}
      <div className="space-y-2.5">
        {isLoading ? (
          <div className="bg-card border border-line rounded-xl p-8 text-center text-muted text-xs flex items-center justify-center gap-2 shadow-card">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            <span>Loading user accounts from Firestore...</span>
          </div>
        ) : firestoreReadError ? (
          <div className="bg-card border border-badge-red-text/35 rounded-xl p-8 text-center text-muted text-xs space-y-3 shadow-card">
            <ShieldAlert className="w-8 h-8 text-badge-red-text mx-auto" />
            <p className="text-ink font-bold text-sm">Unable to load registered accounts from Firestore.</p>
            <p className="text-badge-red-text font-mono text-xs">Error: [{firestoreReadError.code}] {firestoreReadError.message}</p>
            <div className="bg-inner p-3 rounded-xl max-w-lg mx-auto text-left font-mono text-[11px] text-muted border border-line-strong space-y-1">
              <div>• Collection: /users</div>
              <div>• Status: Read failed [{firestoreReadError.code}]</div>
              <div>• Database: {(firebaseConfig as any).firestoreDatabaseId || '(default)'}</div>
            </div>
            <button
              type="button"
              onClick={handleReloadUsers}
              className="px-4 py-2 bg-inner hover:bg-inner text-ink text-xs font-bold rounded-xl border border-line-strong cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Query</span>
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="bg-card border border-line rounded-xl p-8 text-center text-muted text-xs space-y-4 shadow-card">
            <Users className="w-10 h-10 text-line-strong mx-auto" />
            <div>
              <p className="text-ink font-bold text-sm">0 registered accounts in Firestore</p>
              <p className="text-muted text-xs mt-1 max-w-md mx-auto">
                No user profiles have been stored in the Firestore <code className="text-primary font-mono font-semibold">users</code> collection yet.
                {auth.currentUser?.email && (
                  <span className="block mt-1 text-ink">
                    You are logged in as <span className="text-primary font-semibold">{auth.currentUser.email}</span>. Click below to register your admin profile to Firestore:
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
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl shadow-sm inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Admin Account to Firestore</span>
              </button>
            )}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-card border border-line rounded-xl p-8 text-center text-muted text-xs shadow-card">
            No users match the search criteria.
          </div>
        ) : (
          filteredUsers.map((user) => {
            const userName = user.displayName || user.name || 'User';
            const userEmail = (user.email || '').toLowerCase().trim();
            const isOwner = isPrimaryAdmin(userEmail);
            const isCurrentUser = userEmail === (currentUserEmail || '').toLowerCase().trim();
            const isActive = !user.status || user.status === 'active';
            const isAdmin = user.role === 'admin';

            return (
              <div
                key={user.uid || user.userId}
                className="bg-card border border-line hover:border-line-strong rounded-2xl p-4 transition-colors space-y-3 shadow-card"
              >
                {/* Header row: Avatar, Name, Email, Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                        isAdmin
                          ? 'bg-badge-green-bg border-badge-green-text/35 text-badge-green-text'
                          : 'bg-badge-blue-bg border-badge-blue-text/35 text-badge-blue-text'
                      }`}
                    >
                      {userName.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-ink truncate">{userName}</span>
                        {isCurrentUser && (
                          <span className="px-1.5 py-0.2 bg-inner text-[10px] text-muted border border-line-strong rounded font-semibold">
                            You
                          </span>
                        )}
                        {isOwner && (
                          <span className="px-2 py-0.5 bg-badge-yellow-bg border border-badge-yellow-text/35 text-badge-yellow-text text-[10px] font-bold rounded-full inline-flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            Primary Admin
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted truncate mt-0.5">
                        <span className="font-mono text-ink truncate">{user.email}</span>
                        <span>•</span>
                        <span
                          className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                            isActive ? 'text-badge-green-text' : 'text-badge-red-text'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive ? 'bg-badge-green-text' : 'bg-badge-red-text'
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
                      <span className="text-[11px] text-muted font-semibold">Role:</span>
                      {isOwner ? (
                        <span className="px-3 py-1 bg-badge-green-bg border border-badge-green-text/35 text-badge-green-text font-bold text-xs rounded-xl inline-flex items-center gap-1">
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
                              ? 'bg-badge-green-bg border-badge-green-text/35 text-badge-green-text'
                              : 'bg-badge-blue-bg border-badge-blue-text/35 text-badge-blue-text'
                          }`}
                        >
                          <option value="viewer" className="bg-card text-ink">viewer (Stock-Only)</option>
                          <option value="admin" className="bg-card text-ink">admin (Full Access)</option>
                        </select>
                      )}
                    </div>

                    {/* Non-owner actions */}
                    {!isOwner && (
                      <div className="flex items-center gap-1 pl-1 border-l border-line">
                        {/* Status Toggle */}
                        <button
                          type="button"
                          onClick={() => handleStatusToggle(user)}
                          title={isActive ? 'Deactivate access' : 'Activate access'}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-badge-red-bg hover:bg-badge-red-bg/80 text-badge-red-text border border-badge-red-text/35'
                              : 'bg-badge-green-bg hover:bg-badge-green-bg/80 text-badge-green-text border border-badge-green-text/35'
                          }`}
                        >
                          {isActive ? 'Suspend' : 'Activate'}
                        </button>

                        {/* Delete User */}
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(user)}
                          title="Delete user document"
                          className="p-1.5 text-muted hover:text-badge-red-text hover:bg-badge-red-bg rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata Row: Sign-up date, Last login, UID */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2.5 border-t border-line text-[11px] text-muted">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-muted shrink-0" />
                    <span>
                      Sign-up: <strong className="text-ink font-mono">{formatDate(user.signUpDate)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-muted shrink-0" />
                    <span>
                      Last Login: <strong className="text-ink font-mono">{formatDate(user.lastLogin)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-muted font-mono text-[10px] truncate">
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-line rounded-3xl w-full max-w-md p-6 shadow-card relative animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-badge-green-bg border border-badge-green-text/35 rounded-xl text-badge-green-text">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Authorize Google Account</h3>
                  <p className="text-[11px] text-muted">Grant permissions for a team member's Google account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-muted hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-badge-red-bg border border-badge-red-text/35 rounded-xl text-badge-red-text text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-badge-red-text" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">User's Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-muted absolute left-3 top-2.5" />
                  <input
                    type="text"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar / Stock Viewer"
                    className="w-full bg-card border border-line-strong rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder-placeholder focus:outline-none focus:ring-1 focus:ring-primary text-left"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Google Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-muted absolute left-3 top-2.5" />
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
                    className="w-full bg-card border border-line-strong rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder-placeholder focus:outline-none focus:ring-1 focus:ring-primary text-left"
                    required
                  />
                </div>
                <p className="text-[10px] text-muted mt-1">
                  The user will log in with this Google account using the "Sign in with Google" button.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">Assigned Role</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateRole('viewer')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      createRole === 'viewer'
                        ? 'bg-badge-blue-bg border-badge-blue-text/35 text-badge-blue-text'
                        : 'bg-card border-line-strong text-muted hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-badge-blue-text mb-0.5">
                      <Eye className="w-3.5 h-3.5" />
                      Viewer
                    </div>
                    <div className="text-[10px] text-muted leading-tight">
                      Stock-only read access. No billing, financial, or customer data.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateRole('admin')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      createRole === 'admin'
                        ? 'bg-badge-green-bg border-badge-green-text/35 text-badge-green-text'
                        : 'bg-card border-line-strong text-muted hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-badge-green-text mb-0.5">
                      <Shield className="w-3.5 h-3.5" />
                      Admin
                    </div>
                    <div className="text-[10px] text-muted leading-tight">
                      Full access to all shop records, sales, stock adjustments, & reports.
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-inner border border-line-strong rounded-xl text-[11px] text-muted flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-badge-green-text shrink-0" />
                <span>Passwordless access: No passwords needed. Cloud Firestore will recognize this Google account instantly on sign in.</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-1.5 bg-inner hover:bg-inner text-muted text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-line rounded-3xl w-full max-w-sm p-6 shadow-card relative animate-fadeIn space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-badge-yellow-bg border border-badge-yellow-text/35 text-badge-yellow-text flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">{confirmModal.title}</h3>
                <p className="text-[11px] text-muted">Security confirmation</p>
              </div>
            </div>

            <p className="text-xs text-ink leading-relaxed bg-inner p-3 rounded-xl border border-line-strong">
              {confirmModal.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 bg-inner hover:bg-inner text-muted text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedAction}
                className="px-4 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer transition-colors"
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
