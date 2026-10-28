import React, { useState } from 'react';
import { Plus, ArrowDownCircle } from 'lucide-react';
import { ScheduledPost } from '../../types';
import { PLATFORMS } from '../../constants/platforms';
import { PostCard } from './PostCard';
import { localDateString } from '../../utils/localDate';

interface WeekViewProps {
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

const HOUR_START = 8;
const HOUR_END = 21;
const HOUR_H = 76;
const EVENT_MIN = 60;
const DAY_HEIGHT = (HOUR_END - HOUR_START) * HOUR_H;

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
};

const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface LaidOutPost {
  post: ScheduledPost;
  lane: number;
  lanes: number;
  start: number;
}

const layoutDay = (dayPosts: ScheduledPost[]): LaidOutPost[] => {
  const sorted = [...dayPosts].sort(
    (a, b) => toMinutes(a.scheduledTime) - toMinutes(b.scheduledTime),
  );
  const laneEnds: number[] = [];
  const placed = sorted.map((post) => {
    const start = toMinutes(post.scheduledTime);
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = start + EVENT_MIN;
    return { post, lane, start };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((item) => ({ ...item, lanes }));
};

export const WeekView: React.FC<WeekViewProps> = ({
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
  const [dropTarget, setDropTarget] = useState<{ dateStr: string; minutes: number } | null>(
    null,
  );

  // Compute 7 days for the active week (Monday start)
  const start = new Date(currentDate);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = localDateString(d);
    return {
      date: d,
      dateStr,
      dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: d.getDate(),
      isToday: dateStr === localDateString(),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    };
  });

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = nowMinutes >= HOUR_START * 60 && nowMinutes <= HOUR_END * 60;

  const minutesFromPointer = (e: React.DragEvent, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const raw = HOUR_START * 60 + (y / HOUR_H) * 60;
    return clamp(Math.round(raw / 30) * 30, HOUR_START * 60, HOUR_END * 60 - 30);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const minutes = minutesFromPointer(e, e.currentTarget);
    setDropTarget((prev) =>
      prev && prev.dateStr === dateStr && prev.minutes === minutes
        ? prev
        : { dateStr, minutes },
    );
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, dateStr: string) => {
    const related = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(related)) return;
    setDropTarget((prev) => (prev?.dateStr === dateStr ? null : prev));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dateStr: string) => {
    e.preventDefault();
    e.stopPropagation();
    const minutes = minutesFromPointer(e, e.currentTarget);
    setDropTarget(null);
    const targetTime = formatMinutes(minutes);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onDropMediaFiles) {
      onDropMediaFiles(e.dataTransfer.files, dateStr, targetTime);
      return;
    }

    const postId =
      e.dataTransfer.getData('application/x-relate-post') ||
      e.dataTransfer.getData('text/plain');
    if (postId) onMovePost(postId, dateStr, targetTime);
  };

  const hourLabels = Array.from(
    { length: Math.floor((HOUR_END - HOUR_START) / 2) + 1 },
    (_, i) => HOUR_START + i * 2,
  );

  return (
    <div className="min-h-0 flex-1 select-none overflow-auto bg-white">
      <div className="min-w-[900px]">
        {/* Day headers */}
        <div className="sticky top-0 z-20 grid grid-cols-[76px_repeat(7,minmax(0,1fr))] border-b border-[#e8ecf2] bg-white/95 backdrop-blur-[6px]">
          <div className="border-r border-[#e8ecf2]" />
          {weekDays.map((col) => (
            <div
              key={col.dateStr}
              className={`group flex items-center justify-center gap-1.5 border-r border-[#e8ecf2] px-2.5 py-2 text-center last:border-r-0 ${
                col.isToday ? 'bg-[#f5f3ff]' : ''
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-[0.08em] ${
                  col.isToday ? 'text-[#6d28d9]' : 'text-[#5b6a80]'
                }`}
              >
                {col.dayName}
              </span>
              <span
                className={`text-[11px] font-bold tabular-nums ${
                  col.isToday ? 'rounded-md bg-[#6d28d9] px-1.5 py-px text-white' : 'text-[#0f172a]'
                }`}
              >
                {col.dayNumber}
              </span>
              {col.isToday && <span className="sr-only">Today</span>}
              <button
                type="button"
                onClick={() => onQuickAdd(col.dateStr, '09:30')}
                className="ml-0.5 grid h-5 w-5 place-items-center rounded text-[#94a3b8] opacity-0 transition-opacity hover:bg-[#f4f6f9] hover:text-[#6d28d9] focus-visible:opacity-100 group-hover:opacity-100"
                title={`Schedule a post on ${col.dateStr}`}
                aria-label={`Schedule a post on ${col.dateStr}`}
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Hour grid */}
        <div className="grid grid-cols-[76px_repeat(7,minmax(0,1fr))]">
          <div className="relative border-r border-[#e8ecf2]" style={{ height: DAY_HEIGHT }}>
            {hourLabels.map((hour, index) => (
              <span
                key={hour}
                className="absolute right-2.5 text-[10px] font-medium tabular-nums text-[#5b6a80]"
                style={{
                  top: index === 0 ? 8 : (hour - HOUR_START) * HOUR_H,
                  transform: index === 0 ? 'none' : 'translateY(-0.55em)',
                }}
              >
                {hour > 12 ? hour - 12 : hour} {hour >= 12 ? 'PM' : 'AM'}
              </span>
            ))}
            {showNowLine && weekDays.some((d) => d.isToday) && (
              <span
                className="absolute right-2.5 -translate-y-1/2 rounded bg-[#ef4444] px-1 text-[9px] font-bold tabular-nums text-white"
                style={{ top: ((nowMinutes - HOUR_START * 60) / 60) * HOUR_H }}
              >
                {formatMinutes(nowMinutes)}
              </span>
            )}
          </div>

          {weekDays.map((col) => {
            const dayPosts = posts.filter((p) => p.scheduledDate === col.dateStr);
            const laidOut = layoutDay(dayPosts);
            const isDropColumn = dropTarget?.dateStr === col.dateStr;

            return (
              <div
                key={col.dateStr}
                onDragOver={(e) => handleDragOver(e, col.dateStr)}
                onDragLeave={(e) => handleDragLeave(e, col.dateStr)}
                onDrop={(e) => handleDrop(e, col.dateStr)}
                className={`relative border-r border-[#e8ecf2] last:border-r-0 ${
                  col.isToday ? 'bg-[rgba(124,58,237,0.03)]' : col.isWeekend ? 'bg-[#fcfcfd]' : 'bg-white'
                } ${isDropColumn ? 'ring-2 ring-inset ring-[#a78bfa]' : ''}`}
                style={{
                  height: DAY_HEIGHT,
                  backgroundImage:
                    'repeating-linear-gradient(to bottom, transparent 0 75px, #f1f4f8 75px 76px)',
                }}
              >
                {col.isToday && showNowLine && (
                  <span
                    className="pointer-events-none absolute inset-x-0 z-10 h-px bg-[#ef4444]"
                    style={{ top: ((nowMinutes - HOUR_START * 60) / 60) * HOUR_H }}
                    aria-label="Current time"
                  >
                    <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-[#ef4444]" />
                  </span>
                )}

                {laidOut.map(({ post, lane, lanes, start: startMin }) => {
                  const top = ((startMin - HOUR_START * 60) / 60) * HOUR_H + 3;
                  const width = 100 / lanes;
                  const platform = PLATFORMS[post.platforms[0]];

                  return (
                    <div
                      key={post.id}
                      className="absolute z-[5]"
                      style={{
                        top,
                        height: 66,
                        left: `calc(${lane * width}% + 3px)`,
                        width: `calc(${width}% - 6px)`,
                      }}
                    >
                      <div
                        className="h-full"
                        style={{
                          borderLeft: `2px solid ${platform.ringColor}`,
                          borderRadius: 4,
                        }}
                      >
                        <PostCard
                          post={post}
                          dense
                          onPreview={onPreviewPost}
                          onEdit={onEditPost}
                          onDelete={onDeletePost}
                          onPublish={onPublishPost}
                          onOpenDetail={onOpenPostDetail}
                        />
                      </div>
                    </div>
                  );
                })}

                {isDropColumn && dropTarget && (
                  <>
                    <span
                      className="pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded bg-[#7c3aed]"
                      style={{ top: ((dropTarget.minutes - HOUR_START * 60) / 60) * HOUR_H }}
                    />
                    <span
                      className="pointer-events-none absolute right-1 z-20 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#7c3aed] px-2 py-0.5 text-[9.5px] font-semibold text-white shadow-md"
                      style={{
                        top: ((dropTarget.minutes - HOUR_START * 60) / 60) * HOUR_H - 14,
                      }}
                    >
                      <ArrowDownCircle className="h-3 w-3" />
                      {formatMinutes(dropTarget.minutes)}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
