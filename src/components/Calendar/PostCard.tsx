import React, { useState } from 'react';
import {
  Clock,
  Smartphone,
  Edit2,
  Trash2,
  Play,
  Layers,
  Image as ImageIcon,
  MoreVertical,
  CheckCircle,
} from 'lucide-react';
import { ScheduledPost } from '../../types';
import { PlatformIcon } from '../PlatformIcon';
import { formatBytes } from '../../utils/mediaUtils';

interface PostCardProps {
  post: ScheduledPost;
  onPreview: (post: ScheduledPost) => void;
  onEdit: (post: ScheduledPost) => void;
  onDelete: (postId: string) => void;
  compact?: boolean;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onPreview,
  onEdit,
  onDelete,
  compact = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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

  const firstMedia = post.media[0];
  const isVideo = post.format === 'video';
  const isCarousel = post.format === 'carousel';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`group relative rounded-[8px] transition-all duration-150 cursor-grab active:cursor-grabbing select-none ${
        isDragging
          ? 'opacity-40 scale-95 border-2 border-dashed border-[#0000ee]'
          : 'bg-[rgba(24,144,255,0.05)] border border-[rgba(24,144,255,0.2)] hover:border-[rgba(24,144,255,0.45)] hover:shadow-[0_2px_8px_-2px_rgba(24,144,255,0.25)]'
      } ${compact ? 'p-1.5 mb-1.5' : 'p-2.5 mb-2'}`}
      style={{
        boxShadow: isDragging ? 'none' : 'rgba(0, 0, 0, 0.08) 0px 1px 3px -1px',
      }}
    >
      {/* Top Row: Time, Platform Icons & Action Controls */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        {/* Scheduled Time */}
        <div className="flex items-center gap-1 text-[11px] font-mono font-medium text-neutral-700 tabular-nums">
          <Clock className="w-3 h-3 text-[#0000ee]" />
          <span>{post.scheduledTime}</span>
          {post.status === 'published' && (
            <span className="inline-flex items-center text-emerald-600 text-[10px]" title="Published">
              <CheckCircle className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        {/* Platform Icons */}
        <div className="flex items-center -space-x-1">
          {post.platforms.map((pId) => (
            <div
              key={pId}
              className="w-4 h-4 rounded-full bg-white ring-1 ring-neutral-200 flex items-center justify-center shadow-2xs overflow-hidden"
              title={pId}
            >
              <PlatformIcon platform={pId} size={11} />
            </div>
          ))}
        </div>
      </div>

      {/* Media Thumbnail + Title Preview */}
      <div className="flex items-start gap-2">
        {firstMedia && (
          <div className="relative w-10 h-10 shrink-0 rounded-[6px] overflow-hidden bg-neutral-200 border border-neutral-200/80">
            {isVideo ? (
              <div className="w-full h-full relative bg-neutral-900 flex items-center justify-center">
                <video
                  src={firstMedia.url}
                  className="w-full h-full object-cover pointer-events-none opacity-80"
                  muted
                  playsInline
                />
                <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                  <Play className="w-3.5 h-3.5 text-white fill-white" />
                </div>
              </div>
            ) : (
              <img
                src={firstMedia.url}
                alt={post.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            )}

            {/* Media Type Badge */}
            <div className="absolute bottom-0 right-0 px-1 bg-black/70 text-[9px] font-mono text-white flex items-center rounded-tl-[3px]">
              {isVideo ? (
                <span>{firstMedia.duration ? `${firstMedia.duration}s` : 'VID'}</span>
              ) : isCarousel ? (
                <div className="flex items-center gap-0.5">
                  <Layers className="w-2 h-2" />
                  <span>{post.media.length}</span>
                </div>
              ) : (
                <ImageIcon className="w-2 h-2" />
              )}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-[#0f1f3d] truncate leading-tight">
            {post.title}
          </h4>
          <p className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5 leading-snug">
            {post.baseCaption}
          </p>
        </div>
      </div>

      {/* Hashtag Preview (if non-compact) */}
      {!compact && post.baseHashtags.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 overflow-hidden text-[10px] text-[#0000ee] font-mono truncate">
          {post.baseHashtags.slice(0, 3).map((tag, i) => (
            <span key={i} className="hover:underline">
              {tag}
            </span>
          ))}
          {post.baseHashtags.length > 3 && (
            <span className="text-neutral-400">+{post.baseHashtags.length - 3}</span>
          )}
        </div>
      )}

      {/* Hover Quick Action Strip */}
      <div className="mt-2 pt-1.5 border-t border-[rgba(24,144,255,0.15)] flex items-center justify-between gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPreview(post);
          }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0000ee] hover:text-[#0000aa] transition-colors cursor-pointer"
          title="Preview in Mobile Simulator"
        >
          <Smartphone className="w-3 h-3" />
          <span>Preview</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(post);
            }}
            className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-[4px] transition-colors cursor-pointer"
            title="Edit Post"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(post.id);
            }}
            className="p-1 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-[4px] transition-colors cursor-pointer"
            title="Delete Post"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
