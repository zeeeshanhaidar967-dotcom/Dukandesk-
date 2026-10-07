import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc,
  runTransaction,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { roomDb } from '../db/roomDatabase';
import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  PaymentEntity,
  StockMovementEntity,
  SaleReturnEntity,
  OwnerSettingsEntity,
  AppUserRole,
} from '../types/database';

// --- Sync State & Types ---
export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncTime: string | null;
  lastError: string | null;
}

export interface SyncQueueItem {
  id: string; // Idempotency key (entity id or transaction id)
  type:
    | 'PRODUCT_SAVE'
    | 'PRODUCT_DELETE'
    | 'STOCK_ADD'
    | 'SALE_COMPLETE'
    | 'CUSTOMER_SAVE'
    | 'PAYMENT_RECORD'
    | 'RETURN_PROCESS'
    | 'SETTINGS_SAVE';
  payload: any;
  createdAt: string;
  retryCount: number;
}

const QUEUE_STORAGE_KEY = 'dukanmaster_offline_sync_queue_v2';

let currentSyncState: SyncState = {
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced',
  pendingCount: 0,
  lastSyncTime: null,
  lastError: null,
};

const syncSubscribers: Set<(state: SyncState) => void> = new Set();
let isProcessingQueue = false;
let periodicSyncInterval: any = null;

// Notify subscribers of status change
function notifySyncState() {
  const pending = getPendingQueue();
  currentSyncState.pendingCount = pending.length;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    currentSyncState.status = 'offline';
  }
  syncSubscribers.forEach((fn) => {
    try {
      fn({ ...currentSyncState });
    } catch {}
  });
}

export function subscribeToSyncState(fn: (state: SyncState) => void): () => void {
  syncSubscribers.add(fn);
  fn({ ...currentSyncState });
  return () => {
    syncSubscribers.delete(fn);
  };
}

export function getSyncState(): SyncState {
  const pending = getPendingQueue();
  return {
    ...currentSyncState,
    pendingCount: pending.length,
    status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : currentSyncState.status,
  };
}

// --- Persistent Offline Queue Management ---

function getPendingQueue(): SyncQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingQueue(queue: SyncQueueItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    notifySyncState();
  } catch (err) {
    console.warn('Failed to save offline sync queue to storage:', err);
  }
}

function enqueueOperation(item: Omit<SyncQueueItem, 'createdAt' | 'retryCount'>): void {
  const queue = getPendingQueue();
  // Idempotency: Avoid duplicate entries for the same ID and action type
  const existingIdx = queue.findIndex((q) => q.id === item.id && q.type === item.type);
  const newItem: SyncQueueItem = {
    ...item,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  if (existingIdx !== -1) {
    queue[existingIdx] = newItem;
  } else {
    queue.push(newItem);
  }

  savePendingQueue(queue);
  triggerQueueProcess();
}

// --- Queue Processing Engine ---

export async function triggerQueueProcess(): Promise<void> {
  if (isProcessingQueue) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    currentSyncState.status = 'offline';
    notifySyncState();
    return;
  }

  const queue = getPendingQueue();
  if (queue.length === 0) {
    currentSyncState.status = 'synced';
    currentSyncState.lastError = null;
    notifySyncState();
    return;
  }

  isProcessingQueue = true;
  currentSyncState.status = 'syncing';
  notifySyncState();

  const remainingQueue: SyncQueueItem[] = [];

  for (const item of queue) {
    try {
      await executeQueuedItem(item);
    } catch (err: any) {
      console.warn(`Sync queue item ${item.type} (${item.id}) attempt failed:`, err);
      // Hard authorization check: if server denies permission, drop item immediately
      if (err?.code === 'permission-denied') {
        console.error(`Cloud security rules rejected ${item.type} (${item.id}): Permission denied.`);
        continue;
      }
      item.retryCount += 1;
      // Keep in queue if retryCount < 10 for transient network errors
      if (item.retryCount < 10) {
        remainingQueue.push(item);
      }
      currentSyncState.lastError = err?.message || 'Network sync error';
    }
  }

  savePendingQueue(remainingQueue);
  isProcessingQueue = false;

  if (remainingQueue.length === 0) {
    currentSyncState.status = 'synced';
    currentSyncState.lastSyncTime = new Date().toISOString();
    currentSyncState.lastError = null;
  } else {
    currentSyncState.status = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error';
  }
  notifySyncState();
}

