/**
 * DukanDesk - Enterprise Multi-User Shop Management System (MAHARAJA MARBLE)
 * Role-Based Access Control (RBAC) with Firebase Authentication & Firestore Real-Time Sync
 */

import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, testFirestoreConnection } from './firebase';
import { roomDb, DEFAULT_SETTINGS } from './db/roomDatabase';
import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  PaymentEntity,
  SaleReturnEntity,
  OwnerSettingsEntity,
  AppUserProfile,
  AppUserRole,
} from './types/database';
import { TopAppBar } from './components/TopAppBar';
import { BottomNav, NavTabId } from './components/BottomNav';
import { PinLockScreen } from './components/PinLockScreen';
import { DashboardView } from './components/DashboardView';
import { SalesView } from './components/SalesView';
import { InventoryView } from './components/InventoryView';
import { CustomerView } from './components/CustomerView';
import { CustomerDashboardModal } from './components/CustomerDashboardModal';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { StockInModal } from './components/StockInModal';
import { ProductFormModal } from './components/ProductFormModal';
import { ReceivePaymentModal } from './components/ReceivePaymentModal';
import { SaleReceiptModal } from './components/SaleReceiptModal';
import { ReturnReceiptModal } from './components/ReturnReceiptModal';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ReturnModal } from './components/ReturnModal';
import { LoginScreen } from './components/LoginScreen';
import { StockViewerDashboard } from './components/StockViewerDashboard';
import { UserManagementView } from './components/UserManagementView';
import {
  syncUserProfile,
  subscribeToUserProfile,
  logoutAppUser,
  getCachedUserProfile,
} from './services/firebaseAuthService';
import {
  startRealtimeSync,
  seedLocalDataToFirestoreIfEmpty,
  cloudSaveProduct,
  cloudDeleteProduct,
  cloudAddStock,
  cloudSaveCustomer,
  cloudCompleteSale,
  cloudRecordPayment,
  cloudProcessReturn,
  cloudSaveSettings,
  subscribeToSyncState,
  getSyncState,
  SyncState,
} from './services/firebaseSyncService';
import { initializeGoogleAuthOnStartup } from './services/googleAuthService';
import { startAutoBackupScheduler } from './services/autoBackupService';
import { ShieldAlert, LogOut, RefreshCw, AlertTriangle } from 'lucide-react';

