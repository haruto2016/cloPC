/**
 * Pure client-side storage using IndexedDB for persistence.
 * This is 100% independent of any server.
 */

const DB_NAME = 'WebPC_Emulator_Storage';
const STORE_NAME = 'drives';
const DEFAULT_KEY = 'default_hd_image';

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save drive image to IndexedDB.
 */
export async function saveDrive(data: ArrayBuffer): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).put(data, DEFAULT_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Load drive image from IndexedDB.
 */
export async function loadDrive(): Promise<ArrayBuffer | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore(STORE_NAME).get(DEFAULT_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

/**
 * Clear the virtual drive.
 */
export async function deleteDrive(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = tx.objectStore(STORE_NAME).delete(DEFAULT_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Check if a drive exists in IndexedDB.
 */
export async function hasDrive(): Promise<boolean> {
  const data = await loadDrive();
  return data !== null;
}

/**
 * Export the current drive image as a downloadable file.
 */
export async function exportDrive() {
  const data = await loadDrive();
  if (!data) throw new Error('No drive data to export');
  
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'webpc_virtual_disk.img';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a drive image from a File object.
 */
export async function importDrive(file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  await saveDrive(buffer);
}
