import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Send,
  RotateCw,
  ShieldCheck,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Clock,
  Copy,
  Ban,
  History,
  Package,
  ChevronDown,
} from 'lucide-react';
import { PlatformId, PlatformPublishResult } from '../../types';
import { PlatformIcon } from '../PlatformIcon';
import { PLATFORMS } from '../../constants/platforms';
import {
  ManagedPost,
  PublishLogEntry,
  ValidationCheck,
  fetchPublishLog,
  getServerPost,
  refreshLinks,
  validatePost,
} from '../../utils/postApi';
import { toUserMessage } from '../../utils/errorMessages';
import { explainError } from '../../utils/explainError';
import { formatBytes } from '../../utils/mediaUtils';

interface PostDetailModalProps {
  isOpen: boolean;
  post: ManagedPost | null;
  backendOnline: boolean | null;
  onClose: () => void;
  onPublish: (post: ManagedPost) => void;
  onUnpublish: (postId: string) => void;
  onDelete: (postId: string) => void;
  onEdit: (post: ManagedPost) => void;
  onPostUpdate?: (post: ManagedPost) => void;
}

type DetailTab = 'overview' | 'content' | 'activity';

const STATUS_LOOK: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-600 border-neutral-200' },
  scheduled: { label: 'Scheduled', className: 'bg-[#f5f3ff] text-[#6d28d9] border-[rgba(124,58,237,0.3)]' },
  publishing: { label: 'Publishing', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  published: { label: 'Published', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: 'Partial', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 border-red-200' },
};

const EVENT_LABEL: Record<string, string> = {
  'publish-start': 'Publish started',
  'provider-error': 'Platform rejected the request',
  'carousel-child-ready': 'Carousel item ready',
  'container-finished': 'Container processed',
  'platform-success': 'Published',
  'platform-failed': 'Channel failed',
  'publish-finish': 'Delivery finished',
  'publish-skipped-busy': 'Skipped — already running',
  'platform-already-published': 'Skipped — already live',
  'missed-window': 'Missed its scheduled window',
  'platform-deleted': 'Removed from platform',
  'platform-delete-failed': 'Remove from platform failed',
  'media-probe-failed': 'Media URL not downloadable',
  'threads-account-read-failed': 'Threads account read failed',
  'instagram-account-read-failed': 'Instagram account read failed',
  'instagram-account-read': 'Instagram account read',
  'scheduler-start': 'Scheduler started',
  'scheduler-error': 'Scheduler error',
  'post-created': 'Post saved',
  'post-updated': 'Post updated',
  'post-removed': 'Post removed',
  validate: 'Pre-flight check',
};

function fullTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const Field: React.FC<{ label: string; value?: React.ReactNode; className?: string }> = ({ label, value, className }) => (
  <div className={className}>
    <dt className="text-[9px] uppercase tracking-wide text-neutral-400">{label}</dt>
    <dd className="text-[11px] text-neutral-700 font-mono leading-snug break-words">{value ?? '—'}</dd>
  </div>
);

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  isOpen,
  post,
  backendOnline,
  onClose,
  onPublish,
  onUnpublish,
  onDelete,
  onEdit,
  onPostUpdate,
}) => {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [log, setLog] = useState<PublishLogEntry[]>([]);
  const [checks, setChecks] = useState<ValidationCheck[] | null>(null);
  const [busy, setBusy] = useState<'log' | 'validate' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkBusy, setLinkBusy] = useState<PlatformId | null>(null);

  const postId = post?.id;

  const loadLog = useCallback(async () => {
    if (!postId || !backendOnline) return;
    setBusy((prev) => prev ?? 'log');
    try {
      const result = await fetchPublishLog(120, postId);
      setLog(result.entries);
    } catch (err) {
      setNotice(toUserMessage(err, 'The activity log could not be loaded.'));
    } finally {
      setBusy((prev) => (prev === 'log' ? null : prev));
    }
  }, [postId, backendOnline]);

  useEffect(() => {
    if (!isOpen) return;
    setTab('overview');
    setChecks(null);
    setNotice(null);
    void loadLog();
  }, [isOpen, postId, loadLog]);

  useEffect(() => {
    if (!isOpen || post?.status !== 'publishing') return;
    const timer = setInterval(async () => {
      await loadLog();
      try {
        const fresh = await getServerPost(post.id);
        onPostUpdate?.(fresh);
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [isOpen, post?.id, post?.status, loadLog, onPostUpdate]);

  if (!isOpen || !post) return null;

  const status = STATUS_LOOK[post.status] || STATUS_LOOK.draft;
  const failure = explainError(post.lastError);
  const results = (post.results || {}) as Partial<Record<PlatformId, PlatformPublishResult>>;
  const delivered = Object.entries(results).filter(([, r]) => r?.status === 'success' && !r.deletedAt);
  const failed = Object.entries(results).filter(([, r]) => r?.status === 'failed');
  const mediaRefs = post.mediaRefs || [];

  const runValidation = async () => {
    setBusy('validate');
    setNotice(null);
    try {
      const result = await validatePost(post.id);
      setChecks(result.checks);
    } catch (err) {
      setNotice(toUserMessage(err, 'The pre-flight check did not finish.'));
    } finally {
      setBusy(null);
    }
  };

  const fetchLink = async (platform: PlatformId) => {
    setLinkBusy(platform);
    setNotice(null);
    try {
      const result = await refreshLinks(post.id);
      onPostUpdate?.(result.post);
      if (!result.updated.includes(platform)) {
        setNotice('The platform is not returning a permalink for this post yet. Try again in a minute.');
      }
    } catch (err) {
      setNotice(toUserMessage(err, 'The permalink could not be fetched.'));
    } finally {
      setLinkBusy(null);
    }
  };

  const copyTrail = async () => {
    const payload = {
      post: {
        id: post.id,
        title: post.title,
        status: post.status,
        scheduled: `${post.scheduledDate} ${post.scheduledTime}`,
        timezone: post.timezone,
        publishAt: post.publishAt,
        attempts: post.attempts,
        nextTryAt: post.nextTryAt,
        lastError: post.lastError,
        results,
        media: post.media.map((m) => ({ name: m.name, type: m.type, size: m.size, folderDate: m.folderDate })),
        platformAccounts: post.platformAccounts,
      },
      log,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('The clipboard is not available in this browser.');
    }
  };

  const tabs: { id: DetailTab; label: string; count?: number; alert?: boolean }[] = [
    { id: 'overview', label: 'Delivery', alert: Boolean(post.lastError) },
    { id: 'content', label: 'Content', count: post.media.length },
    { id: 'activity', label: 'Activity', count: log.length },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-[rgba(15,23,42,0.34)]">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-[0_24px_64px_-16px_rgba(15,23,42,0.34)] border border-[#dde3ec] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-neutral-200 bg-white shrink-0 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-[#0f172a] truncate">{post.title}</h3>
              <span className={`px-1.5 py-0.5 rounded-[5px] border text-[9px] font-semibold uppercase tracking-wide ${status.className}`}>
                {status.label}
              </span>
              {post.deletedAt && (
                <span className="px-1.5 py-0.5 rounded-[5px] border border-neutral-200 bg-neutral-100 text-[9px] font-semibold uppercase text-neutral-500">
                  Removed from platforms
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500 font-mono truncate">
              {post.scheduledDate} {post.scheduledTime} · {post.timezone || 'local'} · attempt {post.attempts || 0}
              {post.nextTryAt ? ` · next retry ${fullTime(post.nextTryAt)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={copyTrail}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[6px] hover:bg-neutral-50 cursor-pointer"
              title="Copy this post's result and activity trail as JSON"
            >
              <Copy className="w-3 h-3" />
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy trail'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-[8px] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action bar */}
        <div className="px-5 py-2 border-b border-neutral-200 flex flex-wrap items-center gap-2 shrink-0 bg-white">
          {post.status !== 'published' && (
            <button
              type="button"
              onClick={() => onPublish(post)}
              disabled={!backendOnline}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-white bg-[#0f172a] rounded-[6px] hover:bg-[#1e293b] disabled:opacity-50 cursor-pointer"
            >
              {post.status === 'publishing' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : post.status === 'failed' || post.status === 'partial' ? (
                <RotateCw className="w-3 h-3" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              <span>{post.status === 'publishing' ? 'Publishing…' : post.status === 'failed' || post.status === 'partial' ? 'Retry' : 'Publish now'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={runValidation}
            disabled={!backendOnline || busy === 'validate'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[6px] hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
          >
            {busy === 'validate' ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            <span>Run checks</span>
          </button>
          {delivered.length > 0 && (
            <button
              type="button"
              onClick={() => onUnpublish(post.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-[6px] hover:bg-amber-100 cursor-pointer"
            >
              <Ban className="w-3 h-3" />
              <span>Remove from platforms</span>
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(post)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[6px] hover:bg-neutral-50 cursor-pointer"
            >
              <span>Edit</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-red-700 bg-white border border-red-200 rounded-[6px] hover:bg-red-50 cursor-pointer"
            >
              <span>Remove from schedule</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-neutral-200 bg-white shrink-0 flex items-center gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                tab === item.id
                  ? 'border-[#6d28d9] text-[#6d28d9]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <span>{item.label}</span>
              {typeof item.count === 'number' && (
                <span className="px-1.5 py-0.5 rounded-full bg-neutral-100 text-[9px] font-semibold text-neutral-600">{item.count}</span>
              )}
              {item.alert && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          ))}
        </div>

        {notice && (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-[#fafbfd]">
          {tab === 'overview' && (
            <div className="p-4 sm:p-5 space-y-3">
              {post.lastError ? (
                <section className="rounded-[8px] border border-red-200 bg-red-50/60 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 w-full">
                      <p className="text-[12px] font-semibold text-red-900">{failure?.title || 'What went wrong'}</p>
                      {failure?.message && <p className="mt-1 text-[11px] text-red-900 leading-relaxed">{failure.message}</p>}
                      {failure?.steps?.length ? (
                        <ol className="mt-2 space-y-1">
                          {failure.steps.map((step, index) => (
                            <li key={step} className="flex gap-1.5 text-[11px] text-red-900 leading-relaxed">
                              <span className="font-semibold shrink-0">{index + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      <details className="mt-2">
                        <summary className="text-[10px] text-red-700/70 cursor-pointer select-none">Technical details</summary>
                        <p className="mt-1 text-[10px] text-red-900/80 whitespace-pre-wrap break-words font-mono leading-relaxed select-text">
                          {post.lastError}
                        </p>
                      </details>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="rounded-[8px] border border-neutral-200 bg-white p-3 flex items-center gap-2 text-[11px] text-neutral-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>
                    {post.status === 'published'
                      ? 'Every selected channel accepted this post.'
                      : 'No error recorded for this post yet.'}
                  </span>
                </section>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {post.platforms.map((platform) => {
                  const result = results[platform];
                  const resultFailure = result?.error ? explainError(result.error) : null;
                  return (
                    <article key={platform} className="rounded-[8px] border border-neutral-200 bg-white p-3">
                      <header className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-white ring-1 ring-neutral-200 flex items-center justify-center shrink-0">
                          <PlatformIcon platform={platform} size={12} />
                        </span>
                        <span className="text-[12px] font-semibold text-neutral-800">{PLATFORMS[platform]?.name || platform}</span>
                        <span
                          className={`ml-auto px-1.5 py-0.5 rounded-[5px] border text-[9px] font-semibold uppercase ${
                            !result
                              ? 'border-neutral-200 bg-neutral-50 text-neutral-500'
                              : result.status === 'success'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : result.status === 'failed'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                          }`}
                        >
                          {result ? result.status : 'not sent'}
                        </span>
                      </header>

                      {result && (
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                          <Field label="Attempted" value={fullTime(result.attemptedAt)} />
                          <Field
                            label="Duration"
                            value={typeof result.durationMs === 'number' ? `${Math.round(result.durationMs / 100) / 10}s` : '—'}
                          />
                          {result.via && <Field label="Account" value={result.via} className="col-span-2" />}
                          {result.containerId && <Field label="Container" value={result.containerId} className="col-span-2" />}
                          {result.platformPostId && <Field label="Post id" value={result.platformPostId} className="col-span-2" />}
                          {result.deletedAt && <Field label="Deleted" value={fullTime(result.deletedAt)} />}
                          {result.permalink ? (
                            <div className="col-span-2">
                              <dt className="text-[9px] uppercase tracking-wide text-neutral-400">Permalink</dt>
                              <dd>
                                <a
                                  href={result.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-[#6d28d9] hover:underline break-all"
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  <span>{result.permalink}</span>
                                </a>
                              </dd>
                            </div>
                          ) : result.profileUrl ? (
                            <div className="col-span-2">
                              <dt className="text-[9px] uppercase tracking-wide text-neutral-400">Link</dt>
                              <dd className="flex flex-wrap items-center gap-2">
                                <a
                                  href={result.profileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-[#6d28d9] hover:underline break-all"
                                >
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                  <span>{result.profileUrl}</span>
                                </a>
                                <span className="text-[10px] text-neutral-400">
                                  {platform === 'threads'
                                    ? 'Threads does not expose a per-post link through its API'
                                    : 'account link fallback'}
                                </span>
                              </dd>
                            </div>
                          ) : platform === 'instagram' && result.status === 'success' ? (
                            <div className="col-span-2">
                              <dt className="text-[9px] uppercase tracking-wide text-neutral-400">Permalink</dt>
                              <dd className="flex items-center gap-2">
                                <span className="text-[11px] text-neutral-500">not returned by the platform yet</span>
                                <button
                                  type="button"
                                  onClick={() => void fetchLink(platform)}
                                  disabled={linkBusy === platform}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-[#6d28d9] border border-[rgba(124,58,237,0.3)] rounded-[5px] hover:bg-[#f5f3ff] disabled:opacity-50 cursor-pointer"
                                >
                                  {linkBusy === platform ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                                  <span>Fetch link</span>
                                </button>
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      )}

                      {result?.error && (
                        <div className="mt-2 text-[11px] text-red-800 bg-red-50 border border-red-100 rounded-[6px] px-2 py-1.5">
                          <p className="font-semibold">{resultFailure?.title || 'This channel did not accept the post'}</p>
                          {resultFailure?.message && <p className="mt-0.5 leading-relaxed">{resultFailure.message}</p>}
                          <details className="mt-1">
                            <summary className="text-[10px] text-red-700/70 cursor-pointer select-none">Technical details</summary>
                            <p className="mt-0.5 text-[10px] font-mono whitespace-pre-wrap break-words select-text">{result.error}</p>
                          </details>
                        </div>
                      )}

                      {platform === 'instagram' && result?.status === 'success' && result.via?.startsWith('Instagram Login') && (
                        <p className="mt-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-[6px] px-2 py-1.5">
                          Meta only allows API deletes for Instagram connections made through a Facebook Page. With Instagram Login, remove this post in the Instagram app.
                        </p>
                      )}

                      {!result && (
                        <p className="mt-2 text-[11px] text-neutral-500">
                          Nothing has been sent to this channel yet.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>

              <details
                className="rounded-[8px] border border-neutral-200 bg-white"
                open={Boolean(checks && checks.some((c) => !c.ok))}
              >
                <summary className="px-3 py-2 text-[11px] font-semibold text-neutral-700 cursor-pointer flex items-center justify-between list-none">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#6d28d9]" />
                    Pre-flight checks
                  </span>
                  <span className="flex items-center gap-2 text-[10px] text-neutral-400 font-normal">
                    {checks ? `${checks.filter((c) => c.ok).length}/${checks.length} passing` : 'not run yet'}
                    <ChevronDown className="w-3 h-3" />
                  </span>
                </summary>
                <div className="border-t border-neutral-100 divide-y divide-neutral-100">
                  {checks ? (
                    checks.map((check) => (
                      <div key={check.label} className="flex items-start gap-2 px-3 py-2 text-[11px]">
                        {check.ok ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        )}
                        <span className="font-medium text-neutral-700 w-24 shrink-0">{check.label}</span>
                        <span className="text-neutral-600 whitespace-pre-wrap break-words">{check.detail}</span>
                      </div>
                    ))
                  ) : (
                    <p className="px-3 py-3 text-[11px] text-neutral-500">
                      Press <span className="font-medium">Run checks</span> to verify media, accounts and caption lengths without sending anything.
                    </p>
                  )}
                </div>
              </details>

              <section className="rounded-[8px] border border-neutral-200 bg-white p-3">
                <h4 className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2">Schedule facts</h4>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
                  <Field label="Due" value={fullTime(post.publishAt)} />
                  <Field label="Timezone" value={post.timezone} />
                  <Field label="Format" value={post.format} />
                  <Field label="Published" value={post.publishedAt ? fullTime(post.publishedAt) : '—'} />
                </dl>
              </section>
            </div>
          )}

          {tab === 'content' && (
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <section className="rounded-[8px] border border-neutral-200 bg-white p-3">
                  <h4 className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[#6d28d9]" />
                    Media ({post.media.length})
                  </h4>
                  <div className="space-y-2">
                    {post.media.map((item, index) => {
                      const ref = mediaRefs.find((r) => r.name === item.name);
                      return (
                        <div key={`${item.id}-${index}`} className="flex items-center gap-2.5">
                          <div className="w-12 h-12 rounded-[6px] overflow-hidden bg-neutral-900 shrink-0">
                            {item.type.startsWith('video/') ? (
                              <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                            ) : (
                              <img src={item.url} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-neutral-800 truncate">{item.name}</p>
                            <p className="text-[10px] text-neutral-500 font-mono">
                              {formatBytes(item.size)} · {item.type || 'unknown'}
                            </p>
                            <p className="text-[10px] text-neutral-500 font-mono">
                              {ref ? (ref.kind === 'missing' ? 'browser-only — cannot publish' : `shared ${ref.kind}`) : 'storage unknown'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {!post.media.length && <p className="text-[11px] text-neutral-500">No media attached.</p>}
                  </div>
                </section>

                <section className="rounded-[8px] border border-neutral-200 bg-white p-3">
                  <h4 className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2">Caption per channel</h4>
                  <div className="space-y-3">
                    {post.platforms.map((platform) => {
                      const override = post.platformOverrides?.[platform];
                      const caption = override?.caption ?? post.baseCaption;
                      const tags = override?.hashtags ?? post.baseHashtags;
                      const text = `${caption}${tags.length ? `\n\n${tags.join(' ')}` : ''}`;
                      const limit = PLATFORMS[platform]?.charLimit || 0;
                      const over = text.length > limit;
                      return (
                        <div key={platform}>
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-neutral-600">{PLATFORMS[platform]?.name || platform}</span>
                            <span className={over ? 'text-red-600' : 'text-neutral-400'}>
                              {text.length}/{limit || '—'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-neutral-700 whitespace-pre-wrap break-words">{text || '—'}</p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] text-neutral-500">
                  This is the exact record for a support ticket — errors appear exactly as the platforms sent them.
                </p>
                <button
                  type="button"
                  onClick={() => void loadLog()}
                  disabled={!backendOnline || busy === 'log'}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-neutral-600 border border-neutral-200 rounded-[6px] hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
                >
                  {busy === 'log' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                  <span>Refresh</span>
                </button>
              </div>

              {!backendOnline ? (
                <p className="text-[11px] text-neutral-500">The schedule service is offline, so no trail is available.</p>
              ) : !log.length ? (
                <div className="rounded-[8px] border border-neutral-200 bg-white p-6 text-center text-[11px] text-neutral-500">
                  No events recorded for this post yet.
                </div>
              ) : (
                <ol className="relative border-l border-neutral-200 ml-2 space-y-3">
                  {log.map((entry, index) => {
                    const isError = Boolean(entry.error);
                    const chips = [
                      entry.trigger && `trigger=${entry.trigger}`,
                      entry.attempt && `attempt=${entry.attempt}`,
                      entry.scope && `${entry.scope}`,
                      entry.endpoint && `POST ${entry.endpoint}`,
                      entry.httpStatus && `http=${entry.httpStatus}`,
                      entry.detail && `${entry.detail}`,
                      entry.container_id && `container=${entry.container_id}`,
                      entry.platformPostId && `id=${entry.platformPostId}`,
                    ].filter(Boolean) as string[];
                    return (
                      <li key={`${entry.ts}-${index}`} className="pl-4 relative">
                        <span
                          className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            isError ? 'bg-red-500' : entry.event === 'platform-success' ? 'bg-emerald-500' : 'bg-neutral-300'
                          }`}
                        />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[11px] font-semibold text-neutral-800">
                            {EVENT_LABEL[entry.event] || entry.event}
                          </span>
                          {entry.platform && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500">
                              <PlatformIcon platform={entry.platform as PlatformId} size={10} />
                              {PLATFORMS[entry.platform as PlatformId]?.name || entry.platform}
                            </span>
                          )}
                          <span className="text-[10px] text-neutral-400 font-mono">{fullTime(entry.ts)}</span>
                          <span className="text-[9px] text-neutral-300 font-mono">{entry.event}</span>
                        </div>
                        {entry.error && (
                          <p className="mt-0.5 text-[11px] text-red-800 whitespace-pre-wrap break-words font-mono leading-relaxed select-text">
                            {entry.error}
                          </p>
                        )}
                        {chips.length > 0 && (
                          <p className="mt-0.5 text-[10px] text-neutral-500 font-mono break-all">{chips.join(' · ')}</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-neutral-200 bg-white flex items-center justify-between gap-3 text-[10px] text-neutral-500 shrink-0">
          <span className="font-mono truncate">{post.id}</span>
          <span className="shrink-0 flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {post.nextTryAt ? `retry ${fullTime(post.nextTryAt)}` : failed.length ? 'no automatic retry left' : 'no retry queued'}
            </span>
            <History className="w-3 h-3" />
            <span>{log.length} events</span>
          </span>
        </div>
      </div>
    </div>
  );
};