export default function App() {
  // Firebase Authentication & RBAC User Profile
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<AppUserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  // Real-Time Cloud Sync State (for TopAppBar indicator)
  const [syncState, setSyncState] = useState<SyncState>(() => getSyncState());

  useEffect(() => {
    const unsubSync = subscribeToSyncState((state) => {
      setSyncState(state);
    });
    return () => unsubSync();
  }, []);

  // Database State synced with Room SQLite Database & Firestore
  const [dbState, setDbState] = useState(() => roomDb.getState());

  // Security / PIN lock state (For Admin convenience within an unlocked session)
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');

  // Active Modals
  const [isStockInOpen, setIsStockInOpen] = useState(false);
  const [stockInProductId, setStockInProductId] = useState<string | undefined>(undefined);
  const [stockInSuggestedQty, setStockInSuggestedQty] = useState<number | undefined>(undefined);

  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductEntity | null>(null);

  const [isReceivePaymentOpen, setIsReceivePaymentOpen] = useState(false);
  const [receivePaymentCustomerId, setReceivePaymentCustomerId] = useState<string | undefined>(undefined);

  const [activeReceiptSale, setActiveReceiptSale] = useState<SaleEntity | null>(null);
  const [activeReceiptReturn, setActiveReceiptReturn] = useState<SaleReturnEntity | null>(null);
  const [activeCustomerDashboard, setActiveCustomerDashboard] = useState<CustomerEntity | null>(null);

  // Authoritative reactive customer object synchronized with roomDb state
  const currentActiveCustomer = useMemo(() => {
    if (!activeCustomerDashboard) return null;
    return dbState.customers.find((c) => c.id === activeCustomerDashboard.id) || activeCustomerDashboard;
  }, [activeCustomerDashboard, dbState.customers]);

  const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  // Synchronize state from roomDb manager
  const refreshDbState = () => {
    setDbState(roomDb.getState());
  };

  // 1. Listen to Firebase Authentication State Changes (Fast startup with local hydration)
  useEffect(() => {
    // Non-blocking Firestore connection validation scheduled after initial boot
    const connTimer = setTimeout(() => {
      testFirestoreConnection();
    }, 2500);

    // Timeout safety guard: ensure the startup screen never blocks past 2.5 seconds
    const authTimeoutTimer = setTimeout(() => {
      setIsAuthChecking((checking) => {
        if (checking) {
          console.log('Notice: Startup auth screen released via timeout safety guard.');
          return false;
        }
        return false;
      });
    }, 2500);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      clearTimeout(authTimeoutTimer);
      setCurrentUser(user);

      if (user) {
        const isOwner = (user.email || '').toLowerCase().trim() === 'zeeeshanhaidar967@gmail.com';

        // 1. Instant hydration from cached profile (zero-latency startup!)
        const cached = getCachedUserProfile(user.uid);

        if (cached) {
          setUserProfile(cached);
          if (cached.role === 'viewer' || cached.role === 'stock_viewer') {
            setActiveTab('stock_dashboard');
          } else {
            setActiveTab('dashboard');
          }
          // Unblock app shell immediately!
          setIsAuthChecking(false);
        } else {
          // Provide instant baseline for brand new session
          const baseline: AppUserProfile = {
            uid: user.uid,
            userId: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || 'User',
            name: user.displayName || user.email?.split('@')[0] || 'User',
            email: user.email || '',
            role: isOwner ? 'admin' : 'viewer',
            signUpDate: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            status: 'active',
          };
          setUserProfile(baseline);
          setActiveTab(isOwner ? 'dashboard' : 'stock_dashboard');
          // Unblock app shell immediately!
          setIsAuthChecking(false);
        }

        // 2. Background verification & Firestore cloud sync
        syncUserProfile(user)
          .then((freshProfile) => {
            if (freshProfile) {
              setUserProfile(freshProfile);
            }
          })
          .catch((err) => {
            console.warn('Background profile verification notice:', err);
          });
      } else {
        setUserProfile(null);
        setIsAuthChecking(false);
      }
    });

    const cleanupScheduler = startAutoBackupScheduler(() => {
      refreshDbState();
    });

    return () => {
      clearTimeout(connTimer);
      clearTimeout(authTimeoutTimer);
      unsubscribeAuth();
      cleanupScheduler();
    };
  }, []);

  // 2. Real-Time Profile Listener & Status Enforcement
  useEffect(() => {
    if (!currentUser) return;
    const unsubProfile = subscribeToUserProfile(currentUser.uid, (profile) => {
      if (profile) {
        setUserProfile(profile);
        // Reconcile role: If cloud profile is viewer/stock_viewer, immediately revoke admin access & route
        if (profile.role === 'viewer' || profile.role === 'stock_viewer') {
          setActiveTab((prev) => (prev === 'stock_dashboard' || prev === 'inventory' ? prev : 'stock_dashboard'));
        }
      }
    });
    return () => unsubProfile();
  }, [currentUser]);

  // 3. Real-Time Cloud Firestore Multi-Device Sync
  useEffect(() => {
    if (!currentUser) return;
    const currentRole: AppUserRole = userProfile?.role || 'viewer';

    // If admin or manager, check and seed existing local data so records are preserved in Firestore
    if (currentRole === 'admin' || currentRole === 'manager') {
      seedLocalDataToFirestoreIfEmpty();
    }

    // Start real-time listeners according to role
    const cleanupSync = startRealtimeSync(currentRole, () => {
      refreshDbState();
    });

    return () => {
      cleanupSync();
    };
  }, [currentUser, userProfile?.role, userProfile?.status]);

  // Keep activeCustomerDashboard fresh if db updates
  useEffect(() => {
    if (activeCustomerDashboard) {
      const refreshed = dbState.customers.find((c) => c.id === activeCustomerDashboard.id);
      if (refreshed) {
        setActiveCustomerDashboard(refreshed);
      }
    }
  }, [dbState.customers]);

  // Handle Logout Confirmation Prompt & Execution
  const promptLogout = () => {
    setIsLogoutConfirmOpen(true);
  };

  const handleLogout = async () => {
    setIsLogoutConfirmOpen(false);
    try {
      await logoutAppUser();
      setCurrentUser(null);
      setUserProfile(null);
      setIsLocked(false);
      setActiveTab('dashboard');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Categories & Suppliers
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    dbState.products.forEach((p) => p.category && set.add(p.category));
    if (set.size === 0) {
      return ['Floor Tiles', 'Wall Tiles', 'Faucets & Taps', 'Sanitaryware', 'Plumbing', 'Tools'];
    }
    return Array.from(set);
  }, [dbState.products]);

  const existingSuppliers = useMemo(() => {
    const set = new Set<string>();
    dbState.products.forEach((p) => p.supplier && set.add(p.supplier));
    if (set.size === 0) {
      return ['Main Depot', 'Metro Tiles Distributor', 'Royal Sanitary Agencies'];
    }
    return Array.from(set);
  }, [dbState.products]);

  // Unpaid Customers count for bottom nav badge
  const unpaidCustomersCount = useMemo(() => {
    return dbState.customers.filter((c) => c.outstandingBalance > 0).length;
  }, [dbState.customers]);

  // Low stock count for top notification bell
  const lowStockCount = useMemo(() => {
    return dbState.products.filter((p) => p.currentStock <= p.minStockLevel).length;
  }, [dbState.products]);

  // --- Handlers with Dual-Write to Local DB & Cloud Firestore ---

  // Complete Sale (Admin Only)
  const handleCompleteSale = (saleInput: {
    customerId: string;
    items: Array<{ productId: string; quantity: number }>;
    amountPaid: number;
    paymentMethod: SaleEntity['paymentMethod'];
    notes?: string;
  }): SaleEntity => {
    const createdSale = roomDb.completeSale(saleInput);
    refreshDbState();
    setActiveReceiptSale(createdSale);

    // Sync to Firestore
    const updatedProducts = roomDb.getProducts();
    const updatedCustomer = roomDb.getCustomerById(saleInput.customerId) || null;
    cloudCompleteSale(createdSale, updatedProducts, updatedCustomer).catch((e) =>
      console.warn('Notice syncing sale to cloud:', e)
    );

    return createdSale;
  };

  // Stock-In (Admin Only)
  const handleConfirmStockIn = (
    productId: string,
    quantityReceived: number,
    newPurchasePrice?: number,
    reference?: string,
    notes?: string
  ) => {
    const result = roomDb.addStock(productId, quantityReceived, newPurchasePrice, reference, notes);
    refreshDbState();

    // Sync to Firestore
    if (result && result.product && result.movement) {
      cloudAddStock(result.product, result.movement, newPurchasePrice).catch((e) =>
        console.warn('Notice syncing stock-in to cloud:', e)
      );
    }
  };

  // Receive Customer Payment (Admin Only)
  const handleConfirmReceivePayment = (
    customerId: string,
    amount: number,
    paymentMethod: PaymentEntity['paymentMethod'],
    notes?: string
  ) => {
    const newPayment = roomDb.recordCustomerPayment(customerId, amount, paymentMethod, notes);
    refreshDbState();

    const updatedCustomer = roomDb.getCustomerById(customerId);
    if (newPayment && updatedCustomer) {
      cloudRecordPayment(newPayment, updatedCustomer).catch((e) =>
        console.warn('Notice syncing payment to cloud:', e)
      );
    }
  };

  // Process Product Return (Admin Only)
  const handleProcessReturn = (input: {
    saleId: string;
    items: {
      saleItemId: string;
      productId: string;
      returnQuantity: number;
    }[];
    settlementType: 'DUE_ADJUSTMENT' | 'REFUND' | 'STORE_CREDIT';
    notes?: string;
  }) => {
    const returnRecord = roomDb.processSaleReturn(input);
    refreshDbState();

    const updatedProducts = roomDb.getProducts();
    const updatedCustomer = roomDb.getCustomerById(returnRecord.customerId);
    cloudProcessReturn(returnRecord, updatedProducts, updatedCustomer).catch((e) =>
      console.warn('Notice syncing return to cloud:', e)
    );

    return returnRecord;
  };

  // Create / Edit Product (Admin Only)
  const handleSaveProduct = (
    productData: Omit<ProductEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => {
    let saved: ProductEntity;
    if (productData.id) {
      saved = roomDb.updateProduct(productData.id, productData);
    } else {
      saved = roomDb.insertProduct(productData);
    }
    refreshDbState();

    cloudSaveProduct(saved).catch((e) => console.warn('Notice syncing product to cloud:', e));
  };

  // Delete Product (Admin Only)
  const handleDeleteProduct = (productId: string) => {
    roomDb.deleteProduct(productId);
    refreshDbState();

    cloudDeleteProduct(productId).catch((e) => console.warn('Notice deleting product in cloud:', e));
  };

  // Quick Add Customer (Admin Only)
  const handleQuickAddCustomer = (data: {
    name: string;
    phone: string;
    address: string;
    openingBalance?: number;
  }): CustomerEntity => {
    const cust = roomDb.insertCustomer(data);
    refreshDbState();

    cloudSaveCustomer(cust).catch((e) => console.warn('Notice syncing customer to cloud:', e));
    return cust;
  };

  // Update Settings (Admin Only)
  const handleUpdateSettings = (newSettings: Partial<OwnerSettingsEntity>) => {
    const updated = roomDb.updateSettings(newSettings);
    refreshDbState();

    cloudSaveSettings(updated).catch((e) => console.warn('Notice syncing settings to cloud:', e));
  };

  // Database Backup / Export
  const handleExportSQLite = () => {
    const sqlDump = roomDb.exportSQLiteDump();
    const blob = new Blob([sqlDump], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dukandesk_sqlite_room_${new Date().toISOString().slice(0, 10)}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const jsonDump = roomDb.exportJSONBackup();
    const blob = new Blob([jsonDump], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dukandesk_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (jsonString: string) => {
    roomDb.importJSONBackup(jsonString);
    refreshDbState();
  };

  const handleResetToSample = () => {
    roomDb.resetToSampleData();
    refreshDbState();
  };

  const handleClearAll = (pin: string) => {
    roomDb.clearAllData(pin);
    refreshDbState();
  };

  // --- SCREEN RENDERING GATES ---

  // 1. Initial Authentication Check Loader
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <p className="text-sm font-semibold tracking-wide">Connecting to MAHARAJA MARBLE Cloud...</p>
        <span className="text-xs text-slate-500 mt-1">Verifying secure Firebase credentials</span>
      </div>
    );
  }

  // 2. Unauthenticated: Render Secure Login Screen
  if (!currentUser) {
    return (
      <LoginScreen
        shopName={dbState.settings.shopName}
        onLoginSuccess={() => refreshDbState()}
      />
    );
  }

  // 2.5 Authenticated but profile loading
  if (!userProfile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <p className="text-sm font-semibold tracking-wide">Synchronizing profile...</p>
        <span className="text-xs text-slate-500 mt-1">Verifying user permissions</span>
      </div>
    );
  }

  // 3. Deactivated / Inactive User Account Gate
  if (userProfile.status === 'inactive') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-950 border border-rose-500/40 text-rose-400 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Account Deactivated</h2>
            <p className="text-xs text-slate-400 mt-1">
              Your access for <strong className="text-slate-200">{userProfile.email}</strong> has been deactivated by the store administrator.
            </p>
          </div>
          <p className="text-xs text-slate-500 bg-slate-950 p-3 rounded-xl border border-slate-800">
            Please contact the owner/manager (HAIDAR ALI, MAHARAJA MARBLE) to reactivate your device or role.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out & Switch Account</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Admin PIN Lock Screen (Optional layer within active admin session)
  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';
  const isManagementRole = isAdmin || isManager;

  if (isAdmin && isLocked) {
    return (
      <PinLockScreen
        correctPin={dbState.settings.pin}
        isPinSet={dbState.settings.isPinSet}
        shopName={dbState.settings.shopName}
        ownerName={dbState.settings.ownerName}
        onUnlock={() => setIsLocked(false)}
        onSetNewPin={(newPin) => {
          handleUpdateSettings({ pin: newPin, isPinSet: true });
        }}
      />
    );
  }

  // 5. Main Application Viewport
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex justify-center selection:bg-emerald-500/30 selection:text-emerald-300 font-sans">
      <div className="w-full max-w-4xl min-h-screen bg-slate-900 flex flex-col relative">
        {/* Top App Bar with Role & Real-Time Sync Info */}
        <TopAppBar
          shopName={dbState.settings.shopName}
          ownerName={dbState.settings.ownerName}
          lowStockCount={lowStockCount}
          userProfile={userProfile}
          syncState={syncState}
          onLock={() => setIsLocked(true)}
          onLogout={promptLogout}
          onNotificationClick={() => setActiveTab(isManagementRole ? 'dashboard' : 'stock_dashboard')}
          onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
        />

        {/* Scrollable Content Viewport */}
        <main className="flex-1 p-4 overflow-y-auto pb-24">
          {/* --- STOCK VIEWER ROLE VIEWS --- */}
          {!isManagementRole && (
            <>
              {activeTab === 'stock_dashboard' && (
                <StockViewerDashboard
                  products={dbState.products}
                  userProfile={userProfile!}
                  shopName={dbState.settings.shopName}
                  onLogout={promptLogout}
                />
              )}

              {activeTab === 'inventory' && (
                <InventoryView
                  products={dbState.products}
                  stockMovements={[]}
                  settings={dbState.settings}
                  role="stock_viewer"
                  onOpenAddProduct={() => {}}
                  onEditProduct={() => {}}
                  onDeleteProduct={() => {}}
                  onOpenStockIn={() => {}}
                />
              )}

              {/* Security Guard: If Viewer attempts unauthorized tab navigation */}
              {activeTab !== 'stock_dashboard' && activeTab !== 'inventory' && (
                <div className="p-8 text-center bg-slate-950/80 border border-slate-800 rounded-3xl space-y-3">
                  <ShieldAlert className="w-10 h-10 text-cyan-400 mx-auto" />
                  <h3 className="text-sm font-bold text-white">Access Restricted to Stock Information</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Your account has the <strong>Viewer</strong> role. The Admin Panel, billing, profit, customer ledgers, and settings are protected.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('stock_dashboard')}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Return to Stock Dashboard
                  </button>
                </div>
              )}
            </>
          )}

          {/* --- MANAGEMENT ROLE VIEWS (Admin & Manager) --- */}
          {isManagementRole && (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  products={dbState.products}
                  customers={dbState.customers}
                  sales={dbState.sales}
                  payments={dbState.payments}
                  settings={dbState.settings}
                  currencySymbol={dbState.settings.currencySymbol}
                  onNavigateToSale={() => setActiveTab('sales')}
                  onNavigateToAddStock={(productId, suggestedQty) => {
                    setStockInProductId(productId);
                    setStockInSuggestedQty(suggestedQty);
                    setIsStockInOpen(true);
                  }}
                  onNavigateToAddProduct={() => {
                    setEditingProduct(null);
                    setIsProductFormOpen(true);
                  }}
                  onNavigateToCustomers={() => setActiveTab('customers')}
                  onOpenSaleReceipt={(sale) => setActiveReceiptSale(sale)}
                  onOpenReceivePayment={() => {
                    setReceivePaymentCustomerId(undefined);
                    setIsReceivePaymentOpen(true);
                  }}
                  onOpenReturn={() => setIsReturnModalOpen(true)}
                />
              )}

              {activeTab === 'sales' && (
                <SalesView
                  products={dbState.products}
                  customers={dbState.customers}
                  settings={dbState.settings}
                  onCompleteSale={handleCompleteSale}
                  onQuickAddCustomer={handleQuickAddCustomer}
                />
              )}

              {activeTab === 'inventory' && (
                <InventoryView
                  products={dbState.products}
                  stockMovements={dbState.stockMovements}
                  settings={dbState.settings}
                  role={isAdmin ? 'admin' : 'manager'}
                  onOpenAddProduct={() => {
                    setEditingProduct(null);
                    setIsProductFormOpen(true);
                  }}
                  onEditProduct={(p) => {
                    setEditingProduct(p);
                    setIsProductFormOpen(true);
                  }}
                  onDeleteProduct={handleDeleteProduct}
                  onOpenStockIn={(productId) => {
                    setStockInProductId(productId);
                    setIsStockInOpen(true);
                  }}
                />
              )}

              {activeTab === 'customers' && (
                <CustomerView
                  customers={dbState.customers}
                  sales={dbState.sales}
                  returns={dbState.returns}
                  settings={dbState.settings}
                  onSelectCustomer={(cust) => setActiveCustomerDashboard(cust)}
                  onOpenReceivePayment={(custId) => {
                    setReceivePaymentCustomerId(custId);
                    setIsReceivePaymentOpen(true);
                  }}
                  onAddCustomer={handleQuickAddCustomer}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsView
                  products={dbState.products}
                  customers={dbState.customers}
                  sales={dbState.sales}
                  payments={dbState.payments}
                  stockMovements={dbState.stockMovements}
                  settings={dbState.settings}
                />
              )}

              {(activeTab === 'users' || activeTab === 'admin_panel') && (
                <UserManagementView
                  key={`admin_users_${currentUser.uid}`}
                  currentUserEmail={currentUser.email}
                  currentUserUid={currentUser.uid}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  settings={dbState.settings}
                  onUpdateSettings={handleUpdateSettings}
                  onExportSQLite={handleExportSQLite}
                  onExportJSON={handleExportJSON}
                  onImportJSON={handleImportJSON}
                  onResetToSample={handleResetToSample}
                  onClearAll={handleClearAll}
                  onOpenGoogleDrive={() => setIsGoogleDriveOpen(true)}
                />
              )}
            </>
          )}
        </main>

        {/* Role-Based Bottom Navigation Bar */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          unpaidCustomersCount={unpaidCustomersCount}
          role={userProfile?.role}
        />

        {/* Management Modals & Dialogs (Admin & Manager) */}
        {isManagementRole && (
          <>
            {/* 1. Stock-In Modal */}
            <StockInModal
              products={dbState.products}
              settings={dbState.settings}
              initialProductId={stockInProductId}
              initialSuggestedQty={stockInSuggestedQty}
              isOpen={isStockInOpen}
              onClose={() => {
                setIsStockInOpen(false);
                setStockInProductId(undefined);
                setStockInSuggestedQty(undefined);
              }}
              onConfirmStockIn={handleConfirmStockIn}
            />

            {/* 2. Product Form Modal */}
            <ProductFormModal
              isOpen={isProductFormOpen}
              onClose={() => {
                setIsProductFormOpen(false);
                setEditingProduct(null);
              }}
              onSave={handleSaveProduct}
              onDelete={handleDeleteProduct}
              productToEdit={editingProduct}
              existingCategories={existingCategories}
              existingSuppliers={existingSuppliers}
              settings={dbState.settings}
            />

            {/* 3. Receive Due Payment Modal */}
            <ReceivePaymentModal
              customers={dbState.customers}
              initialCustomerId={receivePaymentCustomerId}
              settings={dbState.settings}
              isOpen={isReceivePaymentOpen}
              onClose={() => {
                setIsReceivePaymentOpen(false);
                setReceivePaymentCustomerId(undefined);
              }}
              onConfirmPayment={handleConfirmReceivePayment}
            />

            {/* 4. Customer Detailed Dashboard Modal */}
            <CustomerDashboardModal
              customer={currentActiveCustomer}
              sales={dbState.sales}
              payments={dbState.payments}
              returns={dbState.returns}
              settings={dbState.settings}
              isOpen={!!currentActiveCustomer}
              onClose={() => setActiveCustomerDashboard(null)}
              onOpenReceivePayment={(custId) => {
                setReceivePaymentCustomerId(custId);
                setIsReceivePaymentOpen(true);
              }}
              onOpenSaleReceipt={(sale) => setActiveReceiptSale(sale)}
              onOpenReturnReceipt={(returnRecord) => setActiveReceiptReturn(returnRecord)}
            />

            {/* 5. Sale Printable Invoice Receipt Modal */}
            <SaleReceiptModal
              sale={activeReceiptSale}
              settings={dbState.settings}
              customer={
                activeReceiptSale
                  ? dbState.customers.find((c) => c.id === activeReceiptSale.customerId)
                  : undefined
              }
              onClose={() => setActiveReceiptSale(null)}
            />

            {/* 5b. Return Printable Bill / Goods Return Receipt Modal */}
            <ReturnReceiptModal
              isOpen={!!activeReceiptReturn}
              onClose={() => setActiveReceiptReturn(null)}
              returnRecord={activeReceiptReturn}
              settings={dbState.settings}
              customer={
                activeReceiptReturn
                  ? dbState.customers.find((c) => c.id === activeReceiptReturn.customerId)
                  : undefined
              }
              sale={
                activeReceiptReturn
                  ? dbState.sales.find((s) => s.id === activeReceiptReturn.saleId)
                  : undefined
              }
            />

            {/* 6. Google Drive Cloud Storage & Backup Modal */}
            <GoogleDriveModal
              isOpen={isGoogleDriveOpen}
              onClose={() => setIsGoogleDriveOpen(false)}
              shopName={dbState.settings.shopName}
              currencySymbol={dbState.settings.currencySymbol}
              settings={dbState.settings}
              onUpdateSettings={handleUpdateSettings}
              onRefreshDbState={refreshDbState}
            />

            {/* 7. Product Return Modal */}
            <ReturnModal
              isOpen={isReturnModalOpen}
              onClose={() => setIsReturnModalOpen(false)}
              customers={dbState.customers}
              sales={dbState.sales}
              products={dbState.products}
              settings={dbState.settings}
              onConfirmReturn={handleProcessReturn}
            />
          </>
        )}

        {/* Sign Out Warning Confirmation Modal (Applies to both Admin and Viewers) */}
        {isLogoutConfirmOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Sign Out Confirmation</h3>
                  <p className="text-xs text-slate-400">Security Warning</p>
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-2">
                <p className="font-semibold text-white">
                  Are you sure you want to sign out from {dbState.settings.shopName || 'MAHARAJA MARBLE'}?
                </p>
                <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400">Account:</span>
                  <span className="font-mono text-slate-200 truncate">
                    {userProfile?.email || currentUser?.email || 'User'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Role:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      isAdmin
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                        : 'bg-cyan-950 text-cyan-300 border border-cyan-500/40'
                    }`}
                  >
                    {userProfile?.role?.toUpperCase() || 'VIEWER'}
                  </span>
                </div>
                <p className="text-[11px] text-amber-400/90 pt-1 leading-relaxed">
                  ⚠️ You will need to sign in with your Google account to access this store again.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsLogoutConfirmOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                >
                  Stay Logged In
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-950/60 cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Yes, Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
