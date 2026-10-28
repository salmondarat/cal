import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarViewMode } from '../types';

interface DateBarProps {
  currentDate: Date;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  timezone: string;
}

const VIEWS: { id: CalendarViewMode; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
];

export const DateBar: React.FC<DateBarProps> = ({
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  timezone,
}) => {
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8ecf2] bg-[#fdfdfe] px-4 py-2 sm:px-7"
      aria-label="Date navigation"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onPrev}
            className="grid h-[26px] w-[26px] place-items-center rounded-md text-[#5b6a80] hover:bg-[#f4f6f9] hover:text-[#0f172a]"
            aria-label="Previous period"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="grid h-[26px] w-[26px] place-items-center rounded-md text-[#5b6a80] hover:bg-[#f4f6f9] hover:text-[#0f172a]"
            aria-label="Next period"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToday}
          className="h-[26px] rounded-lg border border-[#dde3ec] bg-white px-2.5 text-[10.5px] font-semibold text-[#334155] hover:bg-[#f4f6f9]"
        >
          Today
        </button>
        {timezone && (
          <span className="hidden pl-1 text-[10.5px] text-[#5b6a80] md:inline">
            Local time · {timezone}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-0.5 rounded-[10px] border border-[#e8ecf2] bg-[#f4f6f9] p-0.5"
          role="group"
          aria-label="Calendar view"
        >
          {VIEWS.map((view) => {
            const active = viewMode === view.id;
            return (
              <button
                key={view.id}
                type="button"
                aria-pressed={active}
                onClick={() => onViewModeChange(view.id)}
                className={`rounded-[7px] px-2.5 py-1 text-[11px] transition-all ${
                  active
                    ? 'bg-white font-bold text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.07)]'
                    : 'font-medium text-[#5b6a80] hover:text-[#0f172a]'
                }`}
              >
                {view.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