// Execute individual queued action using Firestore atomic transactions or writes
async function executeQueuedItem(item: SyncQueueItem): Promise<void> {
  switch (item.type) {
    case 'PRODUCT_SAVE': {
      const product: ProductEntity = item.payload;
      const ref = doc(db, 'products', product.id);
      await setDoc(ref, product, { merge: true });
      break;
    }

    case 'PRODUCT_DELETE': {
      const productId: string = item.payload.productId;
      const ref = doc(db, 'products', productId);
      await deleteDoc(ref);
      break;
    }

    case 'STOCK_ADD': {
      // Atomic Transaction: Reads latest cloud stock and applies addition so concurrent additions on another device are never overwritten
      const { productId, quantityReceived, newPurchasePrice, movement } = item.payload;
      const productRef = doc(db, 'products', productId);
      const movementRef = doc(db, 'stock_movements', movement.id);

      await runTransaction(db, async (txn) => {
        // Idempotency: Check if this movement ID is already written
        const moveSnap = await txn.get(movementRef);
        if (moveSnap.exists()) {
          return; // Already processed
        }

        const prodSnap = await txn.get(productRef);
        const localProd = roomDb.getProductById(productId);

        let currentCloudStock = 0;
        let priceToSet = newPurchasePrice;

        if (prodSnap.exists()) {
          currentCloudStock = Number(prodSnap.data()?.currentStock ?? 0);
          priceToSet = newPurchasePrice !== undefined && newPurchasePrice > 0 
            ? newPurchasePrice 
            : prodSnap.data()?.purchasePrice;
        } else if (localProd) {
          currentCloudStock = Math.max(0, Number(localProd.currentStock) - Number(quantityReceived));
          priceToSet = newPurchasePrice || localProd.purchasePrice;
        }

        const resolvedNewStock = currentCloudStock + Number(quantityReceived);

        if (prodSnap.exists()) {
          txn.update(productRef, {
            currentStock: resolvedNewStock,
            purchasePrice: priceToSet || 0,
            updatedAt: new Date().toISOString(),
          });
        } else if (localProd) {
          txn.set(productRef, {
            ...localProd,
            currentStock: resolvedNewStock,
            purchasePrice: priceToSet || localProd.purchasePrice || 0,
            updatedAt: new Date().toISOString(),
          });
        }

        txn.set(movementRef, {
          ...movement,
          previousStock: currentCloudStock,
          newStock: resolvedNewStock,
          createdAt: movement.createdAt || new Date().toISOString(),
        });
      });
      break;
    }

    case 'SALE_COMPLETE': {
      // Atomic Transaction: Decrements stock per item based on fresh cloud state and records sale + movements + customer balance
      const { sale, items, customerId } = item.payload;
      const saleRef = doc(db, 'sales', sale.id);

      await runTransaction(db, async (txn) => {
        // Idempotency: Check if sale was already committed
        const saleSnap = await txn.get(saleRef);
        if (saleSnap.exists()) {
          return; // Already committed
        }

        // 1. Read product snapshots
        const prodSnaps = await Promise.all(
          items.map((it: { productId: string }) => txn.get(doc(db, 'products', it.productId)))
        );

        // 2. Read customer snapshot if available
        let customerRef = null;
        let custSnap = null;
        if (customerId) {
          customerRef = doc(db, 'customers', customerId);
          custSnap = await txn.get(customerRef);
        }

        // 3. Update each product stock with atomic delta
        items.forEach((it: { productId: string; quantity: number }, idx: number) => {
          const pSnap = prodSnaps[idx];
          const localProd = roomDb.getProductById(it.productId);
          if (pSnap.exists()) {
            const currentCloudStock = Number(pSnap.data()?.currentStock ?? 0);
            const newStock = Math.max(0, currentCloudStock - Number(it.quantity));
            txn.update(doc(db, 'products', it.productId), {
              currentStock: newStock,
              updatedAt: new Date().toISOString(),
            });
          } else if (localProd) {
            const newStock = Math.max(0, Number(localProd.currentStock));
            txn.set(doc(db, 'products', it.productId), {
              ...localProd,
              currentStock: newStock,
              updatedAt: new Date().toISOString(),
            });
          }
        });

        // 4. Update customer balance in cloud if applicable
        if (customerRef) {
          const localCust = roomDb.getCustomerById(customerId);
          if (custSnap && custSnap.exists()) {
            const currentPurchases = Number(custSnap.data()?.totalPurchases ?? 0);
            const currentPaid = Number(custSnap.data()?.totalPaid ?? 0);
            const newPurchases = currentPurchases + Number(sale.totalBill);
            const newPaid = currentPaid + Number(sale.amountPaid);
            const newBalance = Math.max(0, newPurchases - newPaid);

            txn.update(customerRef, {
              totalPurchases: newPurchases,
              totalPaid: newPaid,
              outstandingBalance: newBalance,
              updatedAt: new Date().toISOString(),
            });
          } else if (localCust) {
            txn.set(customerRef, localCust);
          }
        }

        // 5. Write sale document
        txn.set(saleRef, sale);
      });
      break;
    }

    case 'CUSTOMER_SAVE': {
      const customer: CustomerEntity = item.payload;
      const ref = doc(db, 'customers', customer.id);
      await setDoc(ref, customer, { merge: true });
      break;
    }

    case 'PAYMENT_RECORD': {
      const { payment, customerId, amount } = item.payload;
      const paymentRef = doc(db, 'payments', payment.id);
      const customerRef = doc(db, 'customers', customerId);

      await runTransaction(db, async (txn) => {
        const paySnap = await txn.get(paymentRef);
        if (paySnap.exists()) {
          return; // Already processed
        }

        const custSnap = await txn.get(customerRef);
        if (custSnap.exists()) {
          const currentPurchases = Number(custSnap.data()?.totalPurchases ?? 0);
          const currentPaid = Number(custSnap.data()?.totalPaid ?? 0);
          const newPaid = currentPaid + Number(amount);
          const newBalance = Math.max(0, currentPurchases - newPaid);

          txn.update(customerRef, {
            totalPaid: newPaid,
            outstandingBalance: newBalance,
            updatedAt: new Date().toISOString(),
          });
        } else {
          const localCust = roomDb.getCustomerById(customerId);
          if (localCust) {
            txn.set(customerRef, localCust);
          }
        }

        txn.set(paymentRef, payment);
      });
      break;
    }

    case 'RETURN_PROCESS': {
      const { returnRecord, items, customerId } = item.payload;
      const returnRef = doc(db, 'returns', returnRecord.id);

      await runTransaction(db, async (txn) => {
        const retSnap = await txn.get(returnRef);
        if (retSnap.exists()) {
          return; // Already processed
        }

        // Read products
        const prodSnaps = await Promise.all(
          items.map((it: { productId: string }) => txn.get(doc(db, 'products', it.productId)))
        );

        // Read customer
        let customerRef = null;
        let custSnap = null;
        if (customerId) {
          customerRef = doc(db, 'customers', customerId);
          custSnap = await txn.get(customerRef);
        }

        // Re-credit returned item quantities to stock
        items.forEach((it: { productId: string; returnQuantity: number }, idx: number) => {
          const pSnap = prodSnaps[idx];
          const localProd = roomDb.getProductById(it.productId);
          if (pSnap.exists()) {
            const currentCloudStock = Number(pSnap.data()?.currentStock ?? 0);
            const newStock = currentCloudStock + Number(it.returnQuantity);
            txn.update(doc(db, 'products', it.productId), {
              currentStock: newStock,
              updatedAt: new Date().toISOString(),
            });
          } else if (localProd) {
            txn.set(doc(db, 'products', it.productId), {
              ...localProd,
              currentStock: Number(localProd.currentStock),
              updatedAt: new Date().toISOString(),
            });
          }
        });

        // Adjust customer ledger if dueAdjustment was applied
        if (customerRef) {
          if (custSnap && custSnap.exists() && returnRecord.dueAdjustment > 0) {
            const currentPurchases = Number(custSnap.data()?.totalPurchases ?? 0);
            const currentPaid = Number(custSnap.data()?.totalPaid ?? 0);
            const newPurchases = Math.max(0, currentPurchases - Number(returnRecord.dueAdjustment));
            const newBalance = Math.max(0, newPurchases - currentPaid);

            txn.update(customerRef, {
              totalPurchases: newPurchases,
              outstandingBalance: newBalance,
              updatedAt: new Date().toISOString(),
            });
          } else {
            const localCust = roomDb.getCustomerById(customerId);
            if (localCust) {
              txn.set(customerRef, localCust);
            }
          }
        }

        txn.set(returnRef, returnRecord);
      });
      break;
    }

    case 'SETTINGS_SAVE': {
      const settings: OwnerSettingsEntity = item.payload;
      const ref = doc(db, 'settings', 'current');
      await setDoc(ref, settings, { merge: true });
      break;
    }
  }
}

