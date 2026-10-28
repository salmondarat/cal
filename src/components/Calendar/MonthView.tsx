import React, { useState } from 'react';
import { Plus, ArrowDownCircle } from 'lucide-react';
import { ScheduledPost } from '../../types';
import { PostCard } from './PostCard';
import { localDateString } from '../../utils/localDate';

interface MonthViewProps {
  currentDate: Date;
  posts: ScheduledPost[];
  onMovePost: (postId: string, targetDate: string) => void;
  onPreviewPost: (post: ScheduledPost) => void;
  onEditPost: (post: ScheduledPost) => void;
  onDeletePost: (postId: string) => void;
  onQuickAdd: (dateStr: string) => void;
  onDropMediaFiles?: (files: FileList, targetDate: string) => void;
  onPublishPost?: (post: ScheduledPost) => void;
  onOpenPostDetail?: (post: ScheduledPost) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MonthView: React.FC<MonthViewProps> = ({
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
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayStr = localDateString();

  const firstDayOfMonth = new Date(year, month, 1);
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7; // Monday start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const days = Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(year, month, index - startOffset + 1);
    return {
      date,
      dateStr: localDateString(date),
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    };
  });

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateStr) setDragOverDate(dateStr);
  };

  const handleDragLeave = (e: React.DragEvent, dateStr: string) => {
    const related = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(related)) return;
    if (dragOverDate === dateStr) setDragOverDate(null);
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDate(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onDropMediaFiles) {
      onDropMediaFiles(e.dataTransfer.files, targetDateStr);
      return;
    }

    const postId =
      e.dataTransfer.getData('application/x-relate-post') ||
      e.dataTransfer.getData('text/plain');
    if (postId) onMovePost(postId, targetDateStr);
  };

  return (
    <div className="flex min-h-0 flex-1 select-none flex-col overflow-auto bg-white">
      {/* Weekday header */}
      <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-[#e8ecf2] bg-white/95 backdrop-blur-[6px] max-sm:hidden">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="border-r border-[#e8ecf2] px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#5b6a80] last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid flex-1 auto-rows-[minmax(112px,1fr)] grid-cols-7 max-sm:auto-rows-auto max-sm:grid-cols-1 max-sm:flex-none">
        {days.map((cell) => {
          const isToday = cell.dateStr === todayStr;
          const isOver = dragOverDate === cell.dateStr;
          const dayPosts = posts
            .filter((p) => p.scheduledDate === cell.dateStr)
            .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
          const shown = dayPosts.slice(0, 3);
          const hiddenCount = dayPosts.length - shown.length;

          return (
            <div
              key={cell.dateStr}
              onDragOver={(e) => handleDragOver(e, cell.dateStr)}
              onDragLeave={(e) => handleDragLeave(e, cell.dateStr)}
              onDrop={(e) => handleDrop(e, cell.dateStr)}
              className={`group relative flex min-h-[112px] flex-col border-b border-r border-[#e8ecf2] p-1.5 transition-colors [&:nth-child(7n)]:border-r-0 max-sm:min-h-0 max-sm:flex-row max-sm:items-start max-sm:gap-3 max-sm:border-r-0 max-sm:px-4 max-sm:py-2.5 ${
                cell.isCurrentMonth ? 'bg-white' : 'bg-[#fcfcfd]'
              } ${isToday ? 'bg-[rgba(124,58,237,0.035)]' : ''} ${
                isOver ? 'ring-2 ring-inset ring-[#6d28d9]' : 'hover:bg-[#fafbfd]'
              } ${!cell.isCurrentMonth && dayPosts.length === 0 ? 'max-sm:hidden' : ''}`}
            >
              <div className="mb-1 flex items-center justify-between max-sm:mb-0 max-sm:w-[64px] max-sm:shrink-0 max-sm:flex-col max-sm:items-start">
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    isToday
                      ? 'rounded-md bg-[#6d28d9] px-1.5 py-px text-white'
                      : cell.isCurrentMonth
                        ? 'text-[#334155]'
                        : 'text-[#94a3b8]'
                  }`}
                >
                  {cell.dayNumber}
                </span>
                <span className="hidden text-[9px] font-bold uppercase tracking-[0.06em] text-[#94a3b8] max-sm:inline">
                  {cell.date.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <button
                  type="button"
                  onClick={() => onQuickAdd(cell.dateStr)}
                  className="grid h-5 w-5 place-items-center rounded text-[#94a3b8] opacity-0 transition-opacity hover:bg-[#f4f6f9] hover:text-[#6d28d9] focus-visible:opacity-100 group-hover:opacity-100 max-sm:absolute max-sm:right-3 max-sm:top-1/2 max-sm:-translate-y-1/2 max-sm:opacity-100"
                  title={`Schedule a post on ${cell.dateStr}`}
                  aria-label={`Schedule a post on ${cell.dateStr}`}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-1 max-sm:min-w-0">
                {shown.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    compact
                    onPreview={onPreviewPost}
                    onEdit={onEditPost}
                    onDelete={onDeletePost}
                    onPublish={onPublishPost}
                    onOpenDetail={onOpenPostDetail}
                  />
                ))}
                {hiddenCount > 0 && (
                  <span className="pl-1 text-[9px] font-medium text-[#5b6a80]">
                    +{hiddenCount} more
                  </span>
                )}
              </div>

              {isOver && (
                <div className="pointer-events-none absolute bottom-1.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#7c3aed] px-2 py-0.5 text-[9.5px] font-semibold text-white shadow-md">
                  <ArrowDownCircle className="h-3 w-3" />
                  Drop to schedule
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
