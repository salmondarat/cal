import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  X,
  Check,
} from 'lucide-react';
import { ALL_PLATFORM_IDS, PLATFORMS } from '../constants/platforms';
import { MediaFormat, PlatformId, StatusTab } from '../types';

interface CalendarToolbarProps {
  statusTab: StatusTab;
  onStatusTabChange: (tab: StatusTab) => void;
  tabCounts: Record<StatusTab, number>;
  selectedPlatforms: Set<PlatformId>;
  onTogglePlatform: (platform: PlatformId) => void;
  onClearPlatforms: () => void;
  selectedFormat: MediaFormat | 'all';
  onSelectFormat: (format: MediaFormat | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  platformCounts: Record<PlatformId, number>;
}

const TABS: { id: StatusTab; label: string; short: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All posts', short: 'All', icon: <CalendarDays className="h-[13px] w-[13px]" /> },
  { id: 'scheduled', label: 'Scheduled', short: 'Scheduled', icon: <CheckCircle2 className="h-[13px] w-[13px]" /> },
  { id: 'draft', label: 'Drafts', short: 'Drafts', icon: <FileText className="h-[13px] w-[13px]" /> },
  { id: 'attention', label: 'Needs attention', short: 'Attention', icon: <AlertTriangle className="h-[13px] w-[13px]" /> },
];

const FORMATS: { id: MediaFormat | 'all'; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'carousel', label: 'Carousels' },
];

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  statusTab,
  onStatusTabChange,
  tabCounts,
  selectedPlatforms,
  onTogglePlatform,
  onClearPlatforms,
  selectedFormat,
  onSelectFormat,
  searchQuery,
  onSearchChange,
  platformCounts,
}) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const hasFilter = selectedPlatforms.size > 0 || selectedFormat !== 'all';

  useEffect(() => {
    if (!filterOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!filterWrapRef.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFilterOpen(false);
        filterBtnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  const clearAll = () => {
    onClearPlatforms();
    onSelectFormat('all');
  };

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8ecf2] px-4 sm:px-7"
      aria-label="Calendar filters"
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-sm:w-full max-sm:flex-none"
        role="group"
        aria-label="Filter by status"
      >
        {TABS.map((tab) => {
          const active = statusTab === tab.id;
          const count = tabCounts[tab.id] || 0;
          const bad = tab.id === 'attention' && count > 0;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => onStatusTabChange(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border px-3 py-[7px] text-[11.5px] font-medium transition-colors ${
                active
                  ? 'border-[#e8ecf2] bg-[#f4f6f9] font-semibold text-[#0f172a]'
                  : 'border-transparent text-[#5b6a80] hover:bg-[#f4f6f9] hover:text-[#0f172a]'
              }`}
            >
              <span className={active ? 'text-[#334155]' : 'text-[#94a3b8]'}>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
              <span
                className={`text-[10px] tabular-nums ${
                  bad ? 'font-bold text-[#b91c1c]' : active ? 'text-[#334155]' : 'text-[#5b6a80]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 items-center gap-2 py-2 max-sm:w-full">
        <div className="relative flex min-w-0 flex-1 items-center sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 h-[13px] w-[13px] text-[#94a3b8]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search captions"
            aria-label="Search captions"
            className="h-8 w-full rounded-[10px] border border-[#dde3ec] bg-[#fafbfd] pl-8 pr-8 text-[11.5px] text-[#0f172a] outline-none transition-colors placeholder:text-[#5b6a80] focus:border-[#6d28d9] focus:bg-white focus:shadow-[0_0_0_3px_rgba(124,58,237,0.12)] md:w-[190px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-1 grid h-[22px] w-[22px] place-items-center rounded-md text-[#5b6a80] hover:bg-[#f4f6f9] hover:text-[#0f172a]"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="relative" ref={filterWrapRef}>
          <button
            ref={filterBtnRef}
            type="button"
            aria-expanded={filterOpen}
            aria-controls="calendar-filter-popover"
            onClick={() => setFilterOpen((open) => !open)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[11.5px] font-semibold transition-colors ${
              filterOpen
                ? 'border-[#ddd6fe] bg-[#f5f3ff] text-[#5b21b6]'
                : 'border-[#dde3ec] bg-white text-[#334155] hover:bg-[#f4f6f9]'
            }`}
          >
            <SlidersHorizontal className="h-[13px] w-[13px]" />
            <span className="hidden sm:inline">Filter</span>
            {hasFilter && <span className="h-1.5 w-1.5 rounded-full bg-[#6d28d9]" aria-hidden="true" />}
          </button>

          {filterOpen && (
            <div
              id="calendar-filter-popover"
              className="absolute right-0 top-[calc(100%+6px)] z-40 w-[248px] rounded-xl border border-[#dde3ec] bg-white p-2 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.22)]"
            >
              <h3 className="mx-1.5 mb-1 mt-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#5b6a80]">
                Channels
              </h3>
              {ALL_PLATFORM_IDS.map((platformId) => {
                const platform = PLATFORMS[platformId];
                const pressed = selectedPlatforms.has(platformId);
                return (
                  <button
                    key={platformId}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => onTogglePlatform(platformId)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[11.5px] text-[#334155] hover:bg-[#f4f6f9]"
                  >
                    <span
                      className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border ${
                        pressed ? 'border-[#6d28d9] bg-[#6d28d9] text-white' : 'border-[#cbd5e1] bg-white'
                      }`}
                    >
                      {pressed && <Check className="h-[9px] w-[9px]" strokeWidth={3} />}
                    </span>
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: platform.ringColor }} />
                    <span>{platform.name}</span>
                    <span className="ml-auto text-[10px] tabular-nums text-[#5b6a80]">
                      {platformCounts[platformId] || 0}
                    </span>
                  </button>
                );
              })}

              <h3 className="mx-1.5 mb-1 mt-3 border-t border-[#e8ecf2] pt-2.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#5b6a80]">
                Format
              </h3>
              {FORMATS.map((format) => {
                const pressed = selectedFormat === format.id;
                return (
                  <button
                    key={format.id}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => onSelectFormat(format.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-left text-[11.5px] text-[#334155] hover:bg-[#f4f6f9]"
                  >
                    <span
                      className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
                        pressed ? 'border-[#6d28d9]' : 'border-[#cbd5e1]'
                      }`}
                    >
                      {pressed && <span className="h-1.5 w-1.5 rounded-full bg-[#6d28d9]" />}
                    </span>
                    <span>{format.label}</span>
                  </button>
                );
              })}

              <div className="mt-1.5 flex items-center justify-between border-t border-[#e8ecf2] px-1 pt-1.5">
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-md px-2 py-1 text-[10.5px] font-semibold text-[#5b21b6] hover:bg-[#f5f3ff]"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterOpen(false);
                    filterBtnRef.current?.focus();
                  }}
                  className="rounded-md px-2 py-1 text-[10.5px] font-semibold text-[#5b21b6] hover:bg-[#f5f3ff]"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