// --- Automatic Offline / Online Event Listeners ---
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('Device network online: triggering background synchronization with Firestore.');
    triggerQueueProcess();
  });

  window.addEventListener('offline', () => {
    console.warn('Device network offline: writes will queue locally and auto-sync when online.');
    currentSyncState.status = 'offline';
    notifySyncState();
  });

  // Periodic safety sweep every 20 seconds to retry pending changes
  if (!periodicSyncInterval) {
    periodicSyncInterval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const queue = getPendingQueue();
        if (queue.length > 0) {
          triggerQueueProcess();
        }
      }
    }, 20000);
  }
}

// --- Public Async Methods for App Actions (with Offline Queueing) ---

// 1. Product Save (Create or Update)
export async function cloudSaveProduct(product: ProductEntity): Promise<void> {
  enqueueOperation({
    id: product.id,
    type: 'PRODUCT_SAVE',
    payload: product,
  });
}

// 2. Product Delete
export async function cloudDeleteProduct(productId: string): Promise<void> {
  enqueueOperation({
    id: productId,
    type: 'PRODUCT_DELETE',
    payload: { productId },
  });
}

// 3. Stock In / Arrival (Atomic addition)
export async function cloudAddStock(
  product: ProductEntity,
  movement: StockMovementEntity,
  newPurchasePrice?: number
): Promise<void> {
  enqueueOperation({
    id: movement.id,
    type: 'STOCK_ADD',
    payload: {
      productId: product.id,
      quantityReceived: movement.quantity,
      newPurchasePrice,
      movement,
    },
  });
}

