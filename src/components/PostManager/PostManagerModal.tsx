import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Send,
  RotateCw,
  ShieldCheck,
  Trash2,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ListChecks,
  ScrollText,
  WifiOff,
  Pencil,
} from 'lucide-react';
import { ScheduledPost, PlatformId, PlatformPublishResult } from '../../types';
import { PlatformIcon } from '../PlatformIcon';
import { PLATFORMS } from '../../constants/platforms';
import {
  PublishLogEntry,
  Readiness,
  ValidationCheck,
  fetchPublishLog,
  fetchReadiness,
  validatePost,
} from '../../utils/postApi';
import { toUserMessage } from '../../utils/errorMessages';
import { explainError } from '../../utils/explainError';

interface PostManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  posts: ScheduledPost[];
  backendOnline: boolean | null;
  timezone: string;
  onPublish: (post: ScheduledPost) => void;
  onUnpublish: (postId: string) => void;
  onDelete: (postId: string) => void;
  onEdit: (post: ScheduledPost) => void;
  onOpenDetail: (post: ScheduledPost) => void;
}

const STATUS_LOOK: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  scheduled: { label: 'Scheduled', className: 'bg-[#f5f3ff] text-[#6d28d9] border-[rgba(124,58,237,0.3)]' },
  publishing: { label: 'Publishing', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: 'Partial', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200' },
};

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const PostManagerModal: React.FC<PostManagerModalProps> = ({
  isOpen,
  onClose,
  posts,
  backendOnline,
  timezone,
  onPublish,
  onUnpublish,
  onDelete,
  onEdit,
  onOpenDetail,
}) => {
  const [tab, setTab] = useState<'queue' | 'log'>('queue');
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [log, setLog] = useState<PublishLogEntry[]>([]);
  const [checks, setChecks] = useState<Record<string, ValidationCheck[]>>({});
  const [checking, setChecking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!backendOnline) return;
    try {
      const [ready, entries] = await Promise.all([fetchReadiness(), fetchPublishLog(120)]);
      setReadiness(ready);
      setLog(entries.entries);
    } catch (err) {
      setNotice(toUserMessage(err, 'The schedule service did not respond.'));
    }
  }, [backendOnline]);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  const anyPublishing = posts.some((p) => p.status === 'publishing');
  useEffect(() => {
    if (!isOpen || !anyPublishing) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [isOpen, anyPublishing, refresh]);

  if (!isOpen) return null;

  const runValidation = async (post: ScheduledPost) => {
    setChecking(post.id);
    setNotice(null);
    try {
      const result = await validatePost(post.id);
      setChecks((prev) => ({ ...prev, [post.id]: result.checks }));
    } catch (err) {
      setNotice(toUserMessage(err, 'Validation did not finish.'));
    } finally {
      setChecking(null);
    }
  };

  const sorted = [...posts].sort((a, b) => (a.publishAt || a.createdAt).localeCompare(b.publishAt || b.createdAt));
  const counts = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[rgba(15,23,42,0.34)]">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-[0_24px_64px_-16px_rgba(15,23,42,0.34)] border border-[#dde3ec] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-4 bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-[8px] bg-[#0f172a] text-white flex items-center justify-center">
              <ListChecks className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[#0f172a] leading-none">Manage posts &amp; delivery</h3>
              <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                {backendOnline
                  ? `Scheduler runs on the backend (${timezone || readiness?.timezone || 'local clock'}), grace ${readiness?.scheduler.graceMinutes ?? 120} min, checks every ${readiness?.scheduler.tickSeconds ?? 20}s`
                  : 'The schedule service is offline — nothing will publish'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-0.5 p-0.5 bg-neutral-100 rounded-[8px]">
              {(['queue', 'log'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-[6px] cursor-pointer transition-colors ${
                    tab === key ? 'bg-white text-[#6d28d9] shadow-2xs' : 'text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  {key === 'queue' ? `Posts (${posts.length})` : 'Activity log'}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-[8px] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Readiness strip */}
        {tab === 'queue' && backendOnline && (
          <div className="px-5 py-2.5 border-b border-neutral-200 bg-[rgba(124,58,237,0.04)] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] shrink-0">
            <span className="flex items-center gap-1.5">
              {readiness?.publicReachable ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-red-600" />
              )}
              <span className="font-medium text-neutral-700">
                Media download URL:{' '}
                <span className="font-mono">{readiness?.publicBaseUrl || 'not configured'}</span>
                {!readiness?.publicReachable && readiness?.publicProbeError ? ` — ${readiness.publicProbeError}` : ''}
              </span>
            </span>
            <span className="text-neutral-500">
              Instagram: {readiness?.accounts.instagram.map((a) => a.name).join(', ') || 'not connected'}
            </span>
            <span className="text-neutral-500">
              Threads: {readiness?.accounts.threads?.name || 'not connected'}
            </span>
            <span className="text-neutral-500">
              Sends via API: {(readiness?.scheduler.supported || ['instagram', 'threads']).join(', ')}
            </span>
          </div>
        )}

        {notice && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800 flex items-center gap-2 shrink-0">
            <WifiOff className="w-3.5 h-3.5" />
            <span>{notice}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'queue' ? (
            !posts.length ? (
              <div className="p-10 text-center text-xs text-neutral-500">
                No posts yet. Schedule one from the calendar and it will appear here with its real delivery state.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {sorted.map((post) => {
                  const status = STATUS_LOOK[post.status] || STATUS_LOOK.draft;
                  const results = post.results || {};
                  const platformList = Object.entries(results) as [PlatformId, PlatformPublishResult][];
                  return (
                    <div key={post.id} className="p-4 hover:bg-neutral-50/60 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => onOpenDetail(post)}
                              className="text-xs font-semibold text-[#0f172a] hover:text-[#6d28d9] cursor-pointer truncate"
                              title="Open delivery details and activity trail"
                            >
                              {post.title}
                            </button>
                            <span
                              className={`px-1.5 py-0.5 rounded-[5px] border text-[9px] font-semibold uppercase tracking-wide ${status.className}`}
                            >
                              {status.label}
                            </span>
                            {(post.attempts || 0) > 0 && post.status !== 'published' && (
                              <span className="text-[10px] text-neutral-400 font-mono">
                                {post.attempts} attempt{(post.attempts || 0) > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-3 text-[11px] text-neutral-500 font-mono flex-wrap">
                            <span>
                              {post.scheduledDate} {post.scheduledTime}
                            </span>
                            <span>{post.format}</span>
                            <span>{post.media.length} file(s)</span>
                            {post.nextTryAt && <span>retry {formatWhen(post.nextTryAt)}</span>}
                          </div>

                          {post.lastError && (
                            <div className="mt-1.5 text-[11px] text-red-800 bg-red-50 border border-red-100 rounded-[6px] px-2 py-1">
                              <p className="font-semibold">{explainError(post.lastError)?.title || 'This post did not go through'}</p>
                              <details>
                                <summary className="text-[10px] text-red-700/70 cursor-pointer select-none">Technical details</summary>
                                <p className="mt-0.5 text-[10px] font-mono whitespace-pre-wrap break-words select-text">{post.lastError}</p>
                              </details>
                            </div>
                          )}

                          {platformList.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {platformList.map(([platform, result]) => (
                                <div key={platform} className="flex items-start gap-2 text-[11px]">
                                  <span className="w-4 h-4 rounded-full bg-white ring-1 ring-neutral-200 flex items-center justify-center shrink-0 mt-px">
                                    <PlatformIcon platform={platform} size={11} />
                                  </span>
                                  <span
                                    className={`font-medium shrink-0 w-20 ${
                                      result.status === 'success'
                                        ? 'text-emerald-700'
                                        : result.status === 'failed'
                                          ? 'text-red-700'
                                          : 'text-neutral-500'
                                    }`}
                                  >
                                    {PLATFORMS[platform]?.name || platform}: {result.status}
                                  </span>
                                  {result.permalink ? (
                                    <a
                                      href={result.permalink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[#6d28d9] hover:underline shrink-0"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      <span>open</span>
                                    </a>
                                  ) : null}
                                  {result.deletedAt && (
                                    <span className="text-neutral-400">removed {formatWhen(result.deletedAt)}</span>
                                  )}
                                  {result.error && !result.deletedAt && (
                                    <span className="text-neutral-600 min-w-0">{result.error}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {checks[post.id] && (
                            <div className="mt-2 p-2.5 rounded-[8px] bg-neutral-50 border border-neutral-200 space-y-1">
                              {checks[post.id].map((check) => (
                                <div key={check.label} className="flex items-start gap-1.5 text-[11px]">
                                  {check.ok ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-px" />
                                  ) : (
                                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-px" />
                                  )}
                                  <span className="font-medium text-neutral-700 shrink-0">{check.label}</span>
                                  <span className="text-neutral-500">{check.detail}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          <button
                            type="button"
                            onClick={() => onOpenDetail(post)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#6d28d9] bg-[#f5f3ff] border border-[rgba(124,58,237,0.3)] rounded-[6px] hover:bg-[#ede9fe] cursor-pointer"
                          >
                            <ScrollText className="w-3 h-3" />
                            <span>Details</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void runValidation(post)}
                            disabled={!backendOnline || checking === post.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[6px] hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
                          >
                            {checking === post.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3 h-3" />
                            )}
                            <span>Check</span>
                          </button>

                          {post.status !== 'published' && (
                            <button
                              type="button"
                              onClick={() => onPublish(post)}
                              disabled={!backendOnline}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-[#0f172a] rounded-[6px] hover:bg-[#1e293b] disabled:opacity-50 cursor-pointer"
                            >
                              {post.status === 'publishing' ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : post.status === 'failed' || post.status === 'partial' ? (
                                <RotateCw className="w-3 h-3" />
                              ) : (
                                <Send className="w-3 h-3" />
                              )}
                              <span>
                                {post.status === 'publishing'
                                  ? 'Publishing'
                                  : post.status === 'failed' || post.status === 'partial'
                                    ? 'Retry'
                                    : 'Publish now'}
                              </span>
                            </button>
                          )}

                          {platformList.some(([, r]) => r.status === 'success' && !r.deletedAt) && (
                            <button
                              type="button"
                              onClick={() => onUnpublish(post.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-[6px] hover:bg-amber-100 cursor-pointer"
                            >
                              <span>Remove from platforms</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onEdit(post)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[6px] hover:bg-neutral-50 cursor-pointer"
                            title="Edit this post"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onDelete(post.id)}
                            className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-[4px] cursor-pointer"
                            title="Remove from the schedule"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-neutral-700">
                  Backend publish trail {log.length ? `(${log.length} newest events)` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-600 border border-neutral-200 rounded-[6px] hover:bg-neutral-50 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              </div>
              {!log.length ? (
                <div className="p-8 text-center text-xs text-neutral-500 flex flex-col items-center gap-2">
                  <ScrollText className="w-5 h-5 text-neutral-300" />
                  No publish events recorded yet.
                </div>
              ) : (
                <div className="overflow-hidden rounded-[8px] border border-neutral-200">
                  <table className="w-full text-[11px]">
                    <thead className="bg-neutral-50 text-neutral-500">
                      <tr>
                        <th className="text-left font-medium px-2.5 py-1.5">Time</th>
                        <th className="text-left font-medium px-2.5 py-1.5">Event</th>
                        <th className="text-left font-medium px-2.5 py-1.5">Post</th>
                        <th className="text-left font-medium px-2.5 py-1.5">Channel</th>
                        <th className="text-left font-medium px-2.5 py-1.5">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {log.map((entry, i) => (
                        <tr key={`${entry.ts}-${i}`} className={entry.error ? 'bg-red-50/40' : undefined}>
                          <td className="px-2.5 py-1.5 font-mono text-neutral-500 whitespace-nowrap">
                            {formatWhen(entry.ts)}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono text-neutral-800 whitespace-nowrap">{entry.event}</td>
                          <td className="px-2.5 py-1.5 font-mono text-neutral-500 truncate max-w-[140px]">
                            {entry.postId || '—'}
                          </td>
                          <td className="px-2.5 py-1.5 text-neutral-600 whitespace-nowrap">{entry.platform || '—'}</td>
                          <td className="px-2.5 py-1.5 text-neutral-600">
                            {entry.error ? (
                              <span className="text-red-700">{entry.error}</span>
                            ) : (
                              <span className="font-mono text-neutral-500">
                                {[
                                  entry.status && `status=${entry.status}`,
                                  entry.platformPostId && `id=${entry.platformPostId}`,
                                  entry.permalink && `permalink=${entry.permalink}`,
                                  entry.attempt && `attempt=${entry.attempt}`,
                                  entry.trigger && `trigger=${entry.trigger}`,
                                ]
                                  .filter(Boolean)
                                  .join(' ') || '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {readiness?.logFile && (
                <p className="mt-2 text-[10px] text-neutral-400 font-mono break-all">file: {readiness.logFile}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-neutral-200 bg-white flex items-center justify-between text-[11px] text-neutral-500 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(counts).map(([key, value]) => (
              <span key={key} className="font-mono">
                {(STATUS_LOOK[key]?.label || key).toLowerCase()}={value}
              </span>
            ))}
          </div>
          <span>
            {backendOnline
              ? 'Closing this window keeps the schedule running on the backend.'
              : 'Backend offline — start it with pnpm dev:server.'}
          </span>
        </div>
      </div>
    </div>
  );
};
