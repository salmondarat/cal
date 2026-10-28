import React, { useState, useEffect } from 'react';
import {
  CalendarViewMode,
  MediaFormat,
  PlatformId,
  ScheduledPost,
  MediaItem,
  StatusTab,
} from './types';
import { Sidebar } from './components/Sidebar';
import { CalendarToolbar } from './components/CalendarToolbar';
import { DateBar } from './components/DateBar';
import { MonthView } from './components/Calendar/MonthView';
import { WeekView } from './components/Calendar/WeekView';
import { DayView } from './components/Calendar/DayView';
import { UnifiedComposerModal } from './components/Composer/UnifiedComposerModal';
import { DeviceSimulatorModal } from './components/DeviceSimulator/DeviceSimulatorModal';
import { BulkCampaignModal } from './components/BulkUpload/BulkCampaignModal';
import { ApiSettingsModal } from './components/Settings/ApiSettingsModal';
import { MediaLibraryModal } from './components/MediaLibrary/MediaLibraryModal';
import { PostManagerModal } from './components/PostManager/PostManagerModal';
import { PostDetailModal } from './components/PostManager/PostDetailModal';
import { AlertTriangle, CalendarDays, CheckCircle2, Info, Menu, Plus } from 'lucide-react';
import { getAllStoredMedia, saveMediaItemToStorage } from './utils/mediaStorage';
import { processFileToMediaItem, validateFileSize } from './utils/mediaUtils';
import { localDateString } from './utils/localDate';
import { toUserMessage } from './utils/errorMessages';
import { explainError } from './utils/explainError';
import {
  ManagedPost,
  SchedulerInfo,
  deleteServerPost,
  fetchPosts,
  getServerPost,
  isServerOffline,
  pollUntilSettled,
  putPost,
  startPublish,
  syncPosts,
  unpublishPost,
} from './utils/postApi';

const STORAGE_KEY = 'relate_social_scheduled_posts_v2';

