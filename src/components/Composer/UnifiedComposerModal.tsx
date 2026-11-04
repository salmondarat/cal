import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  Clock,
  Calendar,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Plus,
  Play,
  ArrowRight,
  HardDrive,
  Send,
  Loader2,
} from 'lucide-react';
import {
  PlatformId,
  MediaFormat,
  MediaItem,
  ScheduledPost,
  PlatformCustomization,
} from '../../types';
import { ALL_PLATFORM_IDS, PLATFORMS, MAX_FILE_SIZE } from '../../constants/platforms';
import { PlatformIcon } from '../PlatformIcon';
import {
  formatBytes,
  validateFileSize,
  processFileToMediaItem,
} from '../../utils/mediaUtils';
import { saveMediaItemToStorage } from '../../utils/mediaStorage';
import { toUserMessage } from '../../utils/errorMessages';
import { friendlyErrorTitle } from '../../utils/explainError';
import { localDateString } from '../../utils/localDate';

interface UnifiedComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavePost: (post: ScheduledPost) => void | Promise<unknown>;
  onPublishPost?: (post: ScheduledPost) => void | Promise<unknown>;
  initialPost?: ScheduledPost | null;
  initialDate?: string;
  initialTime?: string;
  initialMedia?: MediaItem[];
  onPreviewPost?: (post: ScheduledPost) => void;
  availableStoredMedia?: MediaItem[];
  backendOnline?: boolean | null;
}

const COMMON_TAGS = [
  '#B2B',
  '#SaaS',
  '#SalesPipeline',
  '#Productivity',
  '#TechInnovation',
  '#Marketing',
  '#Growth',
  '#CustomerSuccess',
];