// 4. Quick Add / Update Customer
export async function cloudSaveCustomer(customer: CustomerEntity): Promise<void> {
  enqueueOperation({
    id: customer.id,
    type: 'CUSTOMER_SAVE',
    payload: customer,
  });
}

// 5. Complete Sale (Atomic bill creation + stock deduction + customer debt update)
export async function cloudCompleteSale(
  sale: SaleEntity,
  updatedProducts: ProductEntity[],
  updatedCustomer: CustomerEntity | null
): Promise<void> {
  enqueueOperation({
    id: sale.id,
    type: 'SALE_COMPLETE',
    payload: {
      sale,
      items: sale.items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
      customerId: sale.customerId,
    },
  });
}

// 6. Record Customer Payment
export async function cloudRecordPayment(
  payment: PaymentEntity,
  updatedCustomer: CustomerEntity
): Promise<void> {
  enqueueOperation({
    id: payment.id,
    type: 'PAYMENT_RECORD',
    payload: {
      payment,
      customerId: updatedCustomer.id,
      amount: payment.amount,
    },
  });
}

// 7. Process Sale Return
export async function cloudProcessReturn(
  returnRecord: SaleReturnEntity,
  updatedProducts: ProductEntity[],
  updatedCustomer?: CustomerEntity
): Promise<void> {
  enqueueOperation({
    id: returnRecord.id,
    type: 'RETURN_PROCESS',
    payload: {
      returnRecord,
      items: returnRecord.items.map((it) => ({
        productId: it.productId,
        returnQuantity: it.returnedQuantity,
      })),
      customerId: returnRecord.customerId,
    },
  });
}

// 8. Settings Update
export async function cloudSaveSettings(settings: OwnerSettingsEntity): Promise<void> {
  enqueueOperation({
    id: 'current',
    type: 'SETTINGS_SAVE',
    payload: settings,
  });
}

