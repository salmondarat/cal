import { LibraryListing, LibraryRoot, MediaItem } from '../types';
import { toUserMessage } from './errorMessages';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(toUserMessage((body as any)?.error, 'The local media library did not respond. Please try again.'));
  }
  return body as T;
}

export function getLibraryRoots(): Promise<LibraryRoot[]> {
  return request<LibraryRoot[]>('/api/library/roots');
}

export function addLibraryRoot(path: string): Promise<LibraryRoot> {
  return request<LibraryRoot>('/api/library/roots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

export function pickLibraryFolder(): Promise<{ canceled: boolean; path?: string }> {
  return request<{ canceled: boolean; path?: string }>('/api/library/pick-folder', {
    method: 'POST',
  });
}

export function removeLibraryRoot(id: string): Promise<{ removed: string }> {
  return request<{ removed: string }>(`/api/library/roots/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function listLibraryFolder(rootId: string, path = ''): Promise<LibraryListing> {
  const params = new URLSearchParams({ root: rootId });
  if (path) params.set('path', path);
  return request<LibraryListing>(`/api/library/list?${params.toString()}`);
}

export function libraryFileToMediaItem(root: Pick<LibraryRoot, 'id' | 'name'>, file: { name: string; path: string; url: string; playUrl?: string; thumbUrl?: string; size: number; type: string; modifiedAt: string }): MediaItem {
  return {
    id: `library:${root.id}/${file.path}`,
    name: file.name,
    url: file.url,
    playbackUrl: file.playUrl,
    thumbnailUrl: file.thumbUrl,
    size: file.size,
    type: file.type,
    uploadedAt: file.modifiedAt,
    serverManaged: true,
    libraryPath: file.path,
    libraryRoot: root.name,
  };
}

export function splitLibraryPath(path: string): string[] {
  return path ? path.split('/').filter(Boolean) : [];
}

export function joinLibraryPath(segments: string[]): string {
  return segments.join('/');
}