export const UnifiedComposerModal: React.FC<UnifiedComposerModalProps> = ({
  isOpen,
  onClose,
  onSavePost,
  onPublishPost,
  initialPost,
  initialDate,
  initialTime,
  initialMedia,
  onPreviewPost,
  availableStoredMedia = [],
  backendOnline = null,
}) => {
  const [title, setTitle] = useState('');
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(initialDate || localDateString());
  const [scheduledTime, setScheduledTime] = useState(initialTime || '10:00');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([
    'instagram',
    'tiktok',
    'youtube',
  ]);
  const [baseFormat, setBaseFormat] = useState<MediaFormat>('image');
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [baseCaption, setBaseCaption] = useState('');
  const [baseHashtags, setBaseHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [platformOverrides, setPlatformOverrides] = useState<
    Partial<Record<PlatformId, PlatformCustomization>>
  >({});
  const [activePlatformTab, setActivePlatformTab] = useState<PlatformId | null>(null);
  const [igAccounts, setIgAccounts] = useState<{ id: string; accountName: string; active: boolean }[]>([]);
  const [instagramAccountId, setInstagramAccountId] = useState('');

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOverDropZone, setIsDragOverDropZone] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (initialPost) {
      setTitle(initialPost.title);
      setScheduledDate(initialPost.scheduledDate);
      setScheduledTime(initialPost.scheduledTime);
      setSelectedPlatforms([...initialPost.platforms]);
      setBaseFormat(initialPost.format);
      setMediaList([...initialPost.media]);
      setBaseCaption(initialPost.baseCaption);
      setBaseHashtags([...initialPost.baseHashtags]);
      setPlatformOverrides({ ...initialPost.platformOverrides });
      setActivePlatformTab(initialPost.platforms[0] || null);
      setInstagramAccountId(initialPost.platformAccounts?.instagram || '');
    } else {
      const seededMedia = initialMedia ? [...initialMedia] : [];
      setTitle('');
      setScheduledDate(initialDate || localDateString());
      setScheduledTime(initialTime || '10:00');
      setSelectedPlatforms(['instagram', 'tiktok', 'youtube']);
      setBaseFormat(
        seededMedia.length > 1 ? 'carousel' : seededMedia[0]?.type.startsWith('video/') ? 'video' : 'image',
      );
      setMediaList(seededMedia);
      setBaseCaption('');
      setBaseHashtags(['#B2BSaaS', '#TechInnovation']);
      setPlatformOverrides({});
      setActivePlatformTab('instagram');
      setInstagramAccountId('');
    }
    setUploadError(null);
  }, [initialPost, initialDate, initialTime, initialMedia, isOpen]);

  // Load connected Instagram accounts so a post can target a specific one.
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/connections')
      .then((r) => r.json())
      .then((conns) => {
        const accounts: { id: string; accountName: string; active: boolean }[] = conns.instagramAccounts || [];
        setIgAccounts(accounts);
        setInstagramAccountId((prev) => {
          if (prev && accounts.some((a) => a.id === prev)) return prev;
          return accounts.find((a) => a.active)?.id || accounts[0]?.id || '';
        });
      })
      .catch(() => setIgAccounts([]));
  }, [isOpen]);

  if (!isOpen) return null;

  // Toggle platform selection
  const togglePlatform = (pId: PlatformId) => {
    if (selectedPlatforms.includes(pId)) {
      if (selectedPlatforms.length === 1) return; // keep at least one
      const updated = selectedPlatforms.filter((p) => p !== pId);
      setSelectedPlatforms(updated);
      if (activePlatformTab === pId) {
        setActivePlatformTab(updated[0] || null);
      }
    } else {
      const updated = [...selectedPlatforms, pId];
      setSelectedPlatforms(updated);
      if (!activePlatformTab) setActivePlatformTab(pId);
    }
  };

  // Add files to media list
  const handleFilesAdded = async (files: FileList | File[]) => {
    setUploadError(null);
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateFileSize(file);
      if (!validation.valid) {
        setUploadError(validation.error || 'File size exceeds maximum 1 GB limit.');
        return;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setIsUploading(true);
    setUploadTotal(validFiles.length);
    setUploadProgress(0);

    try {
      const newMediaItems: MediaItem[] = [];
      const failures: string[] = [];
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        try {
          const item = await processFileToMediaItem(file);
          newMediaItems.push(await saveMediaItemToStorage(item));
        } catch (err) {
          const raw = toUserMessage(err, 'the upload did not finish');
          failures.push(`${file.name}: ${friendlyErrorTitle(raw) || raw}`);
        }
        setUploadProgress(i + 1);
      }

      if (failures.length) {
        setUploadError(`${failures.length} file(s) could not be copied into shared media storage — ${failures.join(' | ')}`);
      }

      if (!newMediaItems.length) {
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }

      const combined = [...mediaList, ...newMediaItems];
      setMediaList(combined);

      // Auto-update baseFormat
      if (combined.length > 1) {
        setBaseFormat('carousel');
      } else if (combined.length === 1 && combined[0].type.startsWith('video/')) {
        setBaseFormat('video');
      } else {
        setBaseFormat('image');
      }

      setIsUploading(false);
      setUploadProgress(0);
      setUploadTotal(0);
    } catch {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadError('The media upload did not finish. Check that the schedule service is running, then try again.');
    }
  };

  const removeMediaItem = (id: string) => {
    const filtered = mediaList.filter((m) => m.id !== id);
    setMediaList(filtered);
    if (filtered.length <= 1 && baseFormat === 'carousel') {
      setBaseFormat(filtered[0]?.type.startsWith('video/') ? 'video' : 'image');
    }
  };

  // Hashtag handling
  const handleAddHashtag = (tag: string) => {
    const cleanTag = tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`;
    if (cleanTag.length > 1 && !baseHashtags.includes(cleanTag)) {
      setBaseHashtags([...baseHashtags, cleanTag]);
    }
    setHashtagInput('');
  };

  const removeHashtag = (tagToRemove: string) => {
    setBaseHashtags(baseHashtags.filter((t) => t !== tagToRemove));
  };

  // Platform override updater helper
  const updatePlatformOverride = (
    pId: PlatformId,
    field: keyof PlatformCustomization,
    value: any
  ) => {
    const current = platformOverrides[pId] || {
      caption: baseCaption,
      hashtags: [...baseHashtags],
      scheduledTime: scheduledTime,
      format: baseFormat,
    };

    setPlatformOverrides({
      ...platformOverrides,
      [pId]: {
        ...current,
        [field]: value,
      },
    });
  };

  // Build final ScheduledPost object
  const buildPostObject = (status: 'scheduled' | 'draft' = 'scheduled'): ScheduledPost => {
    return {
      id: initialPost?.id || `post-${Date.now()}`,
      title: title.trim() || 'Untitled Social Campaign',
      scheduledDate,
      scheduledTime,
      platforms: selectedPlatforms,
      format: baseFormat,
      media: mediaList,
      baseCaption,
      baseHashtags,
      platformOverrides,
      platformAccounts: {
        ...(initialPost?.platformAccounts || {}),
        ...(instagramAccountId ? { instagram: instagramAccountId } : {}),
      },
      status,
      createdAt: initialPost?.createdAt || new Date().toISOString(),
    };
  };

  const blockingIssues: string[] = [];
  if (!mediaList.length) blockingIssues.push('Attach at least one image or video.');
  const browserOnly = mediaList.filter((m) => !m.serverManaged);
  if (browserOnly.length) {
    blockingIssues.push(
      `${browserOnly.length} file(s) live only in this browser (${browserOnly.map((m) => m.name).join(', ')}). Re-upload them so the scheduler can reach the file.`,
    );
  }
  for (const pId of selectedPlatforms) {
    const override = platformOverrides[pId];
    const caption = override?.caption ?? baseCaption;
    const tags = override?.hashtags ?? baseHashtags;
    const length = `${caption}${tags.length ? `\n\n${tags.join(' ')}` : ''}`.length;
    if (length > PLATFORMS[pId].charLimit) {
      blockingIssues.push(`${PLATFORMS[pId].name} caption is ${length} characters; the limit is ${PLATFORMS[pId].charLimit.toLocaleString()}.`);
    }
  }
  if (baseFormat === 'video' && !mediaList.some((m) => m.type.startsWith('video/'))) {
    blockingIssues.push('Format is set to video but no video file is attached.');
  }

  const handleSave = async (status: 'scheduled' | 'draft' = 'scheduled') => {
    if (blockingIssues.length) {
      setUploadError(blockingIssues[0]);
      return;
    }
    await onSavePost(buildPostObject(status));
    onClose();
  };

  const handlePublishNow = async () => {
    if (blockingIssues.length) {
      setUploadError(blockingIssues[0]);
      return;
    }
    if (!backendOnline) {
      setUploadError('Start the schedule service (pnpm dev:server) before publishing.');
      return;
    }
    setIsPublishing(true);
    try {
      const post = buildPostObject('scheduled');
      await onSavePost(post);
      await onPublishPost?.(post);
      onClose();
    } finally {
      setIsPublishing(false);
    }
  };

  const handleLivePreview = () => {
    const post = buildPostObject('scheduled');
    onPreviewPost?.(post);
  };

  // Calculate total media size
  const totalMediaBytes = mediaList.reduce((acc, m) => acc + m.size, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[rgba(15,23,42,0.34)] backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-[0_24px_64px_-16px_rgba(15,23,42,0.34)] border border-[#dde3ec] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[8px] bg-[#0f172a] text-white flex items-center justify-center font-bold text-xs">
              R
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0f172a] leading-none">
                {initialPost ? 'Edit Scheduled Social Post' : 'Unified Social Post Composer'}
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Multi-channel scheduling with drag-and-drop media up to 1 GB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mediaList.length > 0 && (
              <button
                onClick={handleLivePreview}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#6d28d9] bg-[#f5f3ff] hover:bg-[#ede9fe] border border-[rgba(124,58,237,0.3)] rounded-[6px] transition-colors cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Device Preview</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-[8px] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#fafbfd]">
          {/* Section 1: Target Platforms Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#1e293b] flex items-center justify-between">
              <span>Select Target Channels</span>
              <span className="text-[11px] font-normal text-neutral-500">
                {selectedPlatforms.length} active
              </span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ALL_PLATFORM_IDS.map((pId) => {
                const pConfig = PLATFORMS[pId];
                const isSelected = selectedPlatforms.includes(pId);

                return (
                  <button
                    key={pId}
                    type="button"
                    onClick={() => togglePlatform(pId)}
                    className={`p-2.5 rounded-[8px] border text-left transition-all flex items-center gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-white border-[#6d28d9] shadow-2xs ring-1 ring-[#6d28d9]'
                        : 'bg-white border-neutral-200/90 hover:border-neutral-300 text-neutral-600'
                    }`}
                  >
                    <PlatformIcon platform={pId} size={18} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-neutral-900 truncate">
                        {pConfig.name}
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate">
                        {pConfig.charLimit.toLocaleString()} chars
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPlatforms.includes('instagram') && igAccounts.length > 1 && (
              <div className="flex items-center gap-2 pt-1">
                <label className="text-[11px] font-medium text-neutral-500" htmlFor="ig-account-select">
                  Instagram account
                </label>
                <select
                  id="ig-account-select"
                  value={instagramAccountId}
                  onChange={(e) => setInstagramAccountId(e.target.value)}
                  className="px-2 py-1 text-[11px] bg-white border border-neutral-200 rounded-[6px] text-neutral-800"
                >
                  {igAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName}
                      {account.active ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Section 2: Media Ingestion Zone (Support up to 1 GB) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#1e293b] flex items-center gap-1.5">
                <span>Upload Media Assets</span>
                <span className="text-[10px] font-mono text-neutral-400">
                  (Images, Videos & Carousels up to 1.0 GB)
                </span>
              </label>

              {totalMediaBytes > 0 && (
                <span className="text-xs font-mono text-neutral-600 tabular-nums">
                  {formatBytes(totalMediaBytes)} / 1.0 GB
                </span>
              )}
            </div>

            {/* Error Banner */}
            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-[8px] flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOverDropZone(true);
              }}
              onDragLeave={() => setIsDragOverDropZone(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOverDropZone(false);
                if (e.dataTransfer.files) {
                  handleFilesAdded(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-[10px] text-center transition-all cursor-pointer relative ${
                isDragOverDropZone
                  ? 'border-[#6d28d9] bg-[#f5f3ff]/70'
                  : 'border-neutral-200/90 hover:border-[#7c3aed] bg-neutral-50/60 hover:bg-neutral-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => {
                  if (e.target.files) handleFilesAdded(e.target.files);
                }}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center space-y-1.5">
                <div className="w-10 h-10 rounded-full bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.2)] flex items-center justify-center text-[#6d28d9]">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div className="text-xs font-semibold text-neutral-800">
                  Click or drag and drop images or videos here
                </div>
                <div className="text-[11px] text-neutral-500">
                  Supports MP4, MOV, WebM, JPG, PNG up to <span className="font-semibold text-neutral-700">1 GB</span> per post
                </div>
              </div>

              {isUploading && (
                <div className="mt-3 max-w-xs mx-auto">
                  <div className="flex items-center justify-between text-[11px] font-mono text-neutral-600 mb-1">
                    <span>Uploading to shared storage...</span>
                    <span>
                      {uploadProgress}/{uploadTotal || mediaList.length || 1}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#6d28d9] transition-all duration-200"
                      style={{ width: `${uploadTotal ? (uploadProgress / uploadTotal) * 100 : 30}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Saved storage picker */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {availableStoredMedia.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLibraryPicker(!showLibraryPicker)}
                  className="px-2 py-0.5 text-[10px] font-medium text-[#6d28d9] bg-[#f5f3ff] border border-[#ddd6fe] rounded-[6px] hover:bg-[#ede9fe] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <HardDrive className="w-3 h-3 text-[#6d28d9]" />
                  <span>Choose from Saved Storage ({availableStoredMedia.length})</span>
                </button>
              )}
            </div>

            {/* Stored Media Selector Tray */}
            {showLibraryPicker && availableStoredMedia.length > 0 && (
              <div className="p-3 border border-neutral-200 rounded-[8px] bg-neutral-50/80 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-neutral-800">
                  <span>Select from Local Storage Library:</span>
                  <button
                    type="button"
                    onClick={() => setShowLibraryPicker(false)}
                    className="text-neutral-400 hover:text-neutral-600 text-[11px]"
                  >
                    Close
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto">
                  {availableStoredMedia.map((asset) => (
                    <div
                      key={asset.id}
                      onClick={() => {
                        if (!mediaList.some((m) => m.id === asset.id)) {
                          const combined = [...mediaList, asset];
                          setMediaList(combined);
                          if (combined.length > 1) setBaseFormat('carousel');
                          else if (asset.type.startsWith('video/')) setBaseFormat('video');
                        }
                      }}
                      className="p-1.5 rounded-[6px] border border-neutral-200 bg-white hover:border-[#6d28d9] cursor-pointer text-left transition-all group"
                    >
                      <div className="aspect-video bg-neutral-900 rounded-[4px] overflow-hidden relative mb-1">
                        {asset.type.startsWith('video/') ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-4 h-4 text-white fill-white" />
                          </div>
                        ) : (
                          <img
                            src={asset.url}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="text-[10px] font-medium text-neutral-800 truncate">
                        {asset.name}
                      </div>
                      <div className="text-[9px] text-neutral-400 font-mono">
                        {formatBytes(asset.size)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Media Thumbnails List */}
            {mediaList.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                {mediaList.map((item, idx) => (
                  <div
                    key={item.id}
                    className="group relative rounded-[8px] border border-neutral-200 bg-white overflow-hidden shadow-2xs"
                  >
                    <div className="relative aspect-video bg-neutral-900 flex items-center justify-center">
                      {item.type.startsWith('video/') ? (
                        <>
                          <video
                            src={item.url}
                            className="w-full h-full object-cover"
                            playsInline
                            muted
                          />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white fill-white" />
                          </div>
                        </>
                      ) : (
                        <img
                          src={item.url}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      )}

                      <button
                        type="button"
                        onClick={() => removeMediaItem(item.id)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-[rgba(15,23,42,0.34)] text-white hover:bg-red-600 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="p-1.5 flex items-center justify-between text-[10px] font-mono text-neutral-600">
                      <span className="truncate max-w-[100px]">{item.name}</span>
                      <span className="text-neutral-400">{formatBytes(item.size)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Campaign Title, Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#1e293b] mb-1 block">
                Campaign / Post Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 Product Launch Teaser"
                className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#6d28d9]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#1e293b] mb-1 block">
                Scheduled Date
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#6d28d9]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#1e293b] mb-1 block">
                Base Scheduled Time
              </label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#6d28d9]"
              />
            </div>
          </div>

          {/* Section 4: Base Caption & Hashtags */}
          <div className="space-y-3 p-4 rounded-[8px] relate-card">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#0f172a]">
                  Core Caption (Shared across all channels)
                </label>
                <span className="text-[11px] font-mono text-neutral-500">
                  {baseCaption.length} characters
                </span>
              </div>
              <textarea
                rows={3}
                value={baseCaption}
                onChange={(e) => setBaseCaption(e.target.value)}
                placeholder="Write your primary message, announcement, or story here..."
                className="w-full px-3 py-2 text-xs bg-white border border-neutral-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#6d28d9] leading-relaxed"
              />
            </div>

            {/* Hashtag Management */}
            <div>
              <label className="text-xs font-semibold text-[#0f172a] mb-1 block">
                Hashtags ({baseHashtags.length})
              </label>

              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={hashtagInput}
                  onChange={(e) => setHashtagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddHashtag(hashtagInput);
                    }
                  }}
                  placeholder="Type hashtag and press Enter..."
                  className="flex-1 px-3 py-1 text-xs bg-white border border-neutral-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#6d28d9]"
                />
                <button
                  type="button"
                  onClick={() => handleAddHashtag(hashtagInput)}
                  className="px-3 py-1 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[8px] hover:bg-neutral-50"
                >
                  Add
                </button>
              </div>

              {/* Active Hashtags */}
              <div className="flex flex-wrap gap-1.5">
                {baseHashtags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono text-[#6d28d9] bg-white border border-[rgba(124,58,237,0.3)] rounded-[6px]"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => removeHashtag(tag)}
                      className="text-neutral-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[11px]">
                <span className="text-neutral-400">Suggestions:</span>
                {COMMON_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleAddHashtag(t)}
                    className="text-neutral-600 hover:text-[#6d28d9] hover:underline"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 5: Individual Platform Customization Tabs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#1e293b]">
                Individual Channel Customization
              </label>
              <span className="text-[11px] text-neutral-500">
                Override caption, hashtags, format, or time per channel
              </span>
            </div>

            {/* Platform Selector Tabs */}
            <div className="flex items-center gap-1 border-b border-neutral-200 pb-1 overflow-x-auto">
              {selectedPlatforms.map((pId) => {
                const isActive = activePlatformTab === pId;
                const pConfig = PLATFORMS[pId];
                const override = platformOverrides[pId];

                return (
                  <button
                    key={pId}
                    type="button"
                    onClick={() => setActivePlatformTab(pId)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-[8px] transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-white border-x border-t border-neutral-200 text-[#6d28d9] font-semibold -mb-1 pb-2 shadow-2xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <PlatformIcon platform={pId} size={14} />
                    <span>{pConfig.name}</span>
                    {override?.caption && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Platform Tab Editor */}
            {activePlatformTab && (
              <div className="p-4 bg-white border border-neutral-200 rounded-[8px] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={activePlatformTab} size={18} />
                    <span className="text-xs font-semibold text-neutral-900">
                      {PLATFORMS[activePlatformTab].name} Settings
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-neutral-400">
                    Max: {PLATFORMS[activePlatformTab].charLimit.toLocaleString()} characters
                  </span>
                </div>

                {/* Specific Caption */}
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                    Customized Caption for {PLATFORMS[activePlatformTab].name}
                  </label>
                  <textarea
                    rows={2}
                    value={platformOverrides[activePlatformTab]?.caption ?? baseCaption}
                    onChange={(e) =>
                      updatePlatformOverride(activePlatformTab, 'caption', e.target.value)
                    }
                    placeholder="Leave as base caption or customize for this audience..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#6d28d9]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Specific Time */}
                  <div>
                    <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                      Specific Schedule Time
                    </label>
                    <input
                      type="time"
                      value={
                        platformOverrides[activePlatformTab]?.scheduledTime ?? scheduledTime
                      }
                      onChange={(e) =>
                        updatePlatformOverride(activePlatformTab, 'scheduledTime', e.target.value)
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px]"
                    />
                  </div>

                  {/* Format override */}
                  <div>
                    <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                      Channel Format
                    </label>
                    <select
                      value={platformOverrides[activePlatformTab]?.format ?? baseFormat}
                      onChange={(e) =>
                        updatePlatformOverride(
                          activePlatformTab,
                          'format',
                          e.target.value as MediaFormat
                        )
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px]"
                    >
                      {PLATFORMS[activePlatformTab].supportedFormats.map((f, i) => (
                        <option key={i} value={f.format}>
                          {f.label} ({f.aspectRatio})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Platform Specific extras */}
                {activePlatformTab === 'instagram' && (
                  <div>
                    <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                      Automated First Comment (optional)
                    </label>
                    <input
                      type="text"
                      value={platformOverrides['instagram']?.firstComment || ''}
                      onChange={(e) =>
                        updatePlatformOverride('instagram', 'firstComment', e.target.value)
                      }
                      placeholder="e.g. Drop your team size below to unlock VIP perks! 👇"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px]"
                    />
                  </div>
                )}

                {activePlatformTab === 'tiktok' && (
                  <div>
                    <label className="text-[11px] font-medium text-neutral-700 mb-1 block">
                      Soundtrack / Audio Title
                    </label>
                    <input
                      type="text"
                      value={platformOverrides['tiktok']?.soundTitle || ''}
                      onChange={(e) =>
                        updatePlatformOverride('tiktok', 'soundTitle', e.target.value)
                      }
                      placeholder="e.g. Original Audio - Relate Sound Lab"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px]"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200 flex flex-col gap-2.5 bg-white">
          {(blockingIssues.length > 0 || uploadError) && (
            <div className="space-y-1">
              {uploadError && (
                <div className="flex items-start gap-1.5 text-[11px] text-red-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{uploadError}</span>
                </div>
              )}
              {blockingIssues.slice(0, 3).map((issue) => (
                <div key={issue} className="flex items-start gap-1.5 text-[11px] text-amber-800">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono">
              <Clock className="w-3.5 h-3.5 text-[#6d28d9]" />
              <span>
                Queueing for {scheduledDate} at {scheduledTime}
              </span>
              {backendOnline === false && (
                <span className="text-amber-700">backend offline</span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[8px] hover:bg-neutral-50 cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleSave('draft')}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[8px] hover:bg-neutral-50 cursor-pointer"
              >
                Save Draft
              </button>

              {onPublishPost && (
                <button
                  type="button"
                  onClick={() => void handlePublishNow()}
                  disabled={isPublishing}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#6d28d9] bg-white border border-[#6d28d9] rounded-[8px] hover:bg-[#f5f3ff] transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5"
                  title="Send to the connected channels immediately"
                >
                  {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{isPublishing ? 'Publishing...' : 'Publish now'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleSave('scheduled')}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[8px] transition-colors shadow-xs cursor-pointer"
              >
                Schedule Across Channels
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
