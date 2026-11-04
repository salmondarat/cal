import React, { useState } from 'react';
import { Plus, ArrowDownCircle } from 'lucide-react';
import { ScheduledPost } from '../../types';
import { PostCard } from './PostCard';
import { localDateString } from '../../utils/localDate';

interface DayViewProps {
  currentDate: Date;
  posts: ScheduledPost[];
  onMovePost: (postId: string, targetDate: string, targetTime?: string) => void;
  onPreviewPost: (post: ScheduledPost) => void;
  onEditPost: (post: ScheduledPost) => void;
  onDeletePost: (postId: string) => void;
  onQuickAdd: (dateStr: string, timeStr?: string) => void;
  onDropMediaFiles?: (files: FileList, targetDate: string, targetTime?: string) => void;
  onPublishPost?: (post: ScheduledPost) => void;
  onOpenPostDetail?: (post: ScheduledPost) => void;
}

export const DayView: React.FC<DayViewProps> = ({
  currentDate,
  posts,
  onMovePost,
  onPreviewPost,
  onEditPost,
  onDeletePost,
  onQuickAdd,
  onDropMediaFiles,
  onPublishPost,
  onOpenPostDetail,
}) => {
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);

  const dateStr = localDateString(currentDate);
  const dayPosts = posts.filter((p) => p.scheduledDate === dateStr);
  const isToday = dateStr === localDateString();

  const hours = Array.from({ length: 14 }, (_, i) => i + 8);

  const handleDragOver = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverHour !== hour) setDragOverHour(hour);
  };

  const handleDragLeave = (e: React.DragEvent, hour: number) => {
    const related = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(related)) return;
    if (dragOverHour === hour) setDragOverHour(null);
  };

  const handleDrop = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverHour(null);

    const formattedTime = `${String(hour).padStart(2, '0')}:00`;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onDropMediaFiles) {
      onDropMediaFiles(e.dataTransfer.files, dateStr, formattedTime);
      return;
    }

    const postId =
      e.dataTransfer.getData('application/x-relate-post') ||
      e.dataTransfer.getData('text/plain');
    if (postId) onMovePost(postId, dateStr, formattedTime);
  };

  return (
    <div className="min-h-0 flex-1 select-none overflow-auto bg-white">
      <div className="mx-auto w-full max-w-[860px] px-4 pb-16 pt-4 sm:px-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-[#e8ecf2] pb-3">
          <div>
            <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#0f172a]">
              {currentDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
              {isToday && (
                <span className="ml-2 rounded-md bg-[#f5f3ff] px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-[0.05em] text-[#5b21b6]">
                  Today
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-[#5b6a80]">
              {dayPosts.length === 0
                ? 'Nothing scheduled. Drop a post into any hour, or use the add button.'
                : `${dayPosts.length} post${dayPosts.length > 1 ? 's' : ''} scheduled. Drag a card to another hour to reschedule.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onQuickAdd(dateStr, '09:00')}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#0f172a] px-3 text-[11.5px] font-semibold text-white transition-colors hover:bg-black"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            Add post
          </button>
        </div>

        <div>
          {hours.map((hour) => {
            const hourFormatted = `${String(hour).padStart(2, '0')}:00`;
            const displayLabel = `${hour % 12 === 0 ? 12 : hour % 12} ${
              hour >= 12 ? 'PM' : 'AM'
            }`;
            const isOver = dragOverHour === hour;
            const hourPosts = dayPosts.filter(
              (p) => parseInt(p.scheduledTime.split(':')[0], 10) === hour,
            );

            return (
              <div
                key={hour}
                onDragOver={(e) => handleDragOver(e, hour)}
                onDragLeave={(e) => handleDragLeave(e, hour)}
                onDrop={(e) => handleDrop(e, hour)}
                className={`group relative flex items-stretch border-b border-[#e8ecf2] transition-colors ${
                  isOver ? 'bg-[#f5f3ff]/60 ring-2 ring-inset ring-[#a78bfa]' : 'hover:bg-[#fafbfd]'
                }`}
              >
                <div className="w-[68px] shrink-0 border-r border-[#e8ecf2] px-2 py-2 text-right">
                  <span className="text-[10px] font-medium tabular-nums text-[#5b6a80]">
                    {displayLabel}
                  </span>
                </div>

                <div className="flex min-h-[56px] flex-1 flex-col justify-center gap-1 p-1.5">
                  {hourPosts.length > 0 ? (
                    hourPosts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onPreview={onPreviewPost}
                        onEdit={onEditPost}
                        onDelete={onDeletePost}
                        onPublish={onPublishPost}
                        onOpenDetail={onOpenPostDetail}
                      />
                    ))
                  ) : (
                    <div className="flex items-center justify-between px-1">
                      <span className="pointer-events-none text-[10.5px] italic text-[#94a3b8]">
                        {isOver ? `Release to schedule at ${hourFormatted}` : 'Open'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onQuickAdd(dateStr, hourFormatted)}
                        className="grid h-6 w-6 place-items-center rounded text-[#94a3b8] opacity-0 transition-all hover:bg-[#f4f6f9] hover:text-[#6d28d9] focus-visible:opacity-100 group-hover:opacity-100"
                        title={`Schedule at ${hourFormatted}`}
                        aria-label={`Schedule at ${hourFormatted}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {isOver && (
                  <div className="pointer-events-none absolute right-3 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#7c3aed] px-2.5 py-1 text-[10.5px] font-semibold text-white shadow-md">
                    <ArrowDownCircle className="h-3.5 w-3.5" />
                    Schedule at {hourFormatted}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