function readLocalPosts(): ScheduledPost[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function upsertById(list: ScheduledPost[], next: ScheduledPost): ScheduledPost[] {
  const exists = list.some((p) => p.id === next.id);
  return exists ? list.map((p) => (p.id === next.id ? next : p)) : [next, ...list];
}

export default function App() {
  const [posts, setPosts] = useState<ScheduledPost[]>(readLocalPosts);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [timezone, setTimezone] = useState('');
  const [scheduler, setScheduler] = useState<SchedulerInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const snapshot = await fetchPosts();
        if (cancelled) return;
        setBackendOnline(true);
        setTimezone(snapshot.timezone);
        setScheduler(snapshot.scheduler);
        if (!snapshot.posts.length) {
          const local = readLocalPosts();
          if (local.length) {
            const imported = await syncPosts(local);
            if (!cancelled) setPosts(imported.posts);
            return;
          }
        }
        if (!cancelled) setPosts(snapshot.posts);
      } catch {
        if (!cancelled) {
          setBackendOnline(false);
          setPosts(readLocalPosts());
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep localStorage in sync
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    } catch {
      console.warn('Your schedule could not be saved in this browser.');
    }
  }, [posts]);

  // Persistent Media Library State (IndexedDB + LocalStorage)
  const [storedMedia, setStoredMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    getAllStoredMedia()
      .then((items) => {
        setStoredMedia(items);
      })
      .catch(() => {
        console.warn('Media could not be loaded right now.');
      });
  }, []);

  // Calendar State
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

  // Filter State
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformId>>(new Set());
  const [selectedFormat, setSelectedFormat] = useState<MediaFormat | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRailOpen, setIsRailOpen] = useState(false);

  // Modals State
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<string | undefined>(undefined);
  const [quickAddTime, setQuickAddTime] = useState<string | undefined>(undefined);
  const [quickAddMedia, setQuickAddMedia] = useState<MediaItem[] | undefined>(undefined);

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [activeSimulatorPost, setActiveSimulatorPost] = useState<ScheduledPost | null>(null);

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [detailPost, setDetailPost] = useState<ManagedPost | null>(null);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type?: 'success' | 'info';
  } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  useEffect(() => {
    if (!isRailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsRailOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isRailOpen]);

  // Drag and Drop reschedule handler
  const handleMovePost = (postId: string, targetDate: string, targetTime?: string) => {
    setPosts((prevPosts) => {
      const targetPost = prevPosts.find((p) => p.id === postId);
      if (!targetPost) return prevPosts;

      const updatedPosts = prevPosts.map((p) => {
        if (p.id === postId) {
          return {
            ...p,
            scheduledDate: targetDate,
            scheduledTime: targetTime || p.scheduledTime,
          };
        }
        return p;
      });

      showToast(
        `Rescheduled "${targetPost.title}" to ${targetDate} at ${
          targetTime || targetPost.scheduledTime
        }`
      );
      return updatedPosts;
    });
  };

  // Handle dropping media files directly from OS into a calendar cell
  const handleDropMediaFiles = async (
    files: FileList,
    targetDate: string,
    targetTime?: string
  ) => {
    const validItems: MediaItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const val = validateFileSize(file);
      if (!val.valid) {
        showToast(val.error || 'That file is too large.', 'info');
        continue;
      }
      try {
        const item = await processFileToMediaItem(file);
        validItems.push(await saveMediaItemToStorage(item));
      } catch (err) {
        showToast(`${file.name}: ${toUserMessage(err, 'the upload did not finish')}`, 'info');
      }
    }

    if (validItems.length > 0) {
      setStoredMedia((prev) => [...validItems, ...prev]);

      // Create pre-filled scheduled post draft
      const newPost: ScheduledPost = {
        id: `post-drop-${Date.now()}`,
        title: validItems[0].name.replace(/\.[^/.]+$/, ''),
        scheduledDate: targetDate,
        scheduledTime: targetTime || '11:00',
        platforms: ['instagram', 'tiktok', 'youtube'],
        format: validItems.length > 1 ? 'carousel' : validItems[0].type.startsWith('video/') ? 'video' : 'image',
        media: validItems,
        baseCaption: `Newly scheduled update: ${validItems[0].name}`,
        baseHashtags: ['#B2BSaaS', '#Productivity', '#Tech'],
        platformOverrides: {},
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      };

      await handleSavePost(newPost);
    }
  };

  // Create / Update post handler
  const handleSavePost = async (savedPost: ScheduledPost) => {
    setPosts((prev) => upsertById(prev, savedPost));
    setEditingPost(null);
    setQuickAddMedia(undefined);

    if (!backendOnline) {
      showToast(
        posts.some((p) => p.id === savedPost.id)
          ? `Updated "${savedPost.title}" in this browser only`
          : `Saved "${savedPost.title}" in this browser only — the schedule service is offline`,
        'info',
      );
      return savedPost;
    }

    try {
      const stored = await putPost(savedPost);
      setPosts((prev) => upsertById(prev, stored));
      if (savedPost.status === 'draft') {
        showToast(`Saved "${stored.title}" as a draft`);
      } else if (stored.warnings?.length) {
        showToast(stored.warnings[0], 'info');
      } else {
        showToast(
          `Scheduled "${stored.title}" for ${stored.scheduledDate} at ${stored.scheduledTime} (${stored.timezone || timezone})`,
        );
      }
      return stored;
    } catch (err) {
      showToast(toUserMessage(err, 'The schedule could not be saved on the backend.'), 'info');
      return savedPost;
    }
  };

  // Bulk Campaign Series scheduler handler
  const handleScheduleBulkPosts = async (bulkPosts: ScheduledPost[]) => {
    setPosts((prev) => [...bulkPosts, ...prev]);
    if (!backendOnline) {
      showToast(`Saved ${bulkPosts.length} posts in this browser only — the schedule service is offline.`, 'info');
      return;
    }
    try {
      const results = await Promise.all(bulkPosts.map((post) => putPost(post)));
      setPosts((prev) => results.reduce((acc, next) => upsertById(acc, next), prev));
      const blocked = results.filter((r) => r.warnings?.length);
      showToast(
        blocked.length
          ? `${results.length} posts scheduled — ${blocked.length} need attention (see Manage posts)`
          : `Scheduled bulk campaign series (${results.length} posts) successfully!`,
        blocked.length ? 'info' : 'success',
      );
    } catch (err) {
      showToast(toUserMessage(err, 'The bulk series could not be saved on the backend.'), 'info');
    }
  };

  // Delete post handler
  const handleDeletePost = async (postId: string) => {
    const postToDelete = posts.find((p) => p.id === postId);
    if (!postToDelete) return;

    setPosts((prev) => prev.filter((p) => p.id !== postId));

    if (activeSimulatorPost?.id === postId) {
      setActiveSimulatorPost(null);
      setIsSimulatorOpen(false);
    }

    if (!backendOnline) {
      showToast(`Removed post "${postToDelete.title}"`, 'info');
      return;
    }

    try {
      const result = await deleteServerPost(postId);
      if (result.stillLiveOn?.length) {
        showToast(
          `Removed from the schedule, but it is still live on ${result.stillLiveOn.map((s) => s.platform).join(', ')}.`,
          'info',
        );
      } else {
        showToast(`Removed post "${postToDelete.title}"`, 'info');
      }
    } catch (err) {
      showToast(toUserMessage(err, 'The post could not be removed from the schedule.'), 'info');
    }
  };

  // Publish now — the backend does the delivery and keeps working after this tab closes.
  const handlePublishNow = async (postToPublish: ScheduledPost) => {
    if (!backendOnline) {
      showToast('Start the schedule service (pnpm dev:server) to publish for real.', 'info');
      return;
    }

    setPosts((prev) => prev.map((p) => (p.id === postToPublish.id ? { ...p, status: 'publishing' } : p)));

    try {
      const stored = await putPost({ ...postToPublish, status: postToPublish.status === 'draft' ? 'scheduled' : postToPublish.status });
      setPosts((prev) => upsertById(prev, stored));
      await startPublish(stored.id);
      const settled = await pollUntilSettled(stored.id, (live) => setPosts((prev) => upsertById(prev, live)));
      const failure = explainError(settled.lastError);
      const succeeded = Object.entries(settled.results || {})
        .filter(([, r]) => r.status === 'success')
        .map(([platform]) => platform);
      const skipped = Object.entries(settled.results || {})
        .filter(([, r]) => r.status === 'skipped' && !String(r.error || '').includes('Removed from the platform'))
        .map(([platform]) => platform);

      if (settled.status === 'published') {
        showToast(`Published "${settled.title}" to ${succeeded.join(', ')}`);
      } else if (settled.status === 'partial') {
        showToast(
          `Sent to ${succeeded.join(', ') || 'no channel'}. ${failure?.title || 'The other channel did not accept the post.'} Open the card for the steps.`,
          'info',
        );
      } else {
        showToast(`${failure?.title || 'Publishing did not finish.'} Open the card to see how to fix it.`, 'info');
      }
      if (skipped.length && settled.status === 'published') {
        showToast(`${skipped.join(', ')} were not sent — this build publishes ${scheduler?.supported.join(', ') || 'Instagram and Threads'}.`, 'info');
      }
      return settled;
    } catch (err) {
      const message = isServerOffline(err)
        ? 'The schedule service stopped responding mid-publish. The job may still be running — check Manage posts.'
        : toUserMessage(err, 'Publishing did not finish.');
      showToast(message, 'info');
      setPosts((prev) => prev.map((p) => (p.id === postToPublish.id ? { ...p, status: 'failed', lastError: message } : p)));
      return null;
    }
  };

  // Take the published media back down from the platforms
  const handleUnpublish = async (postId: string) => {
    const target = posts.find((p) => p.id === postId);
    if (!target) return;
    try {
      const next = await unpublishPost(postId);
      setPosts((prev) => upsertById(prev, next));
      showToast(
        next.lastError
          ? `Could not remove it everywhere: ${explainError(next.lastError)?.title || 'the platform refused'}. Open the card for the steps.`
          : `Removed "${target.title}" from ${target.platforms.join(', ')}`,
        next.lastError ? 'info' : 'success',
      );
    } catch (err) {
      showToast(toUserMessage(err, 'The platform could not remove this post.'), 'info');
    }
  };

  // Quick add trigger from day or time cell
  const handleQuickAdd = (dateStr: string, timeStr?: string) => {
    setEditingPost(null);
    setQuickAddDate(dateStr);
    setQuickAddTime(timeStr || '10:00');
    setQuickAddMedia(undefined);
    setIsComposerOpen(true);
  };

  // Edit trigger
  const handleEditPost = (post: ScheduledPost) => {
    setEditingPost(post);
    setQuickAddDate(post.scheduledDate);
    setQuickAddTime(post.scheduledTime);
    setQuickAddMedia(undefined);
    setIsComposerOpen(true);
  };

  // Preview in Device Simulator trigger
  const handlePreviewPost = (post: ScheduledPost) => {
    setActiveSimulatorPost(post);
    setIsSimulatorOpen(true);
  };

  // Open the delivery report for a card: what was sent, what failed, and the trail.
  const handleOpenDetail = (post: ScheduledPost) => {
    setDetailPost(post as ManagedPost);
    if (!backendOnline) return;
    getServerPost(post.id)
      .then((fresh) => setDetailPost(fresh))
      .catch(() => {
        showToast('The delivery details could not be refreshed; showing the cached copy.', 'info');
      });
  };

  // Date Navigation
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() - 1);
      } else if (viewMode === 'week') {
        d.setDate(d.getDate() - 7);
      } else {
        d.setDate(d.getDate() - 1);
      }
      return d;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() + 1);
      } else if (viewMode === 'week') {
        d.setDate(d.getDate() + 7);
      } else {
        d.setDate(d.getDate() + 1);
      }
      return d;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const matchesQuery = (post: ScheduledPost) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      post.title.toLowerCase().includes(q) ||
      post.baseCaption.toLowerCase().includes(q) ||
      post.baseHashtags.some((t) => t.toLowerCase().includes(q))
    );
  };

  const matchesStatus = (post: ScheduledPost) => {
    if (statusTab === 'all') return true;
    if (statusTab === 'attention') return post.status === 'failed' || post.status === 'partial';
    if (statusTab === 'scheduled') return post.status === 'scheduled' || post.status === 'publishing';
    return post.status === statusTab;
  };

  const matchesPlatform = (post: ScheduledPost) =>
    selectedPlatforms.size === 0 || post.platforms.some((id) => selectedPlatforms.has(id));

  const matchesFormat = (post: ScheduledPost) =>
    selectedFormat === 'all' || post.format === selectedFormat;

  // Filtered posts for the calendar views
  const filteredPosts = posts.filter(
    (post) =>
      matchesQuery(post) &&
      matchesPlatform(post) &&
      matchesFormat(post) &&
      matchesStatus(post),
  );

  // Facet counts: tabs keep the channel/format/search scope, outlets keep the tab.
  const tabScope = posts.filter(
    (post) => matchesQuery(post) && matchesPlatform(post) && matchesFormat(post),
  );
  const tabCounts: Record<StatusTab, number> = {
    all: tabScope.length,
    scheduled: tabScope.filter((p) => p.status === 'scheduled' || p.status === 'publishing').length,
    draft: tabScope.filter((p) => p.status === 'draft').length,
    attention: tabScope.filter((p) => p.status === 'failed' || p.status === 'partial').length,
  };

  const countsByPlatform: Record<PlatformId, number> = {
    instagram: 0,
    facebook: 0,
    threads: 0,
    tiktok: 0,
    youtube: 0,
  };
  posts
    .filter((post) => matchesQuery(post) && matchesFormat(post) && matchesStatus(post))
    .forEach((post) => {
      post.platforms.forEach((pId) => {
        if (countsByPlatform[pId] !== undefined) countsByPlatform[pId]++;
      });
    });

  const togglePlatform = (platform: PlatformId) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  // Period label for the head + summary
  const weekStart = new Date(currentDate);
  const weekDay = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - weekDay + (weekDay === 0 ? -6 : 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const rangeTitle =
    viewMode === 'month'
      ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : viewMode === 'week'
        ? (() => {
            const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
            const startLabel = sameMonth
              ? `${weekStart.getDate()}`
              : weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            const endLabel = weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
            return `${startLabel} – ${endLabel} ${weekEnd.getFullYear()}`;
          })()
        : currentDate.toLocaleDateString('en-US', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });

  const periodPosts = filteredPosts.filter((post) => {
    if (viewMode === 'month') {
      const d = new Date(`${post.scheduledDate}T00:00:00`);
      return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === currentDate.getMonth();
    }
    if (viewMode === 'week') {
      return (
        post.scheduledDate >= localDateString(weekStart) &&
        post.scheduledDate <= localDateString(weekEnd)
      );
    }
    return post.scheduledDate === localDateString(currentDate);
  });

  const periodChannels = new Set(periodPosts.flatMap((p) => p.platforms)).size;
  const periodAttention = periodPosts.filter(
    (p) => p.status === 'failed' || p.status === 'partial',
  ).length;

  const openNewComposer = () => {
    setEditingPost(null);
    setQuickAddDate(undefined);
    setQuickAddTime(undefined);
    setQuickAddMedia(undefined);
    setIsComposerOpen(true);
  };

  const resetFilters = () => {
    setStatusTab('all');
    setSelectedPlatforms(new Set());
    setSelectedFormat('all');
    setSearchQuery('');
  };

  const openSimulator = () => {
    const target = filteredPosts[0] || posts[0];
    if (target) {
      setActiveSimulatorPost(target);
      setIsSimulatorOpen(true);
    } else {
      showToast('No posts available to preview. Schedule your first post!', 'info');
    }
  };

  // Calculate total media storage used
  const totalStorageBytes =
    storedMedia.reduce((acc, m) => acc + m.size, 0) ||
    posts.reduce((acc, p) => acc + p.media.reduce((mAcc, m) => mAcc + m.size, 0), 0);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white font-sans text-[#0f172a]">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          posts={posts}
          countsByPlatform={countsByPlatform}
          selectedPlatforms={selectedPlatforms}
          onTogglePlatform={togglePlatform}
          totalStorageBytes={totalStorageBytes}
          backendOnline={backendOnline}
          isOpen={isRailOpen}
          onClose={() => setIsRailOpen(false)}
          onOpenManager={() => setIsManagerOpen(true)}
          onOpenMediaLibrary={() => setIsMediaLibraryOpen(true)}
          onOpenSimulator={openSimulator}
          onOpenBulkCampaign={() => setIsBulkModalOpen(true)}
          onOpenApiSettings={() => setIsApiSettingsOpen(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile bar */}
          <div className="flex items-center justify-between gap-2 border-b border-[#e8ecf2] px-4 py-2.5 lg:hidden">
            <button
              type="button"
              onClick={() => setIsRailOpen(true)}
              aria-expanded={isRailOpen}
              aria-controls="workspace-rail"
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#dde3ec] bg-white px-2.5 text-[11px] font-semibold text-[#334155] hover:bg-[#f4f6f9]"
            >
              <Menu className="h-4 w-4" />
              Menu
            </button>
            <span className="flex items-center gap-2 text-[12.5px] font-bold text-[#0f172a]">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-[#0f172a] text-[12px] font-bold text-white">
                R
              </span>
              Relate Social
            </span>
            <button
              type="button"
              onClick={openNewComposer}
              aria-label="New post"
              className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#0f172a] text-white hover:bg-black"
            >
              <Plus className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>

          <header className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-4 sm:px-7">
            <div className="min-w-0">
              <h1 className="text-[21px] leading-tight tracking-[-0.02em] sm:text-[24px]">
                {rangeTitle}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[#5b6a80]">
                <span>Social calendar</span>
                <span className="h-[3px] w-[3px] rounded-full bg-[#dde3ec]" aria-hidden="true" />
                <span>
                  {periodPosts.length} {periodPosts.length === 1 ? 'post' : 'posts'}
                </span>
                <span className="h-[3px] w-[3px] rounded-full bg-[#dde3ec]" aria-hidden="true" />
                <span>
                  {periodChannels} {periodChannels === 1 ? 'channel' : 'channels'}
                </span>
                {periodAttention > 0 && (
                  <>
                    <span className="h-[3px] w-[3px] rounded-full bg-[#dde3ec]" aria-hidden="true" />
                    <span className="font-medium text-[#b91c1c]">
                      {periodAttention} needs attention
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <span className="hidden items-center gap-1.5 rounded-[10px] border border-[#e8ecf2] bg-white px-2.5 py-1.5 text-[11.5px] text-[#334155] sm:flex">
                <CalendarDays className="h-[13px] w-[13px] text-[#5b6a80]" />
                {periodPosts.length} in view
              </span>
              <button
                type="button"
                onClick={openNewComposer}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#0f172a] px-3 text-[11.5px] font-semibold text-white transition-colors hover:bg-black active:translate-y-px"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                New post
              </button>
            </div>
          </header>

          {backendOnline === false && (
            <div className="flex items-center gap-2 border-y border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900 sm:px-7">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                The schedule service is not reachable, so nothing will publish on time. Start it with{' '}
                <span className="font-mono">pnpm dev:server</span> and reload this page.
              </span>
            </div>
          )}

          <CalendarToolbar
            statusTab={statusTab}
            onStatusTabChange={setStatusTab}
            tabCounts={tabCounts}
            selectedPlatforms={selectedPlatforms}
            onTogglePlatform={togglePlatform}
            onClearPlatforms={() => setSelectedPlatforms(new Set())}
            selectedFormat={selectedFormat}
            onSelectFormat={setSelectedFormat}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            platformCounts={countsByPlatform}
          />

          <DateBar
            currentDate={currentDate}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={handleToday}
            timezone={timezone}
          />

          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {viewMode === 'month' && (
              <MonthView
                currentDate={currentDate}
                posts={filteredPosts}
                onMovePost={handleMovePost}
                onPreviewPost={handlePreviewPost}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onQuickAdd={handleQuickAdd}
                onDropMediaFiles={handleDropMediaFiles}
                onPublishPost={(post) => void handlePublishNow(post)}
                onOpenPostDetail={handleOpenDetail}
              />
            )}

            {viewMode === 'week' && (
              <WeekView
                currentDate={currentDate}
                posts={filteredPosts}
                onMovePost={handleMovePost}
                onPreviewPost={handlePreviewPost}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onQuickAdd={handleQuickAdd}
                onDropMediaFiles={handleDropMediaFiles}
                onPublishPost={(post) => void handlePublishNow(post)}
                onOpenPostDetail={handleOpenDetail}
              />
            )}

            {viewMode === 'day' && (
              <DayView
                currentDate={currentDate}
                posts={filteredPosts}
                onMovePost={handleMovePost}
                onPreviewPost={handlePreviewPost}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onQuickAdd={handleQuickAdd}
                onDropMediaFiles={handleDropMediaFiles}
                onPublishPost={(post) => void handlePublishNow(post)}
                onOpenPostDetail={handleOpenDetail}
              />
            )}

            {posts.length > 0 && filteredPosts.length === 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center px-4">
                <div className="pointer-events-auto w-full max-w-[340px] rounded-2xl border border-[#dde3ec] bg-white px-5 py-4 text-center shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                  <h3 className="text-[14px] font-bold text-[#0f172a]">No posts match</h3>
                  <p className="mb-3 mt-1 text-[11.5px] text-[#5b6a80]">
                    Nothing here fits the current filters and search.
                  </p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="h-8 rounded-[10px] border border-[#dde3ec] bg-white px-3 text-[11px] font-semibold text-[#334155] hover:bg-[#f4f6f9]"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Unified Post Composer Modal */}
      <UnifiedComposerModal
        isOpen={isComposerOpen}
        onClose={() => {
          setIsComposerOpen(false);
          setEditingPost(null);
          setQuickAddMedia(undefined);
        }}
        onSavePost={handleSavePost}
        onPublishPost={(post) => handlePublishNow(post)}
        backendOnline={backendOnline}
        initialPost={editingPost}
        initialDate={quickAddDate}
        initialTime={quickAddTime}
        initialMedia={quickAddMedia}
        availableStoredMedia={storedMedia}
        onPreviewPost={(post) => {
          setActiveSimulatorPost(post);
          setIsSimulatorOpen(true);
        }}
      />

      {/* Interactive Mobile Device Simulator Modal */}
      <DeviceSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => {
          setIsSimulatorOpen(false);
          setActiveSimulatorPost(null);
        }}
        post={activeSimulatorPost}
        allPosts={posts}
        onSelectPost={(p) => setActiveSimulatorPost(p)}
        onPublishNow={handlePublishNow}
      />

      {/* Bulk Media Campaign Creator Modal */}
      <BulkCampaignModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onScheduleBulkPosts={handleScheduleBulkPosts}
      />

      {/* Official Platform API & OAuth Credentials Settings Modal */}
      <ApiSettingsModal
        isOpen={isApiSettingsOpen}
        onClose={() => setIsApiSettingsOpen(false)}
      />

      {/* Post manager: delivery state, per-channel results, activity log */}
      <PostManagerModal
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
        posts={posts}
        backendOnline={backendOnline}
        timezone={timezone}
        onPublish={(post) => void handlePublishNow(post)}
        onUnpublish={(postId) => void handleUnpublish(postId)}
        onDelete={(postId) => void handleDeletePost(postId)}
        onOpenDetail={(post) => {
          setIsManagerOpen(false);
          handleOpenDetail(post);
        }}
        onEdit={(post) => {
          setIsManagerOpen(false);
          handleEditPost(post);
        }}
      />

      {/* One post in depth: per-channel result, full errors, activity trail */}
      <PostDetailModal
        isOpen={Boolean(detailPost)}
        post={detailPost}
        backendOnline={backendOnline}
        onClose={() => setDetailPost(null)}
        onPublish={(post) => void handlePublishNow(post)}
        onUnpublish={(postId) => void handleUnpublish(postId)}
        onDelete={(postId) => {
          setDetailPost(null);
          void handleDeletePost(postId);
        }}
        onEdit={(post) => {
          setDetailPost(null);
          handleEditPost(post);
        }}
        onPostUpdate={(fresh) => {
          setDetailPost(fresh);
          setPosts((prev) => upsertById(prev, fresh));
        }}
      />

      {/* Local Storage Media Library Modal */}
      <MediaLibraryModal
        isOpen={isMediaLibraryOpen}
        onClose={() => setIsMediaLibraryOpen(false)}
        mediaList={storedMedia}
        onMediaListChange={(updated) => setStoredMedia(updated)}
        onSelectMediaForPost={(item) => {
          setIsMediaLibraryOpen(false);
          setEditingPost(null);
          setQuickAddDate(localDateString());
          setQuickAddTime('10:00');
          setQuickAddMedia([item]);
          setIsComposerOpen(true);
        }}
      />

      {/* Floating Relate Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 z-[90] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2 rounded-[10px] bg-[#0f172a] px-3.5 py-2.5 text-center text-[11.5px] font-medium text-white shadow-[0_12px_30px_rgba(15,23,42,0.3)]">
          {toastMessage.type === 'info' ? (
            <Info className="h-4 w-4 shrink-0 text-[#c4b5fd]" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
