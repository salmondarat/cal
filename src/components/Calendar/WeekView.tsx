import React, { useState } from 'react';
import { Plus, Clock, ArrowDownCircle } from 'lucide-react';
import { ScheduledPost } from '../../types';
import { PostCard } from './PostCard';

interface WeekViewProps {
  currentDate: Date;
  posts: ScheduledPost[];
  onMovePost: (postId: string, targetDate: string, targetTime?: string) => void;
  onPreviewPost: (post: ScheduledPost) => void;
  onEditPost: (post: ScheduledPost) => void;
  onDeletePost: (postId: string) => void;
  onQuickAdd: (dateStr: string, timeStr?: string) => void;
  onDropMediaFiles?: (files: FileList, targetDate: string, targetTime?: string) => void;
}

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  posts,
  onMovePost,
  onPreviewPost,
  onEditPost,
  onDeletePost,
  onQuickAdd,
  onDropMediaFiles,
}) => {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  // Compute 7 days for the active week (starting Monday or Sunday)
  const start = new Date(currentDate);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  start.setDate(diff);

  interface WeekDayInfo {
    date: Date;
    dateStr: string;
    dayName: string;
    dayNumber: number;
    isToday: boolean;
  }

  const weekDays: WeekDayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    weekDays.push({
      date: d,
      dateStr,
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: d.getDate(),
      isToday: dateStr === new Date().toISOString().split('T')[0],
    });
  }

  // Time blocks for optimal social media publishing
  const timeSlots = [
    { id: 'morning', label: 'Morning (08:00 – 12:00)', defaultTime: '09:30' },
    { id: 'afternoon', label: 'Afternoon (12:00 – 17:00)', defaultTime: '13:30' },
    { id: 'evening', label: 'Evening (17:00 – 22:00)', defaultTime: '19:00' },
  ];

  const handleDragEnter = (e: React.DragEvent, slotKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(slotKey);
  };

  const handleDragOver = (e: React.DragEvent, slotKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlot !== slotKey) {
      setDragOverSlot(slotKey);
    }
  };

  const handleDragLeave = (e: React.DragEvent, slotKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(related)) {
      return;
    }
    if (dragOverSlot === slotKey) {
      setDragOverSlot(null);
    }
  };

  const handleDrop = (
    e: React.DragEvent,
    targetDateStr: string,
    targetTime: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);

    // Support dropped media files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onDropMediaFiles) {
      onDropMediaFiles(e.dataTransfer.files, targetDateStr, targetTime);
      return;
    }

    const postId =
      e.dataTransfer.getData('application/x-relate-post') ||
      e.dataTransfer.getData('text/plain');

    if (postId) {
      onMovePost(postId, targetDateStr, targetTime);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-white select-none overflow-x-auto">
      {/* 7-Column Day Headers */}
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 min-w-[700px]">
        {weekDays.map((col) => (
          <div
            key={col.dateStr}
            className={`py-3 px-2 text-center border-r border-neutral-200/80 last:border-r-0 ${
              col.isToday ? 'bg-blue-50/50' : ''
            }`}
          >
            <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              {col.dayName}
            </div>
            <div
              className={`inline-flex items-center justify-center text-sm font-semibold mt-0.5 rounded-full ${
                col.isToday
                  ? 'w-7 h-7 bg-[#0000ee] text-white shadow-xs'
                  : 'text-neutral-900'
              }`}
            >
              {col.dayNumber}
            </div>
          </div>
        ))}
      </div>

      {/* Week Time Slots Grid */}
      <div className="divide-y divide-neutral-200/80 min-w-[700px]">
        {timeSlots.map((slot) => (
          <div key={slot.id} className="flex flex-col">
            {/* Slot Header Label */}
            <div className="bg-neutral-50/80 px-4 py-1.5 text-[11px] font-mono font-medium text-neutral-500 border-b border-neutral-200/60 flex items-center gap-1.5 pointer-events-none">
              <Clock className="w-3 h-3 text-[#0000ee]" />
              <span>{slot.label}</span>
            </div>

            {/* 7 Columns for this time slot */}
            <div className="grid grid-cols-7 divide-x divide-neutral-200/80 min-h-[145px]">
              {weekDays.map((col) => {
                const slotKey = `${col.dateStr}-${slot.id}`;
                const isOver = dragOverSlot === slotKey;

                // Match posts that fall in this date and approximate time frame
                const slotPosts = posts.filter((p) => {
                  if (p.scheduledDate !== col.dateStr) return false;
                  const hour = parseInt(p.scheduledTime.split(':')[0], 10);
                  if (slot.id === 'morning') return hour >= 0 && hour < 12;
                  if (slot.id === 'afternoon') return hour >= 12 && hour < 17;
                  if (slot.id === 'evening') return hour >= 17;
                  return false;
                });

                return (
                  <div
                    key={slotKey}
                    onDragEnter={(e) => handleDragEnter(e, slotKey)}
                    onDragOver={(e) => handleDragOver(e, slotKey)}
                    onDragLeave={(e) => handleDragLeave(e, slotKey)}
                    onDrop={(e) => handleDrop(e, col.dateStr, slot.defaultTime)}
                    className={`p-2 transition-all relative group flex flex-col ${
                      col.isToday ? 'bg-blue-50/20' : 'bg-white'
                    } ${
                      isOver
                        ? 'bg-blue-50/70 ring-2 ring-inset ring-[#0000ee] shadow-inner'
                        : 'hover:bg-neutral-50/40'
                    }`}
                  >
                    <div className="flex justify-end mb-1">
                      <button
                        type="button"
                        onClick={() => onQuickAdd(col.dateStr, slot.defaultTime)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-[#0000ee] hover:bg-neutral-100 rounded-[4px] transition-all cursor-pointer"
                        title={`Schedule post at ${slot.defaultTime}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-2">
                      {slotPosts.map((post) => (
                        <PostCard
                          key={post.id}
                          post={post}
                          onPreview={onPreviewPost}
                          onEdit={onEditPost}
                          onDelete={onDeletePost}
                        />
                      ))}
                    </div>

                    {/* Non-shifting floating drop indicator */}
                    {isOver && (
                      <div className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-[#0000ee] text-white text-[10px] font-medium shadow-md flex items-center gap-1 z-20 whitespace-nowrap animate-in fade-in duration-100">
                        <ArrowDownCircle className="w-3 h-3" />
                        <span>Drop here ({slot.defaultTime})</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
