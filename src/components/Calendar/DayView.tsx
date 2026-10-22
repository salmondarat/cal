import React, { useState } from 'react';
import { Plus, Clock, ArrowDownCircle } from 'lucide-react';
import { ScheduledPost } from '../../types';
import { PostCard } from './PostCard';

interface DayViewProps {
  currentDate: Date;
  posts: ScheduledPost[];
  onMovePost: (postId: string, targetDate: string, targetTime?: string) => void;
  onPreviewPost: (post: ScheduledPost) => void;
  onEditPost: (post: ScheduledPost) => void;
  onDeletePost: (postId: string) => void;
  onQuickAdd: (dateStr: string, timeStr?: string) => void;
  onDropMediaFiles?: (files: FileList, targetDate: string, targetTime?: string) => void;
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
}) => {
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);

  const dateStr = currentDate.toISOString().split('T')[0];
  const dayPosts = posts.filter((p) => p.scheduledDate === dateStr);

  // Hourly slots from 08:00 to 21:00
  const hours = Array.from({ length: 14 }, (_, i) => i + 8);

  const handleDragEnter = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverHour(hour);
  };

  const handleDragOver = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverHour !== hour) {
      setDragOverHour(hour);
    }
  };

  const handleDragLeave = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(related)) {
      return;
    }
    if (dragOverHour === hour) {
      setDragOverHour(null);
    }
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

    if (postId) {
      onMovePost(postId, dateStr, formattedTime);
    }
  };

  return (
    <div className="flex-1 bg-white p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full select-none">
      {/* Day Summary Banner */}
      <div className="mb-6 p-4 rounded-[8px] bg-[rgba(24,144,255,0.06)] border border-[rgba(24,144,255,0.2)] flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[#020520]">
            {currentDate.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            {dayPosts.length === 0
              ? 'No posts scheduled for this day yet. Drag or drop posts into any hour slot.'
              : `${dayPosts.length} post${dayPosts.length > 1 ? 's' : ''} queued for publishing.`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onQuickAdd(dateStr, '09:00')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#020520] hover:bg-[#0f1f3d] rounded-[8px] transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Post Today</span>
        </button>
      </div>

      {/* Hourly Timeline */}
      <div className="space-y-3">
        {hours.map((hour) => {
          const hourFormatted = `${String(hour).padStart(2, '0')}:00`;
          const displayLabel = `${hour % 12 === 0 ? 12 : hour % 12}:00 ${
            hour >= 12 ? 'PM' : 'AM'
          }`;

          const isOver = dragOverHour === hour;

          // Posts matching this specific hour
          const hourPosts = dayPosts.filter((p) => {
            const postHour = parseInt(p.scheduledTime.split(':')[0], 10);
            return postHour === hour;
          });

          return (
            <div
              key={hour}
              onDragEnter={(e) => handleDragEnter(e, hour)}
              onDragOver={(e) => handleDragOver(e, hour)}
              onDragLeave={(e) => handleDragLeave(e, hour)}
              onDrop={(e) => handleDrop(e, hour)}
              className={`flex items-start gap-4 p-3 rounded-[8px] border transition-all relative ${
                isOver
                  ? 'bg-blue-50/70 border-[#0000ee] ring-2 ring-[#0000ee]/30 shadow-inner'
                  : 'bg-white border-neutral-200/80 hover:border-neutral-300'
              }`}
            >
              {/* Hour Label */}
              <div className="w-20 shrink-0 text-xs font-mono font-medium text-neutral-500 pt-1 pointer-events-none">
                {displayLabel}
              </div>

              {/* Hour Slot Content */}
              <div className="flex-1 min-h-[48px] flex flex-col justify-center">
                {hourPosts.length > 0 ? (
                  <div className="space-y-2">
                    {hourPosts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        onPreview={onPreviewPost}
                        onEdit={onEditPost}
                        onDelete={onDeletePost}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-neutral-400 text-xs">
                    <span className="text-[11px] text-neutral-400 italic pointer-events-none">
                      {isOver ? `Release drop to schedule at ${hourFormatted}` : 'Empty slot'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onQuickAdd(dateStr, hourFormatted)}
                      className="p-1 text-neutral-400 hover:text-[#0000ee] hover:bg-neutral-100 rounded-[4px] transition-colors cursor-pointer"
                      title={`Schedule at ${hourFormatted}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Non-shifting floating drop indicator */}
              {isOver && (
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full bg-[#0000ee] text-white text-[11px] font-medium shadow-md flex items-center gap-1 z-20 whitespace-nowrap animate-in fade-in duration-100">
                  <ArrowDownCircle className="w-3.5 h-3.5" />
                  <span>Schedule at {hourFormatted}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
