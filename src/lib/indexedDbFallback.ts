/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction } from "@/src/types";
import { 
  collection, 
  doc, 
  writeBatch, 
  addDoc, 
  setDoc, 
  deleteDoc, 
  getDocs,
  Firestore 
} from "firebase/firestore";

const DB_NAME = "modern_pos_offline_db";
const DB_VERSION = 1;

export interface OfflineSaleRecord {
  date: string; // YYYY-MM-DD
  dayName?: string;
  employeeSales: Record<string, number>; // employeeId -> amount
  wholesaleAmount: number;
  depositAmount: number;
  totalSales: number;
  savedAt: string; // ISO string
  syncedToFirestore: boolean;
}

export interface SyncQueueItem {
  id: string;
  collectionName: "transactions" | "sales" | "settings";
  action: "create" | "update" | "delete";
  docId?: string;
  data?: any;
  timestamp: string;
  retries: number;
}

export interface OfflineStorageStats {
  transactionsCount: number;
  salesCount: number;
  pendingSyncCount: number;
  lastSyncTime: string | null;
  isStorageReady: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getIndexedDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not supported in this environment"));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Transactions Store
        if (!db.objectStoreNames.contains("transactions")) {
          const txStore = db.createObjectStore("transactions", { keyPath: "id" });
          txStore.createIndex("date", "date", { unique: false });
          txStore.createIndex("category", "category", { unique: false });
          txStore.createIndex("type", "type", { unique: false });
        }

        // Sales Records Store (keyed by date YYYY-MM-DD)
        if (!db.objectStoreNames.contains("sales_records")) {
          const salesStore = db.createObjectStore("sales_records", { keyPath: "date" });
          salesStore.createIndex("savedAt", "savedAt", { unique: false });
        }

        // Pending Sync Queue Store
        if (!db.objectStoreNames.contains("pending_sync_queue")) {
          const syncStore = db.createObjectStore("pending_sync_queue", { keyPath: "id" });
          syncStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        // Metadata Store (Key-Value)
        if (!db.objectStoreNames.contains("metadata")) {
          db.createObjectStore("metadata", { keyPath: "key" });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error("Failed to open IndexedDB fallback database:", request.error);
        reject(request.error);
      };
    });
  }

  return dbPromise;
}

// -------------------------------------------------------------
// Transaction Persistence Operations
// -------------------------------------------------------------

export async function saveTransactionsToIndexedDB(transactions: Transaction[]): Promise<void> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");

    for (const item of transactions) {
      if (item && (item.id || (item as any)._id)) {
        const id = item.id || (item as any)._id;
        store.put({ ...item, id, _lastCachedAt: new Date().toISOString() });
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Error caching transactions in IndexedDB:", error);
  }
}

export async function getTransactionsFromIndexedDB(): Promise<Transaction[]> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("transactions", "readonly");
    const store = tx.objectStore("transactions");
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const list = (request.result || []) as Transaction[];
        // Sort descending by date
        list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Error fetching transactions from IndexedDB:", error);
    return [];
  }
}