// --- Entity Mappers (Tolerant of optional fields and missing IDs) ---

export function mapFirestoreProductDoc(docId: string, raw: any): ProductEntity {
  const data = raw || {};
  return {
    id: String(data.id || docId),
    name: String(data.name || 'Unnamed Product'),
    photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
    category: String(data.category || 'General'),
    brand: String(data.brand || ''),
    producer: String(data.producer || data.manufacturer || ''),
    supplier: String(data.supplier || ''),
    unit: (data.unit as any) || 'Piece',
    customUnit: data.customUnit ? String(data.customUnit) : undefined,
    purchasePrice: Number(data.purchasePrice ?? 0) || 0,
    sellingPrice: Number(data.sellingPrice ?? 0) || 0,
    currentStock: Number(data.currentStock ?? 0) || 0,
    minStockLevel: Number(data.minStockLevel ?? 0) || 0,
    createdAt: data.createdAt ? String(data.createdAt) : new Date().toISOString(),
    updatedAt: data.updatedAt ? String(data.updatedAt) : (data.createdAt ? String(data.createdAt) : new Date().toISOString()),
  };
}

export function mapFirestoreCustomerDoc(docId: string, raw: any): CustomerEntity {
  const data = raw || {};
  return {
    id: String(data.id || docId),
    name: String(data.name || 'Unnamed Customer'),
    phone: String(data.phone || ''),
    address: String(data.address || ''),
    totalPurchases: Number(data.totalPurchases ?? 0) || 0,
    totalPaid: Number(data.totalPaid ?? 0) || 0,
    outstandingBalance: Number(data.outstandingBalance ?? 0) || 0,
    createdAt: data.createdAt ? String(data.createdAt) : new Date().toISOString(),
    updatedAt: data.updatedAt ? String(data.updatedAt) : (data.createdAt ? String(data.createdAt) : new Date().toISOString()),
  };
}

export function mapFirestoreSaleDoc(docId: string, raw: any): SaleEntity {
  const data = raw || {};
  return {
    id: String(data.id || docId),
    billNumber: String(data.billNumber || docId),
    customerId: String(data.customerId || ''),
    customerName: String(data.customerName || 'Customer'),
    customerPhone: data.customerPhone ? String(data.customerPhone) : undefined,
    customerAddress: data.customerAddress ? String(data.customerAddress) : undefined,
    items: Array.isArray(data.items) ? data.items : [],
    totalBill: Number(data.totalBill ?? 0) || 0,
    totalCost: Number(data.totalCost ?? 0) || 0,
    grossProfit: Number(data.grossProfit ?? 0) || 0,
    amountPaid: Number(data.amountPaid ?? 0) || 0,
    balanceDue: Number(data.balanceDue ?? 0) || 0,
    paymentMethod: data.paymentMethod || 'Cash',
    notes: data.notes ? String(data.notes) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : new Date().toISOString(),
  };
}

export function mapFirestorePaymentDoc(docId: string, raw: any): PaymentEntity {
  const data = raw || {};
  return {
    id: String(data.id || docId),
    customerId: String(data.customerId || ''),
    customerName: String(data.customerName || 'Customer'),
    saleId: data.saleId ? String(data.saleId) : undefined,
    billNumber: data.billNumber ? String(data.billNumber) : undefined,
    amount: Number(data.amount ?? 0) || 0,
    paymentMethod: data.paymentMethod || 'Cash',
    notes: data.notes ? String(data.notes) : undefined,
    paymentDate: data.paymentDate ? String(data.paymentDate) : new Date().toISOString().split('T')[0],
    createdAt: data.createdAt ? String(data.createdAt) : new Date().toISOString(),
  };
}

export function mapFirestoreReturnDoc(docId: string, raw: any): SaleReturnEntity {
  const data = raw || {};
  return {
    id: String(data.id || docId),
    saleId: String(data.saleId || ''),
    billNumber: String(data.billNumber || ''),
    customerId: String(data.customerId || ''),
    customerName: String(data.customerName || 'Customer'),
    items: Array.isArray(data.items) ? data.items : [],
    totalReturnValue: Number(data.totalReturnValue ?? 0) || 0,
    dueAdjustment: Number(data.dueAdjustment ?? 0) || 0,
    refundAmount: Number(data.refundAmount ?? 0) || 0,
    creditAmount: Number(data.creditAmount ?? 0) || 0,
    settlementType: data.settlementType || 'DUE_ADJUSTMENT',
    notes: data.notes ? String(data.notes) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : new Date().toISOString(),
  };
}

