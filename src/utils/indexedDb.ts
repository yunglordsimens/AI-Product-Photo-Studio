/**
 * High-Capacity IndexedDB storage engine for Creative Canvas.
 * Provides gigabytes of persistent browser storage for high-resolution images,
 * project histories, custom prompts, and product libraries.
 */

const DB_NAME = 'CreativeCanvasDB';
const DB_VERSION = 1;
const STORE_NAME = 'canvas_store';

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

export function openCanvasDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbInitPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openCanvasDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result !== undefined ? (request.result as T) : null);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn(`idbGet failed for key "${key}":`, err);
    return null;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openCanvasDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve(true);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error(`idbSet failed for key "${key}":`, err);
    return false;
  }
}

export async function idbDelete(key: string): Promise<boolean> {
  try {
    const db = await openCanvasDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`idbDelete failed for key "${key}":`, err);
    return false;
  }
}

export async function idbClear(): Promise<boolean> {
  try {
    const db = await openCanvasDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('idbClear failed:', err);
    return false;
  }
}

/**
 * Computes storage usage using navigator.storage.estimate() when supported.
 */
export async function getDiskStorageUsage(): Promise<{
  usedBytes: number;
  maxBytes: number;
  percentage: number;
  usedFormatted: string;
  totalFormatted: string;
}> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usedBytes = estimate.usage || 0;
      // Default to 10GB fallback if quota is not returned
      const maxBytes = estimate.quota || 10 * 1024 * 1024 * 1024;
      const percentage = Math.min(100, Math.round((usedBytes / maxBytes) * 100));

      const formatBytes = (bytes: number) => {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      };

      return {
        usedBytes,
        maxBytes,
        percentage,
        usedFormatted: formatBytes(usedBytes),
        totalFormatted: formatBytes(maxBytes),
      };
    }
  } catch {
    // ignore
  }

  return {
    usedBytes: 0,
    maxBytes: 10 * 1024 * 1024 * 1024,
    percentage: 0,
    usedFormatted: '0 MB',
    totalFormatted: '10 GB',
  };
}
