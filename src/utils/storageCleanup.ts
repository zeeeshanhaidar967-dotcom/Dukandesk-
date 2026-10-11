/**
 * Storage Cleanup Utilities
 * Handles deep purging of local storage mechanisms: IndexedDB, LocalStorage, and in-memory caches.
 */

/**
 * Purges all IndexedDB databases associated with this origin.
 * Deletes any cached offline tables, Firebase offline persistence stores, or local SQLite/Room caches.
 */
export async function clearAllLocalIndexedDB(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
      const dbs = await window.indexedDB.databases();
      const deletePromises = (dbs || []).map((dbInfo) => {
        return new Promise<void>((resolve) => {
          if (!dbInfo.name) {
            resolve();
            return;
          }
          try {
            const req = window.indexedDB.deleteDatabase(dbInfo.name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          } catch {
            resolve();
          }
        });
      });
      await Promise.all(deletePromises);
    }
  } catch (err) {
    console.warn('Notice during local IndexedDB purge:', err);
  }
}

/**
 * Purges shop data keys in LocalStorage while preserving essential authentication tokens.
 */
export function clearLocalShopStorage(): void {
  if (typeof window === 'undefined') return;

  try {
    // Keys to remove entirely
    const keysToRemove = [
      'dukanmaster_sqlite_room_db_safety_rollback_v1',
      'dukanmaster_offline_sync_queue_v2',
      'dukandesk_stock_cache',
      'dukandesk_inventory_cache',
    ];

    keysToRemove.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {}
    });

    // Mark wipe state so startup & cloud sync engine respect the clean state
    localStorage.setItem('dukandesk_wiped_clean', 'true');
    localStorage.setItem('dukandesk_firestore_seeded', 'wiped');
  } catch (err) {
    console.warn('Notice during LocalStorage wipe cleanup:', err);
  }
}
