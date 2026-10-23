import React, { useState, useEffect } from 'react';
import {
  CalendarViewMode,
  MediaFormat,
  PlatformId,
  ScheduledPost,
  MediaItem,
} from './types';
import { Header } from './components/Header';
import { PlatformFilterBar } from './components/PlatformFilterBar';
import { CalendarHeader } from './components/Calendar/CalendarHeader';
import { MonthView } from './components/Calendar/MonthView';
import { WeekView } from './components/Calendar/WeekView';
import { DayView } from './components/Calendar/DayView';
import { UnifiedComposerModal } from './components/Composer/UnifiedComposerModal';
import { DeviceSimulatorModal } from './components/DeviceSimulator/DeviceSimulatorModal';
import { BulkCampaignModal } from './components/BulkUpload/BulkCampaignModal';
import { ApiSettingsModal } from './components/Settings/ApiSettingsModal';
import { MediaLibraryModal } from './components/MediaLibrary/MediaLibraryModal';
import { CheckCircle2, Info } from 'lucide-react';
import { getAllStoredMedia, saveMediaItemToStorage } from './utils/mediaStorage';
import { processFileToMediaItem, validateFileSize } from './utils/mediaUtils';

const STORAGE_KEY = 'relate_social_scheduled_posts_v2';

export default function App() {
  const [posts, setPosts] = useState<ScheduledPost[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return [];
  });

  // Keep localStorage in sync
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }, [posts]);

  // Persistent Media Library State (IndexedDB + LocalStorage)
  const [storedMedia, setStoredMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    getAllStoredMedia()
      .then((items) => {
        setStoredMedia(items);
      })
      .catch((err) => {
        console.warn('Media loading notice:', err);
      });
  }, []);

  // Calendar State
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

  // Filter State
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId | 'all'>('all');
  const [selectedFormat, setSelectedFormat] = useState<MediaFormat | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals State
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<string | undefined>(undefined);
  const [quickAddTime, setQuickAddTime] = useState<string | undefined>(undefined);

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [activeSimulatorPost, setActiveSimulatorPost] = useState<ScheduledPost | null>(null);

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);

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
      if (!val.valid) continue;
      const item = await processFileToMediaItem(file);
      await saveMediaItemToStorage(item);
      validItems.push(item);
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

      setPosts((prev) => [newPost, ...prev]);
      showToast(`Added "${newPost.title}" to ${targetDate} from dropped media!`);
    }
  };

  // Create / Update post handler
  const handleSavePost = (savedPost: ScheduledPost) => {
    setPosts((prevPosts) => {
      const exists = prevPosts.some((p) => p.id === savedPost.id);
      if (exists) {
        showToast(`Updated campaign "${savedPost.title}"`);
        return prevPosts.map((p) => (p.id === savedPost.id ? savedPost : p));
      } else {
        showToast(
          `Scheduled "${savedPost.title}" across ${savedPost.platforms.length} channels`
        );
        return [savedPost, ...prevPosts];
      }
    });
    setEditingPost(null);
  };

  // Bulk Campaign Series scheduler handler
  const handleScheduleBulkPosts = (bulkPosts: ScheduledPost[]) => {
    setPosts((prev) => [...bulkPosts, ...prev]);
    showToast(
      `Scheduled bulk campaign series (${bulkPosts.length} posts) successfully!`,
      'success'
    );
  };

  // Delete post handler
  const handleDeletePost = (postId: string) => {
    const postToDelete = posts.find((p) => p.id === postId);
    if (!postToDelete) return;

    setPosts((prev) => prev.filter((p) => p.id !== postId));
    showToast(`Removed post "${postToDelete.title}"`, 'info');

    if (activeSimulatorPost?.id === postId) {
      setActiveSimulatorPost(null);
      setIsSimulatorOpen(false);
    }
  };

  // Instant simulate publish handler
  const handlePublishNow = (postToPublish: ScheduledPost) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postToPublish.id
          ? {
              ...p,
              status: 'published',
              metrics: {
                likes: (p.metrics?.likes || 0) + 124,
                comments: (p.metrics?.comments || 0) + 18,
                shares: (p.metrics?.shares || 0) + 29,
                views: (p.metrics?.views || 0) + 1450,
              },
            }
          : p
      )
    );
    showToast(
      `Published "${postToPublish.title}" live across ${postToPublish.platforms.join(', ')}!`
    );
  };

  // Quick add trigger from day or time cell
  const handleQuickAdd = (dateStr: string, timeStr?: string) => {
    setEditingPost(null);
    setQuickAddDate(dateStr);
    setQuickAddTime(timeStr || '10:00');
    setIsComposerOpen(true);
  };

  // Edit trigger
  const handleEditPost = (post: ScheduledPost) => {
    setEditingPost(post);
    setQuickAddDate(post.scheduledDate);
    setQuickAddTime(post.scheduledTime);
    setIsComposerOpen(true);
  };

  // Preview in Device Simulator trigger
  const handlePreviewPost = (post: ScheduledPost) => {
    setActiveSimulatorPost(post);
    setIsSimulatorOpen(true);
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
    setCurrentDate(new Date(2026, 9, 21)); // October 21, 2026
  };

  // Platform counts
  const countsByPlatform: Record<PlatformId, number> = {
    instagram: 0,
    facebook: 0,
    threads: 0,
    tiktok: 0,
    youtube: 0,
  };

  posts.forEach((p) => {
    p.platforms.forEach((pId) => {
      if (countsByPlatform[pId] !== undefined) {
        countsByPlatform[pId]++;
      }
    });
  });

  // Filtered posts
  const filteredPosts = posts.filter((post) => {
    // Platform match
    if (selectedPlatform !== 'all' && !post.platforms.includes(selectedPlatform)) {
      return false;
    }
    // Format match
    if (selectedFormat !== 'all' && post.format !== selectedFormat) {
      return false;
    }
    // Search query match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = post.title.toLowerCase().includes(q);
      const matchCaption = post.baseCaption.toLowerCase().includes(q);
      const matchTag = post.baseHashtags.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchCaption && !matchTag) return false;
    }
    return true;
  });

  // Calculate total media storage used
  const totalStorageBytes =
    storedMedia.reduce((acc, m) => acc + m.size, 0) ||
    posts.reduce((acc, p) => acc + p.media.reduce((mAcc, m) => mAcc + m.size, 0), 0);

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-[#000000] flex flex-col font-sans">
      {/* Top Bar (Relate Design System 3-Zone Contract) */}
      <Header
        posts={posts}
        totalStorageBytes={totalStorageBytes}
        onOpenComposer={() => {
          setEditingPost(null);
          setQuickAddDate(undefined);
          setQuickAddTime(undefined);
          setIsComposerOpen(true);
        }}
        onOpenSimulator={() => {
          const target = filteredPosts[0] || posts[0];
          if (target) {
            setActiveSimulatorPost(target);
            setIsSimulatorOpen(true);
          } else {
            showToast('No posts available to preview. Schedule your first post!', 'info');
          }
        }}
        onOpenBulkCampaign={() => setIsBulkModalOpen(true)}
        onOpenMediaLibrary={() => setIsMediaLibraryOpen(true)}
        onOpenApiSettings={() => setIsApiSettingsOpen(true)}
      />

      {/* Platform & Format Filter Bar */}
      <PlatformFilterBar
        selectedPlatform={selectedPlatform}
        onSelectPlatform={setSelectedPlatform}
        selectedFormat={selectedFormat}
        onSelectFormat={setSelectedFormat}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        countsByPlatform={countsByPlatform}
        totalCount={posts.length}
      />

      {/* Main Calendar Viewport (Full width matching header & filter bar side length) */}
      <main className="flex-1 flex flex-col w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="flex-1 bg-white rounded-[10px] border border-neutral-200/90 shadow-xs flex flex-col overflow-hidden">
          {/* Calendar View Switcher & Date Navigation */}
          <CalendarHeader
            currentDate={currentDate}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onPrev={handlePrev}
            onNext={handleNext}
            onToday={handleToday}
          />

          {/* Active View Mode */}
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
            />
          )}
        </div>
      </main>

      {/* Unified Post Composer Modal */}
      <UnifiedComposerModal
        isOpen={isComposerOpen}
        onClose={() => {
          setIsComposerOpen(false);
          setEditingPost(null);
        }}
        onSavePost={handleSavePost}
        initialPost={editingPost}
        initialDate={quickAddDate}
        initialTime={quickAddTime}
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

      {/* Local Storage Media Library Modal */}
      <MediaLibraryModal
        isOpen={isMediaLibraryOpen}
        onClose={() => setIsMediaLibraryOpen(false)}
        mediaList={storedMedia}
        onMediaListChange={(updated) => setStoredMedia(updated)}
        onSelectMediaForPost={(item) => {
          setIsMediaLibraryOpen(false);
          setEditingPost(null);
          setQuickAddDate(new Date().toISOString().split('T')[0]);
          setQuickAddTime('10:00');
          setIsComposerOpen(true);
        }}
      />

      {/* Floating Relate Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#020520] text-white text-xs font-medium rounded-[8px] shadow-lg animate-in slide-in-from-bottom-3 duration-200 border border-neutral-700">
          {toastMessage.type === 'info' ? (
            <Info className="w-4 h-4 text-[#1890ff] shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}
