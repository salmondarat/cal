import { ScheduledPost } from '../types';
import { toUserMessage } from './errorMessages';

export interface MediaRefSummary {
  name: string;
  kind: 'media' | 'library' | 'remote' | 'missing';
}

export interface Diagnostics {
  mediaRefs?: MediaRefSummary[];
  warnings?: string[];
}

export type ManagedPost = ScheduledPost & Diagnostics;

export interface SchedulerInfo {
  tickSeconds: number;
  graceMinutes: number;
  maxAttempts: number;
  supported: string[];
}

export interface PostsSnapshot {
  posts: ManagedPost[];
  timezone: string;
  serverTime: string;
  scheduler: SchedulerInfo;
}

export interface ValidationCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface ValidationResult {
  ready: boolean;
  checks: ValidationCheck[];
  publicBaseUrl: string | null;
  timezone: string;
  publishAt: string;
}

export interface Readiness {
  publicBaseUrl: string | null;
  publicReachable: boolean;
  publicProbeError?: string;
  timezone: string;
  serverTime: string;
  scheduler: SchedulerInfo;
  accounts: {
    instagram: { id: string; name: string }[];
    threads: { id: string; name: string } | null;
  };
  logFile: string;
}

export interface PublishLogEntry {
  ts: string;
  event: string;
  postId?: string;
  platform?: string;
  status?: string;
  error?: string;
  [key: string]: unknown;
}

export class ServerOfflineError extends Error {
  constructor() {
    super('The local service is unreachable. Make sure it is running, then try again.');
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120000), ...init });
  } catch (err) {
    if (err instanceof TypeError || (err as any)?.name === 'TimeoutError') throw new ServerOfflineError();
    throw err;
  }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(toUserMessage(body?.error, body?.error || 'The schedule service did not respond.'));
  return body as T;
}

export function fetchPosts(): Promise<PostsSnapshot> {
  return request<PostsSnapshot>('/api/posts');
}

export function getServerPost(id: string): Promise<ManagedPost> {
  return request<ManagedPost>(`/api/posts/${encodeURIComponent(id)}`);
}

export function putPost(post: ScheduledPost): Promise<ManagedPost> {
  return request<ManagedPost>(`/api/posts/${encodeURIComponent(post.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(post),
  });
}

export function syncPosts(posts: ScheduledPost[]): Promise<{ imported: string[]; posts: ManagedPost[] }> {
  return request('/api/posts/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ posts }),
  });
}

export function deleteServerPost(
  id: string,
): Promise<{ removed: string; stillLiveOn: { platform: string; permalink?: string }[]; note?: string }> {
  return request(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function validatePost(id: string): Promise<ValidationResult> {
  return request<ValidationResult>(`/api/posts/${encodeURIComponent(id)}/validate`, { method: 'POST' });
}

export function startPublish(id: string, platforms?: string[]): Promise<{ started: boolean; status: string }> {
  return request(`/api/posts/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(platforms?.length ? { platforms } : {}),
  });
}

export function unpublishPost(id: string): Promise<ManagedPost> {
  return request<ManagedPost>(`/api/posts/${encodeURIComponent(id)}/unpublish`, { method: 'POST' });
}

export function refreshLinks(id: string): Promise<{ post: ManagedPost; updated: string[] }> {
  return request(`/api/posts/${encodeURIComponent(id)}/refresh-links`, { method: 'POST' });
}

export function fetchReadiness(): Promise<Readiness> {
  return request<Readiness>('/api/publish/readiness');
}

export function fetchPublishLog(limit = 80, postId?: string): Promise<{ entries: PublishLogEntry[]; file: string }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (postId) params.set('postId', postId);
  return request(`/api/publish/log?${params.toString()}`);
}

const SETTLED = ['published', 'partial', 'failed', 'draft'];

// Publishing runs on the backend so it survives a closed tab; the browser
// follows along until the job lands on a real outcome.
export async function pollUntilSettled(
  id: string,
  onUpdate?: (post: ManagedPost) => void,
  timeoutMs = 6 * 60 * 1000,
): Promise<ManagedPost> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const post = await getServerPost(id);
    onUpdate?.(post);
    if (SETTLED.includes(post.status || '')) return post;
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error('Instagram is still processing this media. The job keeps running on the backend — check Manage posts in a minute.');
}

export function isServerOffline(err: unknown): boolean {
  return err instanceof ServerOfflineError;
}
