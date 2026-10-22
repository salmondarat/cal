import React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Sparkles } from 'lucide-react';
import { CalendarViewMode } from '../../types';

interface CalendarHeaderProps {
  currentDate: Date;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
}) => {
  // Format header title based on viewMode
  const monthName = currentDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const getWeekRangeLabel = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    start.setDate(diff);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const formatDay = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `${formatDay(start)} – ${formatDay(end)}, ${end.getFullYear()}`;
  };

  const getDayLabel = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const title =
    viewMode === 'month'
      ? monthName
      : viewMode === 'week'
      ? getWeekRangeLabel(currentDate)
      : getDayLabel(currentDate);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-3.5 bg-white border-b border-neutral-200/70">
      {/* Date Navigation */}
      <div className="flex items-center gap-2">
        <div className="flex items-center border border-neutral-200 rounded-[8px] bg-[#fcfcfc] overflow-hidden shadow-2xs">
          <button
            onClick={onPrev}
            className="p-1.5 hover:bg-neutral-100 text-neutral-700 transition-colors"
            title="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onToday}
            className="px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100 transition-colors border-x border-neutral-200"
          >
            Today
          </button>
          <button
            onClick={onNext}
            className="p-1.5 hover:bg-neutral-100 text-neutral-700 transition-colors"
            title="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <h2 className="text-base sm:text-lg font-semibold text-[#0f1f3d] tracking-tight ml-2">
          {title}
        </h2>
      </div>

      {/* View Switcher & Drag-Drop Guide */}
      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-neutral-500 bg-neutral-50 px-2.5 py-1 rounded-[6px] border border-neutral-200/60">
          <Sparkles className="w-3.5 h-3.5 text-[#0000ee]" />
          <span>Drag & drop cards across days or times to reschedule</span>
        </div>

        <div className="flex items-center bg-neutral-100 p-0.5 rounded-[8px] border border-neutral-200/70">
          <button
            onClick={() => onViewModeChange('month')}
            className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-all whitespace-nowrap cursor-pointer ${
              viewMode === 'month'
                ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => onViewModeChange('week')}
            className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-all whitespace-nowrap cursor-pointer ${
              viewMode === 'week'
                ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => onViewModeChange('day')}
            className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-all whitespace-nowrap cursor-pointer ${
              viewMode === 'day'
                ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Day
          </button>
        </div>
      </div>
    </div>
  );
};