export function mapFirestoreMovementDoc(docId: string, raw: any): StockMovementEntity {
  const data = raw || {};
  return {
    id: String(data.id || docId),
    productId: String(data.productId || ''),
    productName: String(data.productName || 'Product'),
    type: data.type || 'ADJUSTMENT',
    quantity: Number(data.quantity ?? 0) || 0,
    previousStock: Number(data.previousStock ?? 0) || 0,
    newStock: Number(data.newStock ?? 0) || 0,
    reference: String(data.reference || 'Manual Entry'),
    notes: data.notes ? String(data.notes) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : new Date().toISOString(),
  };
}

// --- Seed Local Data to Firestore if Empty (Preserves Existing Firestore Data) ---
export async function seedLocalDataToFirestoreIfEmpty(): Promise<boolean> {
  try {
    const productsSnap = await getDocs(collection(db, 'products'));
    if (!productsSnap.empty) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('dukandesk_firestore_seeded', 'true');
      }
      // Source of truth: Populate roomDb with existing Firestore products!
      const existingProducts: ProductEntity[] = [];
      productsSnap.forEach((d) => {
        existingProducts.push(mapFirestoreProductDoc(d.id, d.data()));
      });
      roomDb.setProductsFromCloud(existingProducts);
      currentSyncState.status = 'synced';
      currentSyncState.lastSyncTime = new Date().toISOString();
      currentSyncState.lastError = null;
      notifySyncState();
      return false; // Firestore already has records, loaded into roomDb
    }

    if (typeof window !== 'undefined') {
      const alreadyChecked = localStorage.getItem('dukandesk_firestore_seeded');
      if (alreadyChecked === 'true') {
        return false;
      }
    }

    const localState = roomDb.getState();
    const batch = writeBatch(db);

    // 1. Products
    localState.products.forEach((p) => {
      batch.set(doc(db, 'products', p.id), p);
    });

    // 2. Customers
    localState.customers.forEach((c) => {
      batch.set(doc(db, 'customers', c.id), c);
    });

    // 3. Sales
    localState.sales.forEach((s) => {
      batch.set(doc(db, 'sales', s.id), s);
    });

    // 4. Payments
    localState.payments.forEach((pay) => {
      batch.set(doc(db, 'payments', pay.id), pay);
    });

    // 5. Returns
    (localState.returns || []).forEach((r) => {
      batch.set(doc(db, 'returns', r.id), r);
    });

    // 6. Stock Movements
    localState.stockMovements.forEach((m) => {
      batch.set(doc(db, 'stock_movements', m.id), m);
    });

    // 7. Settings
    if (localState.settings) {
      batch.set(doc(db, 'settings', 'current'), localState.settings);
    }

    await batch.commit();
    if (typeof window !== 'undefined') {
      localStorage.setItem('dukandesk_firestore_seeded', 'true');
    }
    console.info('Initial local shop database successfully seeded to Firebase Firestore.');
    return true;
  } catch (error) {
    console.warn('Notice during initial cloud migration check:', error);
    return false;
  }
}

