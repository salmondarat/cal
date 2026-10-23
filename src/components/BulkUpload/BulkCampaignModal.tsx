import React, { useState, useRef } from 'react';
import {
  X,
  Layers,
  UploadCloud,
  Calendar,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Play,
  Film,
  Plus,
  ArrowRight,
} from 'lucide-react';
import {
  MediaItem,
  PlatformId,
  ScheduledPost,
  BulkCampaignSeriesConfig,
} from '../../types';
import { ALL_PLATFORM_IDS, PLATFORMS } from '../../constants/platforms';
import { PlatformIcon } from '../PlatformIcon';
import {
  formatBytes,
  validateFileSize,
  processFileToMediaItem,
} from '../../utils/mediaUtils';
import { saveMediaItemToStorage } from '../../utils/mediaStorage';

interface BulkCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduleBulkPosts: (posts: ScheduledPost[]) => void;
}

export const BulkCampaignModal: React.FC<BulkCampaignModalProps> = ({
  isOpen,
  onClose,
  onScheduleBulkPosts,
}) => {
  const [campaignName, setCampaignName] = useState('Q4 Product Innovation Blitz');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([
    'instagram',
    'tiktok',
    'youtube',
  ]);
  const [startDate, setStartDate] = useState('2026-10-22');
  const [baseTime, setBaseTime] = useState('11:00');
  const [cadence, setCadence] = useState<'daily' | 'every-2-days' | 'mon-wed-fri' | 'weekly'>('daily');
  const [campaignHashtags, setCampaignHashtags] = useState<string[]>([
    '#RelateCRM',
    '#B2BProductivity',
    '#SalesAutomation',
  ]);
  const [hashtagInput, setHashtagInput] = useState('');

  // Media files queue
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const togglePlatform = (pId: PlatformId) => {
    if (selectedPlatforms.includes(pId)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((p) => p !== pId));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, pId]);
    }
  };

  const handleFilesAdded = async (files: FileList | File[]) => {
    setUploadError(null);
    setIsUploading(true);

    try {
      const newItems: MediaItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const val = validateFileSize(file);
        if (!val.valid) {
          setUploadError(val.error || 'File exceeds 1GB limit');
          continue;
        }
        const item = await processFileToMediaItem(file);
        await saveMediaItemToStorage(item);
        newItems.push(item);
      }
      setMediaItems((prev) => [...prev, ...newItems]);
    } catch {
      setUploadError('Failed to process bulk upload files.');
    } finally {
      setIsUploading(false);
    }
  };

  const removeMediaItem = (id: string) => {
    setMediaItems(mediaItems.filter((m) => m.id !== id));
  };

  const addHashtag = (tag: string) => {
    const clean = tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`;
    if (clean.length > 1 && !campaignHashtags.includes(clean)) {
      setCampaignHashtags([...campaignHashtags, clean]);
    }
    setHashtagInput('');
  };

  // Generate date based on cadence
  const calculatePostDate = (start: string, index: number): string => {
    const d = new Date(start);
    if (cadence === 'daily') {
      d.setDate(d.getDate() + index);
    } else if (cadence === 'every-2-days') {
      d.setDate(d.getDate() + index * 2);
    } else if (cadence === 'mon-wed-fri') {
      let count = 0;
      let curr = new Date(start);
      while (count < index) {
        curr.setDate(curr.getDate() + 1);
        const day = curr.getDay();
        if (day === 1 || day === 3 || day === 5) {
          count++;
        }
      }
      return curr.toISOString().split('T')[0];
    } else {
      d.setDate(d.getDate() + index * 7);
    }
    return d.toISOString().split('T')[0];
  };

  // Handle final generation and scheduling
  const handleScheduleAll = () => {
    if (mediaItems.length === 0) return;

    const newPosts: ScheduledPost[] = mediaItems.map((media, idx) => {
      const scheduledDate = calculatePostDate(startDate, idx);
      const isVideo = media.type.startsWith('video/');

      return {
        id: `campaign-post-${Date.now()}-${idx}`,
        title: `${campaignName} · Part ${idx + 1} (${media.name.split('.')[0]})`,
        campaignName,
        scheduledDate,
        scheduledTime: baseTime,
        platforms: selectedPlatforms,
        format: isVideo ? 'video' : 'image',
        media: [media],
        baseCaption: `${campaignName} series (Part ${idx + 1}/${mediaItems.length}): Exploring modern high-velocity sales workflows.`,
        baseHashtags: campaignHashtags,
        platformOverrides: {
          instagram: {
            caption: `${campaignName} (Part ${idx + 1}/${mediaItems.length}) - Tap link in bio for full episode breakdown!`,
            hashtags: [...campaignHashtags, '#ProductLaunch', '#B2B'],
            scheduledTime: baseTime,
            format: isVideo ? 'video' : 'image',
          },
          tiktok: {
            caption: `Part ${idx + 1}: When your B2B software is actually fast ⚡ #relate #tech`,
            hashtags: [...campaignHashtags, '#foryou', '#startuplife'],
            scheduledTime: '12:00',
            format: isVideo ? 'video' : 'image',
          },
          youtube: {
            caption: `${campaignName} - Episode ${idx + 1}: ${media.name}`,
            hashtags: ['#Shorts', ...campaignHashtags],
            scheduledTime: baseTime,
            format: 'video',
          },
        },
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        metrics: {
          likes: Math.floor(Math.random() * 400) + 80,
          comments: Math.floor(Math.random() * 30) + 5,
          shares: Math.floor(Math.random() * 20) + 2,
        },
      };
    });

    onScheduleBulkPosts(newPosts);
    onClose();
  };

  const totalSize = mediaItems.reduce((acc, m) => acc + m.size, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-[12px] shadow-2xl border border-neutral-200/80 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-4 bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[8px] bg-[rgba(24,144,255,0.08)] border border-[rgba(24,144,255,0.2)] flex items-center justify-center text-[#0000ee]">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#020520] leading-none">
                Bulk Campaign Creator & Series Scheduler
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Ingest batches of media and schedule an automated multi-day social campaign
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-[8px] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#fcfcfc]">
          {/* Campaign Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-[8px] relate-card">
            <div>
              <label className="text-xs font-semibold text-[#020520] mb-1 block">
                Campaign Name
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Q4 Launch Week or Customer Stories Blitz"
                className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] focus:outline-none focus:ring-1 focus:ring-[#0000ee]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#020520] mb-1 block">
                Publishing Cadence
              </label>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as any)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px]"
              >
                <option value="daily">Daily (Every 1 Day)</option>
                <option value="every-2-days">Every 2 Days</option>
                <option value="mon-wed-fri">Monday, Wednesday & Friday</option>
                <option value="weekly">Weekly (Every 7 Days)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#020520] mb-1 block">
                Series Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#020520] mb-1 block">
                Daily Post Time
              </label>
              <input
                type="time"
                value={baseTime}
                onChange={(e) => setBaseTime(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px]"
              />
            </div>
          </div>

          {/* Channels Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-800">
              Broadcasting Channels
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORM_IDS.map((pId) => {
                const isSelected = selectedPlatforms.includes(pId);
                return (
                  <button
                    key={pId}
                    type="button"
                    onClick={() => togglePlatform(pId)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white border-[#0000ee] text-neutral-900 shadow-2xs font-semibold'
                        : 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    <PlatformIcon platform={pId} size={15} />
                    <span>{PLATFORMS[pId].name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Media Batch Ingestion (Up to 1 GB) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-800">
                Campaign Media Queue ({mediaItems.length} assets · {formatBytes(totalSize)})
              </label>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-[8px] text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-5 border-2 border-dashed border-neutral-300 rounded-[10px] bg-neutral-50/60 hover:bg-neutral-50 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*,image/*"
                onChange={(e) => {
                  if (e.target.files) handleFilesAdded(e.target.files);
                }}
                className="hidden"
              />
              <UploadCloud className="w-7 h-7 text-[#0000ee] mx-auto mb-1.5" />
              <div className="text-xs font-semibold text-neutral-800">
                Drop multiple videos or images here (up to 1.0 GB total)
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Each file will be scheduled as a sequential post according to your cadence
              </div>
            </div>

            {/* Media Queue Table */}
            {mediaItems.length > 0 && (
              <div className="border border-neutral-200 rounded-[8px] bg-white divide-y divide-neutral-100 max-h-56 overflow-y-auto">
                {mediaItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-neutral-100 text-neutral-700 font-mono font-bold text-[11px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </div>

                      <div className="w-10 h-7 rounded-[4px] bg-neutral-900 shrink-0 overflow-hidden relative">
                        {item.type.startsWith('video/') ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play className="w-3 h-3 text-white fill-white" />
                          </div>
                        ) : (
                          <img
                            src={item.url}
                            alt="preview"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          {calculatePostDate(startDate, idx)} at {baseTime} · {formatBytes(item.size)}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeMediaItem(item.id)}
                      className="p-1 text-neutral-400 hover:text-red-500 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hashtag template */}
          <div>
            <label className="text-xs font-semibold text-neutral-800 mb-1 block">
              Campaign Hashtags
            </label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addHashtag(hashtagInput);
                  }
                }}
                placeholder="Add tag and hit Enter..."
                className="flex-1 px-3 py-1 text-xs bg-white border border-neutral-200 rounded-[8px]"
              />
              <button
                type="button"
                onClick={() => addHashtag(hashtagInput)}
                className="px-3 py-1 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[8px]"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {campaignHashtags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[11px] font-mono text-[#0000ee] bg-blue-50/80 border border-blue-200 rounded-[6px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200 flex items-center justify-between bg-neutral-50/70">
          <div className="text-xs text-neutral-500 font-mono">
            {mediaItems.length} posts will be generated across {selectedPlatforms.length} channels
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-[8px]"
            >
              Cancel
            </button>
            <button
              disabled={mediaItems.length === 0}
              onClick={handleScheduleAll}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0000ee] hover:bg-[#0000cc] disabled:opacity-50 disabled:cursor-not-allowed rounded-[8px] transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>Schedule Campaign Series</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
