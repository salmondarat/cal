import { MediaItem } from '../types';
import { toUserMessage } from './errorMessages';

const DB_NAME = 'RelateSocialMediaDB';
const DB_VERSION = 1;
const STORE_NAME = 'media_assets';

// ---------- Universal (backend) storage mode ----------
// When server.ts is running, media lives on disk at
// <RELATE_DATA_DIR || %LOCALAPPDATA%\RelateSocial>\media\YYYY-MM-DD\<file>
// — shared across every build, port, and browser. Without the backend we
// fall back to per-origin IndexedDB.

let serverMode: boolean | null = null;

export async function getMediaStorageInfo(): Promise<any | null> {
  try {
    const res = await fetch('/api/storage/info', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function serverAvailable(): Promise<boolean> {
  if (serverMode === null) serverMode = Boolean(await getMediaStorageInfo());
  return serverMode;
}

function localDateFolder(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function asArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const out = new ArrayBuffer(data.byteLength);
  new Uint8Array(out).set(data);
  return out;
}

async function uploadBufferToServer(date: string, name: string, data: ArrayBuffer | Uint8Array): Promise<MediaItem> {
  const blob = new Blob([asArrayBuffer(data)]);
  const res = await fetch(
    `/api/storage/media?date=${date}&name=${encodeURIComponent(name)}`,
    { method: 'POST', body: blob },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(toUserMessage((body as any)?.error, 'The media upload did not finish. Please try again.'));
  }
  const saved: any = await res.json();
  return {
    id: `${saved.date}/${saved.name}`,
    name: saved.name,
    url: saved.url,
    size: saved.size,
    type: saved.type,
    uploadedAt: saved.modifiedAt,
    serverManaged: true,
    folderDate: saved.date,
  };
}

async function saveToServer(item: MediaItem, date: string): Promise<void> {
  if (item.serverManaged) return; // already on disk
  if (item.fileRef) {
    await uploadBufferToServer(date, item.fileRef.name, await item.fileRef.arrayBuffer());
  } else if (typeof item.url === 'string' && item.url.startsWith('data:')) {
    const [meta, b64] = item.url.split(',');
    const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' } as Record<string, string>)[meta.match(/data:([^;]+)/)?.[1] || ''] || '.bin';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    await uploadBufferToServer(date, `${item.name || 'media'}${ext}`, bytes);
  }
  // remote http(s) URLs stay as-is: they are already shared, no copy needed
}

function serverItemToFileEntry(entry: any): MediaItem {
  return {
    id: `${entry.date}/${entry.name}`,
    name: entry.name,
    url: entry.url,
    playbackUrl: entry.playUrl,
    thumbnailUrl: entry.thumbUrl,
    size: entry.size,
    type: entry.type,
    uploadedAt: entry.modifiedAt,
    serverManaged: true,
    folderDate: entry.date,
  };
}

async function getAllFromServer(): Promise<MediaItem[]> {
  const dates: any[] = await fetch('/api/storage/media/dates').then((r) => r.json());
  const lists = await Promise.all(
    dates.map((d) => fetch(`/api/storage/media?date=${d.date}`).then((r) => r.json())),
  );
  return lists.flat().map(serverItemToFileEntry);
}

// ---------- IndexedDB fallback (per-origin) ----------

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

export async function saveMediaItemToStorage(item: MediaItem, dateFolder?: string): Promise<void> {
  const date = dateFolder || localDateFolder(item.uploadedAt);
  if (await serverAvailable()) {
    try {
      await saveToServer(item, date);
      return;
    } catch {
      console.warn('Media storage is unavailable right now; saving in this browser instead.');
    }
  }
  try {
    const db = await openMediaDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const storedItem: MediaItem = {
        ...item,
        uploadedAt: item.uploadedAt || new Date().toISOString(),
        fileRef: undefined,
      };
      const req = store.put(storedItem);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    console.warn('Browser storage is unavailable; saving media details locally instead.');
    saveToLocalStorageFallback(item);
  }
}

export async function getAllStoredMedia(): Promise<MediaItem[]> {
  if (await serverAvailable()) {
    try {
      const items = await getAllFromServer();
      return items;
    } catch {
      console.warn('Media storage is unavailable right now; using this browser instead.');
    }
  }
  try {
    const db = await openMediaDB();
    const items: MediaItem[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    return items;
  } catch {
    console.warn('Showing media saved in this browser instead.');
    return loadFromLocalStorageFallback();
  }
}

export async function deleteStoredMediaItem(id: string): Promise<void> {
  if (id.includes('/') && (await serverAvailable())) {
    const [date, name] = id.split('/');
    const res = await fetch(`/api/storage/media?date=${date}&name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    if (!res.ok) console.warn('That media item could not be removed from shared storage.');
    return;
  }
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    console.warn('That media item could not be removed from browser storage.');
    deleteFromLocalStorageFallback(id);
  }
}

export async function clearAllStoredMedia(): Promise<void> {
  if (await serverAvailable()) {
    const items = await getAllFromServer().catch(() => []);
    await Promise.all(items.map((m) => deleteStoredMediaItem(m.id)));
    return;
  }
  try {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    console.warn('Browser media storage could not be cleared.');
  }
}

// LocalStorage fallback functions
const LS_FALLBACK_KEY = 'relate_media_metadata_list';

function saveToLocalStorageFallback(item: MediaItem) {
  try {
    const existing = loadFromLocalStorageFallback();
    const updated = [item, ...existing.filter((m) => m.id !== item.id)];
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(updated));
  } catch {
    console.error('Media details could not be saved in this browser.');
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
