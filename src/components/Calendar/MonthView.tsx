import React, { useState } from 'react';
import { Plus, ArrowDownCircle } from 'lucide-react';
import { ScheduledPost } from '../../types';
import { PostCard } from './PostCard';

interface MonthViewProps {
  currentDate: Date;
  posts: ScheduledPost[];
  onMovePost: (postId: string, targetDate: string) => void;
  onPreviewPost: (post: ScheduledPost) => void;
  onEditPost: (post: ScheduledPost) => void;
  onDeletePost: (postId: string) => void;
  onQuickAdd: (dateStr: string) => void;
  onDropMediaFiles?: (files: FileList, targetDate: string) => void;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  posts,
  onMovePost,
  onPreviewPost,
  onEditPost,
  onDeletePost,
  onQuickAdd,
  onDropMediaFiles,
}) => {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // First day of month & total days in month
  const firstDayOfMonth = new Date(year, month, 1);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Days in previous month
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayStr = new Date().toISOString().split('T')[0];

  interface MonthCellInfo {
    date: Date;
    dateStr: string;
    dayNumber: number;
    isCurrentMonth: boolean;
  }

  const days: MonthCellInfo[] = [];

  // Previous month trailing days
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, d);
    const dateStr = prevDate.toISOString().split('T')[0];
    days.push({
      date: prevDate,
      dateStr,
      dayNumber: d,
      isCurrentMonth: false,
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const monthFormatted = String(month + 1).padStart(2, '0');
    const dayFormatted = String(i).padStart(2, '0');
    const dateStr = `${year}-${monthFormatted}-${dayFormatted}`;
    days.push({
      date: d,
      dateStr,
      dayNumber: i,
      isCurrentMonth: true,
    });
  }

  // Next month leading days to complete the 7-column grid
  const remainingCells = 7 - (days.length % 7);
  if (remainingCells < 7) {
    for (let i = 1; i <= remainingCells; i++) {
      const nextDate = new Date(year, month + 1, i);
      const dateStr = nextDate.toISOString().split('T')[0];
      days.push({
        date: nextDate,
        dateStr,
        dayNumber: i,
        isCurrentMonth: false,
      });
    }
  }

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Rock-solid drag & drop handlers with zero flicker
  const handleDragEnter = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDate(dateStr);
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const handleDragLeave = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if the cursor actually exited the cell boundary
    const related = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(related)) {
      return;
    }
    if (dragOverDate === dateStr) {
      setDragOverDate(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDate(null);

    // Check for dropped media files from system
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onDropMediaFiles) {
      onDropMediaFiles(e.dataTransfer.files, targetDateStr);
      return;
    }

    // Check for moved post ID
    const postId =
      e.dataTransfer.getData('application/x-relate-post') ||
      e.dataTransfer.getData('text/plain');

    if (postId) {
      onMovePost(postId, targetDateStr);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-white select-none">
      {/* Weekday Names Header */}
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50/70 text-center py-2 text-xs font-semibold text-neutral-600">
        {weekDayNames.map((day, idx) => (
          <div key={idx} className="tracking-tight">
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day[0]}</span>
          </div>
        ))}
      </div>

      {/* Month Days Grid */}
      <div className="grid grid-cols-7 auto-rows-fr flex-1 divide-x divide-y divide-neutral-200/80 bg-neutral-100">
        {days.map((cell) => {
          const isToday = cell.dateStr === todayStr;
          const isOver = dragOverDate === cell.dateStr;

          // Find posts for this day
          const dayPosts = posts.filter((p) => p.scheduledDate === cell.dateStr);

          return (
            <div
              key={cell.dateStr}
              onDragEnter={(e) => handleDragEnter(e, cell.dateStr)}
              onDragOver={(e) => handleDragOver(e, cell.dateStr)}
              onDragLeave={(e) => handleDragLeave(e, cell.dateStr)}
              onDrop={(e) => handleDrop(e, cell.dateStr)}
              className={`min-h-[125px] sm:min-h-[145px] p-1.5 sm:p-2 flex flex-col transition-all relative group ${
                cell.isCurrentMonth ? 'bg-white' : 'bg-neutral-50/40 text-neutral-400'
              } ${
                isOver
                  ? 'bg-blue-50/70 ring-2 ring-inset ring-[#0000ee] shadow-inner'
                  : 'hover:bg-neutral-50/30'
              }`}
            >
              {/* Day Cell Header */}
              <div className="flex items-center justify-between mb-1 pointer-events-none">
                <span
                  className={`inline-flex items-center justify-center text-xs font-semibold rounded-full ${
                    isToday
                      ? 'w-6 h-6 bg-[#0000ee] text-white shadow-2xs'
                      : cell.isCurrentMonth
                      ? 'text-neutral-800'
                      : 'text-neutral-400'
                  }`}
                >
                  {cell.dayNumber}
                </span>

                {/* Quick Add Button */}
                <button
                  type="button"
                  onClick={() => onQuickAdd(cell.dateStr)}
                  className="pointer-events-auto opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-[#0000ee] hover:bg-neutral-100 rounded-[4px] transition-all cursor-pointer"
                  title={`Schedule post on ${cell.dateStr}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Day Posts List */}
              <div className="flex-1 overflow-y-auto max-h-[175px] space-y-1.5 scrollbar-thin">
                {dayPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onPreview={onPreviewPost}
                    onEdit={onEditPost}
                    onDelete={onDeletePost}
                    compact={dayPosts.length > 2}
                  />
                ))}
              </div>

              {/* Fixed Drop Target Floating Pill that NEVER shifts layout */}
              {isOver && (
                <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#0000ee] text-white text-[10px] font-medium shadow-md flex items-center gap-1 z-20 whitespace-nowrap animate-in fade-in duration-100">
                  <ArrowDownCircle className="w-3 h-3" />
                  <span>Drop to schedule</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