export async function saveSingleTransactionOffline(
  transaction: Transaction, 
  enqueueSync: boolean = true
): Promise<string> {
  const db = await getIndexedDB();
  const tx = db.transaction(["transactions", "pending_sync_queue"], "readwrite");
  const txStore = tx.objectStore("transactions");
  const syncStore = tx.objectStore("pending_sync_queue");

  const docId = transaction.id || `local_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const fullTx: Transaction = {
    ...transaction,
    id: docId,
  };

  txStore.put({ ...fullTx, _lastCachedAt: new Date().toISOString(), _isOfflineCreated: true });

  if (enqueueSync) {
    const syncItem: SyncQueueItem = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      collectionName: "transactions",
      action: transaction.id ? "update" : "create",
      docId: docId,
      data: fullTx,
      timestamp: new Date().toISOString(),
      retries: 0
    };
    syncStore.put(syncItem);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      triggerStorageUpdateEvent();
      resolve(docId);
    };
    tx.onerror = () => reject(tx.error);
  });
}

// -------------------------------------------------------------
// Daily Sales Record Persistence
// -------------------------------------------------------------

export async function saveSalesRecordToIndexedDB(
  record: OfflineSaleRecord, 
  enqueueSync: boolean = true
): Promise<void> {
  const db = await getIndexedDB();
  const tx = db.transaction(["sales_records", "pending_sync_queue"], "readwrite");
  const salesStore = tx.objectStore("sales_records");
  const syncStore = tx.objectStore("pending_sync_queue");

  salesStore.put(record);

  if (enqueueSync) {
    const syncItem: SyncQueueItem = {
      id: `sync_sales_${record.date}_${Date.now()}`,
      collectionName: "sales",
      action: "create",
      docId: record.date,
      data: record,
      timestamp: new Date().toISOString(),
      retries: 0
    };
    syncStore.put(syncItem);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      triggerStorageUpdateEvent();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSalesRecordFromIndexedDB(date: string): Promise<OfflineSaleRecord | null> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("sales_records", "readonly");
    const store = tx.objectStore("sales_records");
    const request = store.get(date);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Error getting offline sales record:", error);
    return null;
  }
}

export async function getAllSalesRecordsFromIndexedDB(): Promise<OfflineSaleRecord[]> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("sales_records", "readonly");
    const store = tx.objectStore("sales_records");
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const records = (request.result || []) as OfflineSaleRecord[];
        records.sort((a, b) => b.date.localeCompare(a.date));
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Error getting all offline sales records:", error);
    return [];
  }
}

// -------------------------------------------------------------
// Pending Sync Queue Operations
// -------------------------------------------------------------

export async function getPendingSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("pending_sync_queue", "readonly");
    const store = tx.objectStore("pending_sync_queue");
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("Error reading sync queue:", error);
    return [];
  }
}

export async function removePendingSyncItem(id: string): Promise<void> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("pending_sync_queue", "readwrite");
    const store = tx.objectStore("pending_sync_queue");
    store.delete(id);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        triggerStorageUpdateEvent();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Error removing sync item:", error);
  }
}

export async function clearAllPendingSyncQueue(): Promise<void> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("pending_sync_queue", "readwrite");
    tx.objectStore("pending_sync_queue").clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        triggerStorageUpdateEvent();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Error clearing sync queue:", error);
  }
}

// -------------------------------------------------------------
// Synchronization with Firestore
// -------------------------------------------------------------

export async function syncOfflineDataWithFirestore(
  firestoreInstance: Firestore, 
  currentUserId: string
): Promise<{ syncedCount: number; errors: number }> {
  const queue = await getPendingSyncQueue();
  if (queue.length === 0) {
    await updateMetadata("lastSyncTime", new Date().toISOString());
    return { syncedCount: 0, errors: 0 };
  }

  let syncedCount = 0;
  let errors = 0;

  for (const item of queue) {
    try {
      if (item.collectionName === "transactions" && item.data) {
        const txData = { ...item.data };
        delete txData._lastCachedAt;
        delete txData._isOfflineCreated;

        if (item.action === "create") {
          // If it was a local temporary ID, let Firestore generate or set doc cleanly
          if (item.docId && item.docId.startsWith("local_tx_")) {
            const newDocRef = doc(collection(firestoreInstance, "transactions"));
            txData.id = newDocRef.id;
            txData.createdBy = txData.createdBy || currentUserId;
            await setDoc(newDocRef, txData);
          } else if (item.docId) {
            await setDoc(doc(firestoreInstance, "transactions", item.docId), txData);
          } else {
            await addDoc(collection(firestoreInstance, "transactions"), txData);
          }
        } else if (item.action === "update" && item.docId) {
          await setDoc(doc(firestoreInstance, "transactions", item.docId), txData, { merge: true });
        } else if (item.action === "delete" && item.docId) {
          await deleteDoc(doc(firestoreInstance, "transactions", item.docId));
        }

        await removePendingSyncItem(item.id);
        syncedCount++;
      } else if (item.collectionName === "sales" && item.data) {
        // Sales bulk payload
        const saleRecord = item.data as OfflineSaleRecord;
        const batch = writeBatch(firestoreInstance);

        // Process employee sales
        for (const [empId, amt] of Object.entries(saleRecord.employeeSales || {})) {
          if (amt > 0) {
            const newRef = doc(collection(firestoreInstance, "transactions"));
            const newTx: Transaction = {
              date: new Date(saleRecord.date).toISOString(),
              type: "income",
              category: "Employee Sales",
              amount: amt,
              paymentMethod: "Cash",
              notes: `Offline synced daily sales for employee`,
              createdBy: currentUserId,
              employeeId: empId,
              subCategory: "Sales Sync"
            };
            batch.set(newRef, newTx);
          }
        }

        // Wholesale
        if (saleRecord.wholesaleAmount > 0) {
          const wRef = doc(collection(firestoreInstance, "transactions"));
          const wTx: Transaction = {
            date: new Date(saleRecord.date).toISOString(),
            type: "income",
            category: "Wholesale Sales",
            amount: saleRecord.wholesaleAmount,
            paymentMethod: "Cash",
            notes: `Offline synced wholesale sales for ${saleRecord.date}`,
            createdBy: currentUserId,
            subCategory: "Wholesale"
          };
          batch.set(wRef, wTx);
        }

        // Deposit
        if (saleRecord.depositAmount > 0) {
          const dRef = doc(collection(firestoreInstance, "transactions"));
          const dTx: Transaction = {
            date: new Date(saleRecord.date).toISOString(),
            type: "income",
            category: "Total Deposit",
            amount: saleRecord.depositAmount,
            paymentMethod: "Cash",
            notes: `Offline synced deposit for ${saleRecord.date}`,
            createdBy: currentUserId,
            subCategory: "Deposit"
          };
          batch.set(dRef, dTx);
        }

        await batch.commit();
        await removePendingSyncItem(item.id);
        syncedCount++;
      }
    } catch (err) {
      console.error("Failed syncing item to Firestore:", item, err);
      errors++;
    }
  }

  await updateMetadata("lastSyncTime", new Date().toISOString());
  triggerStorageUpdateEvent();

  return { syncedCount, errors };
}

// -------------------------------------------------------------
// Metadata & Stats
// -------------------------------------------------------------

export async function updateMetadata(key: string, value: any): Promise<void> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("metadata", "readwrite");
    tx.objectStore("metadata").put({ key, value, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.warn("Failed to update metadata in IndexedDB", e);
  }
}

export async function getMetadata(key: string): Promise<any> {
  try {
    const db = await getIndexedDB();
    const tx = db.transaction("metadata", "readonly");
    const req = tx.objectStore("metadata").get(key);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getOfflineStorageStats(): Promise<OfflineStorageStats> {
  try {
    const db = await getIndexedDB();
    
    const countStore = (storeName: string): Promise<number> => {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, "readonly");
          const req = tx.objectStore(storeName).count();
          req.onsuccess = () => resolve(req.result || 0);
          req.onerror = () => resolve(0);
        } catch {
          resolve(0);
        }
      });
    };

    const [txCount, salesCount, syncCount, lastSyncTime] = await Promise.all([
      countStore("transactions"),
      countStore("sales_records"),
      countStore("pending_sync_queue"),
      getMetadata("lastSyncTime")
    ]);

    return {
      transactionsCount: txCount,
      salesCount: salesCount,
      pendingSyncCount: syncCount,
      lastSyncTime: lastSyncTime || null,
      isStorageReady: true
    };
  } catch {
    return {
      transactionsCount: 0,
      salesCount: 0,
      pendingSyncCount: 0,
      lastSyncTime: null,
      isStorageReady: false
    };
  }
}

export async function clearAllOfflineData(): Promise<void> {
  try {
    const db = await getIndexedDB();
    const storeNames = ["transactions", "sales_records", "pending_sync_queue", "metadata"];
    const tx = db.transaction(storeNames, "readwrite");
    storeNames.forEach((store) => {
      tx.objectStore(store).clear();
    });
    triggerStorageUpdateEvent();
  } catch (e) {
    console.warn("Failed to clear offline storage data:", e);
  }
}

function triggerStorageUpdateEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("indexeddb-storage-updated"));
  }
}
