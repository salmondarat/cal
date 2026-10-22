import React from 'react';
import {
  Calendar,
  Plus,
  Smartphone,
  HardDrive,
  CheckCircle2,
  Layers,
  Key,
} from 'lucide-react';
import { ScheduledPost } from '../types';
import { formatBytes } from '../utils/mediaUtils';

interface HeaderProps {
  posts: ScheduledPost[];
  onOpenComposer: () => void;
  onOpenSimulator: () => void;
  onOpenBulkCampaign: () => void;
  onOpenMediaLibrary: () => void;
  onOpenApiSettings: () => void;
  totalStorageBytes: number;
}

export const Header: React.FC<HeaderProps> = ({
  posts,
  onOpenComposer,
  onOpenSimulator,
  onOpenBulkCampaign,
  onOpenMediaLibrary,
  onOpenApiSettings,
  totalStorageBytes,
}) => {
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;
  const publishedCount = posts.filter((p) => p.status === 'published').length;

  return (
    <header className="sticky top-0 z-30 bg-[#fcfcfc]/95 backdrop-blur-md border-b border-neutral-200/80 px-4 sm:px-6 lg:px-8 py-3 transition-colors">
      <div className="w-full flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Brand Wordmark (Relate Modern Sales CRM Design System) */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-[8px] bg-[#020520] flex items-center justify-center text-white font-semibold text-sm shadow-sm">
            R
          </div>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-semibold tracking-tight text-[#020520] leading-none whitespace-nowrap">
              Relate Social
            </span>
            <span className="text-[11px] font-medium text-neutral-500 tracking-normal mt-0.5 hidden xs:inline">
              Multi-Platform Planner
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links, Storage & API status */}
        <nav className="hidden lg:flex items-center gap-4 text-xs font-medium text-neutral-600">
          <button
            onClick={onOpenMediaLibrary}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] hover:bg-neutral-100 text-neutral-700 transition-colors cursor-pointer border border-transparent hover:border-neutral-200"
            title="Open Local Media Library"
          >
            <HardDrive className="w-3.5 h-3.5 text-[#0000ee]" />
            <span className="font-mono tabular-nums">{formatBytes(totalStorageBytes)}</span>
            <span className="text-neutral-400">/ 1.0 GB Storage</span>
          </button>

          <button
            onClick={onOpenApiSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] hover:bg-neutral-100 text-neutral-700 transition-colors cursor-pointer border border-transparent hover:border-neutral-200"
            title="Official Social Media API & OAuth Keys"
          >
            <Key className="w-3.5 h-3.5 text-emerald-600" />
            <span>API Connections</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-mono tabular-nums px-2 py-1">
            <span className="w-2 h-2 rounded-full bg-[#1890ff]" />
            <span>{scheduledCount} Scheduled</span>
            <span className="text-neutral-300">·</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{publishedCount} Published</span>
          </div>
        </nav>

        {/* Zone 3: Primary Actions (CTA + Bulk + Device Simulator) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile triggers for Media & API */}
          <button
            onClick={onOpenMediaLibrary}
            className="lg:hidden p-1.5 text-neutral-700 bg-white border border-neutral-200 rounded-[8px] hover:bg-neutral-50"
            title="Media Library"
          >
            <HardDrive className="w-4 h-4 text-[#0000ee]" />
          </button>

          <button
            onClick={onOpenApiSettings}
            className="lg:hidden p-1.5 text-neutral-700 bg-white border border-neutral-200 rounded-[8px] hover:bg-neutral-50"
            title="API Keys"
          >
            <Key className="w-4 h-4 text-emerald-600" />
          </button>

          {/* Bulk Upload Campaign Button */}
          <button
            onClick={onOpenBulkCampaign}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-neutral-800 bg-white border border-neutral-300 rounded-[8px] hover:bg-neutral-50 hover:border-neutral-400 transition-colors shadow-2xs cursor-pointer"
            title="Bulk Upload Media & Schedule Series Campaign"
          >
            <Layers className="w-3.5 h-3.5 text-[#0000ee]" />
            <span className="hidden sm:inline">Bulk Campaign</span>
          </button>

          {/* Device Simulator Button */}
          <button
            onClick={onOpenSimulator}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-neutral-800 bg-white border border-neutral-300 rounded-[8px] hover:bg-neutral-50 hover:border-neutral-400 transition-colors shadow-2xs cursor-pointer"
            title="Open Interactive Mobile Device Simulator"
          >
            <Smartphone className="w-3.5 h-3.5 text-[#0000ee]" />
            <span className="hidden sm:inline">Device Preview</span>
          </button>

          {/* Schedule Post CTA */}
          <button
            onClick={onOpenComposer}
            className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white bg-[#020520] hover:bg-[#0f1f3d] rounded-[8px] transition-colors shadow-xs active:scale-[0.98] whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Schedule</span>
          </button>
        </div>
      </div>
    </header>
  );
};
