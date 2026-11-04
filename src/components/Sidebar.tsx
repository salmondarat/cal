import React from 'react';
import {
  CalendarDays,
  ListChecks,
  Images,
  Smartphone,
  Layers,
  KeyRound,
  AlertCircle,
  X,
} from 'lucide-react';
import { PlatformId, ScheduledPost } from '../types';
import { ALL_PLATFORM_IDS, PLATFORMS } from '../constants/platforms';
import { PlatformIcon } from './PlatformIcon';
import { formatBytes } from '../utils/mediaUtils';
import { localDateString } from '../utils/localDate';

interface SidebarProps {
  posts: ScheduledPost[];
  countsByPlatform: Record<PlatformId, number>;
  selectedPlatforms: Set<PlatformId>;
  onTogglePlatform: (platform: PlatformId) => void;
  totalStorageBytes: number;
  backendOnline: boolean | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenManager: () => void;
  onOpenMediaLibrary: () => void;
  onOpenSimulator: () => void;
  onOpenBulkCampaign: () => void;
  onOpenApiSettings: () => void;
}

const STORAGE_CAP = 1024 * 1024 * 1024; // 1 GB

const startOfWeek = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
};

const addDays = (date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const Sidebar: React.FC<SidebarProps> = ({
  posts,
  countsByPlatform,
  selectedPlatforms,
  onTogglePlatform,
  totalStorageBytes,
  backendOnline,
  isOpen,
  onClose,
  onOpenManager,
  onOpenMediaLibrary,
  onOpenSimulator,
  onOpenBulkCampaign,
  onOpenApiSettings,
}) => {
  const weekStart = localDateString(startOfWeek(new Date()));
  const weekEnd = localDateString(addDays(startOfWeek(new Date()), 6));
  const weekPosts = posts.filter(
    (p) => p.scheduledDate >= weekStart && p.scheduledDate <= weekEnd,
  );

  const scheduled = weekPosts.filter(
    (p) => p.status === 'scheduled' || p.status === 'publishing',
  ).length;
  const drafts = weekPosts.filter((p) => p.status === 'draft').length;
  const attention = weekPosts.filter(
    (p) => p.status === 'failed' || p.status === 'partial',
  ).length;
  const allAttention = posts.filter(
    (p) => p.status === 'failed' || p.status === 'partial',
  ).length;
  const publishing = posts.filter((p) => p.status === 'publishing').length;

  const storagePct = Math.min(100, (totalStorageBytes / STORAGE_CAP) * 100);

  const serviceLabel =
    backendOnline === null
      ? 'Connecting to schedule service'
      : backendOnline
        ? 'Local workspace'
        : 'Schedule service offline';

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.32)] lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="workspace-rail"
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-[60] flex w-[256px] shrink-0 flex-col border-r border-[#e8ecf2] bg-[#fafbfd] transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-start gap-2 p-4 pb-0">
          <div className="flex w-full items-center gap-2.5 rounded-2xl border border-[#e8ecf2] bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[#0f172a] text-[15px] font-bold tracking-[-0.02em] text-white">
              R
            </div>
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-bold leading-tight tracking-[-0.01em] text-[#0f172a]">
                Relate Social
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-[#5b6a80]">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    backendOnline ? 'bg-[#047857]' : backendOnline === false ? 'bg-[#b91c1c]' : 'bg-[#94a3b8]'
                  }`}
                />
                {serviceLabel}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#5b6a80] hover:bg-[#f4f6f9] hover:text-[#0f172a] lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
          <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#5b6a80]">
            Workspace
          </div>
          <nav className="flex flex-col gap-0.5" aria-label="Workspace">
            <button
              type="button"
              aria-current="page"
              className="flex w-full items-center gap-2.5 rounded-xl border border-[#dde3ec] bg-white px-2.5 py-2 text-left text-[12px] font-semibold text-[#0f172a] shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
            >
              <CalendarDays className="h-[15px] w-[15px] shrink-0 text-[#6d28d9]" />
              Social calendar
              <span className="ml-auto text-[10px] font-semibold tabular-nums text-[#5b6a80]">
                {posts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenManager}
              className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#f1f4f8] hover:text-[#0f172a]"
            >
              <ListChecks className="h-[15px] w-[15px] shrink-0 text-[#5b6a80]" />
              Manage posts
              {allAttention > 0 ? (
                <span className="ml-auto rounded-md border border-[#fecaca] bg-[#fef2f2] px-1.5 py-px text-[10px] font-semibold tabular-nums text-[#b91c1c]">
                  {allAttention}
                </span>
              ) : publishing > 0 ? (
                <span className="ml-auto text-[10px] tabular-nums text-[#b45309]">
                  {publishing} sending
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={onOpenMediaLibrary}
              className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#f1f4f8] hover:text-[#0f172a]"
            >
              <Images className="h-[15px] w-[15px] shrink-0 text-[#5b6a80]" />
              Media library
            </button>

            <button
              type="button"
              onClick={onOpenSimulator}
              className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#f1f4f8] hover:text-[#0f172a]"
            >
              <Smartphone className="h-[15px] w-[15px] shrink-0 text-[#5b6a80]" />
              Device preview
            </button>

            <button
              type="button"
              onClick={onOpenBulkCampaign}
              className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-[12px] font-medium text-[#334155] transition-colors hover:bg-[#f1f4f8] hover:text-[#0f172a]"
            >
              <Layers className="h-[15px] w-[15px] shrink-0 text-[#5b6a80]" />
              Bulk campaign
            </button>
          </nav>

          <div className="px-2 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#5b6a80]">
            Outlets
          </div>
          <div className="flex flex-col gap-0.5" aria-label="Filter by outlet">
            {ALL_PLATFORM_IDS.map((platformId) => {
              const platform = PLATFORMS[platformId];
              const selected = selectedPlatforms.has(platformId);
              return (
                <button
                  key={platformId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onTogglePlatform(platformId)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-[7px] text-left text-[12px] font-medium transition-colors ${
                    selected
                      ? 'border-[#ddd6fe] bg-[#f5f3ff] text-[#5b21b6]'
                      : 'border-transparent text-[#334155] hover:bg-[#f1f4f8] hover:text-[#0f172a]'
                  }`}
                >
                  <span className="grid h-[18px] w-[18px] shrink-0 place-items-center overflow-hidden rounded-[5px] border border-[#e8ecf2] bg-white">
                    <PlatformIcon platform={platformId} size={13} />
                  </span>
                  <span className="min-w-0 truncate">{platform.name}</span>
                  <span
                    className={`ml-auto text-[10px] tabular-nums ${
                      selected ? 'font-semibold text-[#6d28d9]' : 'text-[#5b6a80]'
                    }`}
                  >
                    {countsByPlatform[platformId] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 border-t border-[#e8ecf2] pt-2">
            <button
              type="button"
              onClick={onOpenApiSettings}
              className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left text-[12px] font-medium text-[#5b6a80] transition-colors hover:bg-[#f1f4f8] hover:text-[#0f172a]"
            >
              <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] bg-[#f4f6f9]">
                <KeyRound className="h-3 w-3 text-[#334155]" />
              </span>
              API connections
            </button>
          </div>
        </div>

        <div className="p-4 pt-2">
          <div className="rounded-2xl border border-[#e8ecf2] bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#5b6a80]">
              This week
            </h2>
            <div className="flex justify-between py-0.5 text-[11.5px] text-[#334155]">
              <span>Scheduled</span>
              <b className="font-semibold tabular-nums text-[#0f172a]">{scheduled}</b>
            </div>
            <div className="flex justify-between py-0.5 text-[11.5px] text-[#334155]">
              <span>Drafts</span>
              <b className="font-semibold tabular-nums text-[#0f172a]">{drafts}</b>
            </div>
            <div className="flex justify-between py-0.5 text-[11.5px] text-[#334155]">
              <span>Needs attention</span>
              <b className={`font-semibold tabular-nums ${attention ? 'text-[#b91c1c]' : 'text-[#0f172a]'}`}>
                {attention}
              </b>
            </div>

            <div className="mt-2.5 border-t border-[#e8ecf2] pt-2.5">
              <div className="flex justify-between text-[10.5px] text-[#5b6a80]">
                <span>Local media</span>
                <span className="tabular-nums">
                  {formatBytes(totalStorageBytes)} / 1 GB
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#edf1f6]">
                <i
                  className="block h-full rounded-full bg-[#6d28d9]"
                  style={{ width: `${Math.max(storagePct, totalStorageBytes ? 2 : 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
