import { MediaItem } from '../types';
import { SAMPLE_MEDIA_LIBRARY } from './mediaUtils';

const DB_NAME = 'RelateSocialMediaDB';
const DB_VERSION = 1;
const STORE_NAME = 'media_assets';

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveMediaItemToStorage(item: MediaItem): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Clean item copy with timestamp
      const storedItem: MediaItem = {
        ...item,
        uploadedAt: item.uploadedAt || new Date().toISOString(),
        fileRef: undefined, // Don't serialize live File pointer
      };

      const req = store.put(storedItem);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to save to IndexedDB, falling back to localStorage metadata:', e);
    saveToLocalStorageFallback(item);
  }
}

export async function getAllStoredMedia(): Promise<MediaItem[]> {
  try {
    const db = await openMediaDB();
    const items: MediaItem[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    if (items.length > 0) return items;

    // If IndexedDB is empty on first boot, initialize with sample media library
    const initialItems: MediaItem[] = [];
    for (const cat of SAMPLE_MEDIA_LIBRARY) {
      for (const item of cat.items) {
        await saveMediaItemToStorage(item);
        initialItems.push(item);
      }
    }
    return initialItems;
  } catch (e) {
    console.warn('Falling back to local storage media:', e);
    return loadFromLocalStorageFallback();
  }
}

export async function deleteStoredMediaItem(id: string): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to delete from IndexedDB:', e);
    deleteFromLocalStorageFallback(id);
  }
}

export async function clearAllStoredMedia(): Promise<void> {
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to clear IndexedDB:', e);
  }
}

// LocalStorage fallback functions
const LS_FALLBACK_KEY = 'relate_media_metadata_list';

function saveToLocalStorageFallback(item: MediaItem) {
  try {
    const existing = loadFromLocalStorageFallback();
    const updated = [item, ...existing.filter((m) => m.id !== item.id)];
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }
}

function loadFromLocalStorageFallback(): MediaItem[] {
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function deleteFromLocalStorageFallback(id: string) {
  try {
    const existing = loadFromLocalStorageFallback();
    const updated = existing.filter((m) => m.id !== id);
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(updated));
  } catch {}
}

// Convert file to Base64 Data URL for persistent offline storage
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Export metadata manifest to JSON file
export function exportMediaManifestJSON(media: MediaItem[]): void {
  const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
    JSON.stringify(media, null, 2)
  )}`;
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', jsonString);
  downloadAnchor.setAttribute('download', `relate-media-manifest-${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
