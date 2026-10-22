import React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { ALL_PLATFORM_IDS, PLATFORMS } from '../constants/platforms';
import { MediaFormat, PlatformId } from '../types';
import { PlatformIcon } from './PlatformIcon';

interface PlatformFilterBarProps {
  selectedPlatform: PlatformId | 'all';
  onSelectPlatform: (platform: PlatformId | 'all') => void;
  selectedFormat: MediaFormat | 'all';
  onSelectFormat: (format: MediaFormat | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  countsByPlatform: Record<PlatformId, number>;
  totalCount: number;
}

export const PlatformFilterBar: React.FC<PlatformFilterBarProps> = ({
  selectedPlatform,
  onSelectPlatform,
  selectedFormat,
  onSelectFormat,
  searchQuery,
  onSearchChange,
  countsByPlatform,
  totalCount,
}) => {
  return (
    <div className="bg-[#fcfcfc] border-b border-neutral-200/80 px-4 sm:px-6 lg:px-8 py-3">
      <div className="w-full flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Platform Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => onSelectPlatform('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-[8px] transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              selectedPlatform === 'all'
                ? 'bg-[#020520] text-white shadow-xs'
                : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-300 hover:text-neutral-900'
            }`}
          >
            All Channels
            <span
              className={`ml-1.5 font-mono text-[11px] tabular-nums ${
                selectedPlatform === 'all' ? 'text-neutral-300' : 'text-neutral-400'
              }`}
            >
              {totalCount}
            </span>
          </button>

          {ALL_PLATFORM_IDS.map((pId) => {
            const platform = PLATFORMS[pId];
            const isSelected = selectedPlatform === pId;
            const count = countsByPlatform[pId] || 0;

            return (
              <button
                key={pId}
                onClick={() => onSelectPlatform(pId)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[8px] transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-white border-2 text-neutral-900 shadow-xs'
                    : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-300 hover:text-neutral-900'
                }`}
                style={{
                  borderColor: isSelected ? platform.ringColor : undefined,
                }}
              >
                <PlatformIcon platform={pId} size={15} />
                <span>{platform.name}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    isSelected ? 'text-neutral-900 font-semibold' : 'text-neutral-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right side: Format Filter & Search */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Format Selector */}
          <div className="flex items-center gap-1 bg-neutral-100/80 p-0.5 rounded-[8px] border border-neutral-200/60">
            <button
              onClick={() => onSelectFormat('all')}
              className={`px-2 py-1 text-[11px] font-medium rounded-[6px] transition-colors whitespace-nowrap ${
                selectedFormat === 'all'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => onSelectFormat('image')}
              className={`px-2 py-1 text-[11px] font-medium rounded-[6px] transition-colors whitespace-nowrap ${
                selectedFormat === 'image'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Images
            </button>
            <button
              onClick={() => onSelectFormat('video')}
              className={`px-2 py-1 text-[11px] font-medium rounded-[6px] transition-colors whitespace-nowrap ${
                selectedFormat === 'video'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Videos
            </button>
            <button
              onClick={() => onSelectFormat('carousel')}
              className={`px-2 py-1 text-[11px] font-medium rounded-[6px] transition-colors whitespace-nowrap ${
                selectedFormat === 'carousel'
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Carousels
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter captions, tags..."
              className="w-full pl-8 pr-7 py-1 text-xs bg-white border border-neutral-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#0000ee] focus:border-[#0000ee] text-neutral-900 placeholder:text-neutral-400 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
