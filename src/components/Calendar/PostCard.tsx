import React, { useState } from 'react';
import {
  Clock,
  Smartphone,
  Edit2,
  Trash2,
  Layers,
  Image as ImageIcon,
  Film,
  Send,
  RotateCw,
  Loader2,
  AlertCircle,
  History,
  Copy,
  Check,
} from 'lucide-react';
import { ScheduledPost } from '../../types';
import { PLATFORMS } from '../../constants/platforms';
import { fetchPublishLog } from '../../utils/postApi';
import { friendlyErrorTitle, explainError } from '../../utils/explainError';

interface PostCardProps {
  post: ScheduledPost;
  onPreview: (post: ScheduledPost) => void;
  onEdit: (post: ScheduledPost) => void;
  onDelete: (postId: string) => void;
  onOpenDetail?: (post: ScheduledPost) => void;
  onPublish?: (post: ScheduledPost) => void;
  compact?: boolean;
  dense?: boolean;
}

const STATUS_LOOK: Record<string, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-white/75 text-slate-600 border-slate-300/70',
  },
  scheduled: {
    label: 'Scheduled',
    className: 'bg-[#f5f3ff] text-[#5b21b6] border-[#ddd6fe]',
  },
  publishing: {
    label: 'Sending',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  published: {
    label: 'Published',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  partial: {
    label: 'Partial',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
};

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onPreview,
  onEdit,
  onDelete,
  onOpenDetail,
  onPublish,
  compact = false,
  dense = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  // Copies this card's delivery result plus its backend trail, ready to paste
  // into a support ticket.
  const copyTrail = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCopyState('busy');
    try {
      let entries: unknown[] = [];
      try {
        entries = (await fetchPublishLog(50, post.id)).entries;
      } catch {}
      const payload = {
        post: {
          id: post.id,
          title: post.title,
          status: post.status,
          scheduledDate: post.scheduledDate,
          scheduledTime: post.scheduledTime,
          timezone: post.timezone,
          publishAt: post.publishAt,
          attempts: post.attempts,
          nextTryAt: post.nextTryAt,
          lastError: post.lastError,
          format: post.format,
          platforms: post.platforms,
          platformAccounts: post.platformAccounts,
          media: post.media.map((m) => ({ name: m.name, type: m.type, size: m.size, folderDate: m.folderDate })),
          results: post.results,
        },
        log: entries,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopyState('done');
      setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.stopPropagation();
    e.dataTransfer.setData('application/x-relate-post', post.id);
    e.dataTransfer.setData('text/plain', post.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(false);
  };

  const primaryPlatform = PLATFORMS[post.platforms[0]];
  const status = STATUS_LOOK[post.status] || STATUS_LOOK.draft;
  const isPublishing = post.status === 'publishing';
  const canPublish = Boolean(onPublish) && !isPublishing && post.status !== 'published';
  const deliveredCount = Object.values(post.results || {}).filter(
    (r) => r.status === 'success' && !r.deletedAt,
  ).length;
  const channelNames = post.platforms.map((id) => PLATFORMS[id].name).join(', ');
  const isAttention = post.status === 'failed' || post.status === 'partial';

  const dragProps = {
    draggable: true,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
  };

  const tint = {
    background: primaryPlatform?.accentBg || '#fafbfd',
    borderColor: primaryPlatform?.badgeBorder || '#e8ecf2',
  };

  if (compact) {
    return (
      <div
        {...dragProps}
        onClick={() => onOpenDetail?.(post)}
        title={`${post.scheduledTime} · ${post.title} · ${channelNames}`}
        className={`group flex cursor-pointer items-center gap-1.5 overflow-hidden rounded-[7px] border px-1.5 py-1 text-[9.5px] font-semibold transition-all hover:shadow-[0_2px_8px_rgba(15,23,42,0.1)] ${
          isDragging ? 'opacity-40' : ''
        }`}
        style={{ ...tint, color: '#0f172a' }}
      >
        <span className="shrink-0 tabular-nums text-[#334155]">{post.scheduledTime}</span>
        <span className="min-w-0 flex-1 truncate">{post.title}</span>
        {isAttention && (
          <span
            className="shrink-0 rounded-[3px] border border-red-200 bg-red-50 px-1 text-[8px] font-extrabold leading-[1.4] text-[#b91c1c]"
            title={explainError(post.lastError)?.message || 'Needs attention'}
          >
            !
          </span>
        )}
        {post.status === 'draft' && (
          <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-[#5b6a80]">
            draft
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      {...dragProps}
      onClick={() => onOpenDetail?.(post)}
      title={onOpenDetail ? 'Open details: delivery result and activity trail' : undefined}
      className={`group relative select-none overflow-hidden rounded-[10px] border text-left transition-all duration-150 ${
        onOpenDetail ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${
        isDragging
          ? 'scale-[0.98] border-2 border-dashed border-[#6d28d9] opacity-40'
          : 'hover:-translate-y-px hover:shadow-[0_3px_10px_rgba(15,23,42,0.1)]'
      } ${dense ? 'px-1.5 py-1' : 'px-2 py-1.5'}`}
      style={tint}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="flex items-center gap-1 text-[10px] font-bold tabular-nums"
          style={{ color: primaryPlatform?.textColor || '#334155' }}
        >
          <Clock className="h-2.5 w-2.5" />
          {post.scheduledTime}
        </span>
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded-[4px] border px-1 py-px text-[8px] font-bold uppercase tracking-[0.04em] ${status.className}`}
          title={explainError(post.lastError)?.message || `${status.label} for ${channelNames}`}
        >
          {isPublishing && <Loader2 className="h-2 w-2 animate-spin" />}
          {status.label}
        </span>
      </div>

      <h4
        className={`mt-0.5 font-semibold leading-[1.25] text-[#0f172a] ${
          dense ? 'line-clamp-2 text-[10.5px]' : 'line-clamp-2 text-[11.5px]'
        }`}
      >
        {post.title}
      </h4>

      {!dense && (
        <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-snug text-[#334155]/90">
          {post.baseCaption}
        </p>
      )}

      {isAttention && !dense && (
        <div
          className="mt-1 flex items-start gap-1 rounded-[5px] border border-red-100 bg-red-50/80 px-1 py-0.5 text-[9.5px] leading-snug text-red-700"
          title={explainError(post.lastError)?.message || post.lastError}
        >
          <AlertCircle className="mt-px h-2.5 w-2.5 shrink-0" />
          <span className="line-clamp-2 break-words">
            {friendlyErrorTitle(post.lastError) || post.lastError}
          </span>
        </div>
      )}

      <div className="mt-1 flex min-w-0 items-center gap-1 text-[9px] text-[#334155]/85">
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {post.platforms.slice(0, 3).map((platformId, index) => (
            <span
              key={platformId}
              className="h-[6px] w-[6px] rounded-full"
              style={{
                background: PLATFORMS[platformId].ringColor,
                marginLeft: index === 0 ? 0 : -2,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.85)',
              }}
            />
          ))}
          {post.platforms.length > 3 && <span>+{post.platforms.length - 3}</span>}
        </span>
        <span className="min-w-0 truncate">{channelNames}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[#5b6a80]">
          {post.format === 'video' ? (
            <Film className="h-2.5 w-2.5" />
          ) : post.format === 'carousel' ? (
            <Layers className="h-2.5 w-2.5" />
          ) : (
            <ImageIcon className="h-2.5 w-2.5" />
          )}
          {post.media.length > 1 && <span className="tabular-nums">{post.media.length}</span>}
        </span>
      </div>

      {/* Hover actions: overlay so the card never grows and slots never shift */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-0.5 border-t border-black/5 bg-white/95 px-1 py-1 opacity-0 backdrop-blur-[2px] transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPreview(post);
          }}
          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9.5px] font-semibold text-[#6d28d9] hover:bg-[#f5f3ff]"
          title="Preview in the device simulator"
        >
          <Smartphone className="h-2.5 w-2.5" />
          Preview
        </button>
        {onOpenDetail && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(post);
            }}
            className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9.5px] font-semibold text-[#334155] hover:bg-[#f4f6f9]"
            title="Delivery result and activity trail"
          >
            <History className="h-2.5 w-2.5" />
            Details
          </button>
        )}

        <span className="ml-auto flex items-center gap-0.5">
          {canPublish && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPublish?.(post);
              }}
              className="inline-flex items-center gap-0.5 rounded bg-[#0f172a] px-1 py-0.5 text-[9.5px] font-semibold text-white hover:bg-black"
              title={
                post.status === 'draft'
                  ? 'Publish now'
                  : deliveredCount
                    ? 'Publish again'
                    : 'Send now instead of waiting'
              }
            >
              {isAttention ? <RotateCw className="h-2.5 w-2.5" /> : <Send className="h-2.5 w-2.5" />}
              {isAttention ? 'Retry' : 'Send'}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => void copyTrail(e)}
            className="grid h-4 w-4 place-items-center rounded text-[#94a3b8] hover:bg-[#f4f6f9] hover:text-[#334155]"
            title={
              copyState === 'done'
                ? 'Trail copied'
                : copyState === 'error'
                  ? 'The clipboard is not available'
                  : 'Copy delivery result and error trail (JSON)'
            }
          >
            {copyState === 'busy' ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : copyState === 'done' ? (
              <Check className="h-2.5 w-2.5 text-emerald-600" />
            ) : (
              <Copy className="h-2.5 w-2.5" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(post);
            }}
            className="grid h-4 w-4 place-items-center rounded text-[#94a3b8] hover:bg-[#f4f6f9] hover:text-[#334155]"
            title="Edit post"
          >
            <Edit2 className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(post.id);
            }}
            className="grid h-4 w-4 place-items-center rounded text-[#94a3b8] hover:bg-red-50 hover:text-red-600"
            title="Delete post"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </span>
      </div>
    </div>
  );
};