// --- Start Real-Time Multi-Device Synchronization ---
export function startRealtimeSync(
  role: AppUserRole,
  onStateChanged: () => void
): () => void {
  const unsubscribers: Array<() => void> = [];

  // Check and process any pending offline queue immediately
  triggerQueueProcess();

  // 1. Products (Synchronized to ALL authenticated roles in real time)
  try {
    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const productsList: ProductEntity[] = [];
        snapshot.forEach((d) => {
          productsList.push(mapFirestoreProductDoc(d.id, d.data()));
        });
        roomDb.setProductsFromCloud(productsList);
        currentSyncState.status = 'synced';
        currentSyncState.lastSyncTime = new Date().toISOString();
        currentSyncState.lastError = null;
        notifySyncState();
        onStateChanged();
      },
      (error) => {
        console.error('Real-time products sync error from Firestore:', error);
        currentSyncState.status = 'error';
        currentSyncState.lastError = error.message;
        notifySyncState();
      }
    );
    unsubscribers.push(unsubProducts);
  } catch (err: any) {
    console.error('Products sync subscription error:', err);
    currentSyncState.status = 'error';
    currentSyncState.lastError = err?.message || 'Failed to subscribe to products';
    notifySyncState();
  }

  // 2. Settings (Synchronized to both Admin, Manager, and Stock Viewer)
  try {
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'current'),
      (snap) => {
        if (snap.exists()) {
          roomDb.setSettingsFromCloud(snap.data() as OwnerSettingsEntity);
          onStateChanged();
        }
      },
      (error) => {
        console.warn('Real-time settings sync notice:', error);
      }
    );
    unsubscribers.push(unsubSettings);
  } catch (err) {
    console.warn('Settings sync subscription notice:', err);
  }

  // Stock Viewer users ONLY subscribe to products & settings. Exit early for stock_viewer / viewer.
  if (role === 'viewer' || role === 'stock_viewer') {
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  // --- MANAGEMENT (ADMIN & MANAGER) REAL-TIME LISTENERS ---

  // 3. Customers
  try {
    const unsubCustomers = onSnapshot(
      collection(db, 'customers'),
      (snapshot) => {
        const list: CustomerEntity[] = [];
        snapshot.forEach((d) => {
          list.push(mapFirestoreCustomerDoc(d.id, d.data()));
        });
        roomDb.setCustomersFromCloud(list);
        onStateChanged();
      },
      (error) => {
        console.warn('Real-time customers sync notice:', error);
      }
    );
    unsubscribers.push(unsubCustomers);
  } catch (err) {
    console.warn('Customer sync subscription notice:', err);
  }

  // 4. Sales
  try {
    const unsubSales = onSnapshot(
      collection(db, 'sales'),
      (snapshot) => {
        const list: SaleEntity[] = [];
        snapshot.forEach((d) => {
          list.push(mapFirestoreSaleDoc(d.id, d.data()));
        });
        roomDb.setSalesFromCloud(list);
        onStateChanged();
      },
      (error) => {
        console.warn('Real-time sales sync notice:', error);
      }
    );
    unsubscribers.push(unsubSales);
  } catch (err) {
    console.warn('Sales sync subscription notice:', err);
  }

  // 5. Payments
  try {
    const unsubPayments = onSnapshot(
      collection(db, 'payments'),
      (snapshot) => {
        const list: PaymentEntity[] = [];
        snapshot.forEach((d) => {
          list.push(mapFirestorePaymentDoc(d.id, d.data()));
        });
        roomDb.setPaymentsFromCloud(list);
        onStateChanged();
      },
      (error) => {
        console.warn('Real-time payments sync notice:', error);
      }
    );
    unsubscribers.push(unsubPayments);
  } catch (err) {
    console.warn('Payments sync subscription notice:', err);
  }

  // 6. Returns
  try {
    const unsubReturns = onSnapshot(
      collection(db, 'returns'),
      (snapshot) => {
        const list: SaleReturnEntity[] = [];
        snapshot.forEach((d) => {
          list.push(mapFirestoreReturnDoc(d.id, d.data()));
        });
        roomDb.setReturnsFromCloud(list);
        onStateChanged();
      },
      (error) => {
        console.warn('Real-time returns sync notice:', error);
      }
    );
    unsubscribers.push(unsubReturns);
  } catch (err) {
    console.warn('Returns sync subscription notice:', err);
  }

  // 7. Stock Movements
  try {
    const unsubMovements = onSnapshot(
      collection(db, 'stock_movements'),
      (snapshot) => {
        const list: StockMovementEntity[] = [];
        snapshot.forEach((d) => {
          list.push(mapFirestoreMovementDoc(d.id, d.data()));
        });
        roomDb.setStockMovementsFromCloud(list);
        onStateChanged();
      },
      (error) => {
        console.warn('Real-time stock movements sync notice:', error);
      }
    );
    unsubscribers.push(unsubMovements);
  } catch (err) {
    console.warn('Movements sync subscription notice:', err);
  }

  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
}
