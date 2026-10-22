import React, { useState } from 'react';
import { X, Smartphone, ArrowRight, Share2, Sparkles, CheckCircle2 } from 'lucide-react';
import { ScheduledPost, PlatformId } from '../../types';
import { DeviceSimulator } from './DeviceSimulator';
import { PLATFORMS } from '../../constants/platforms';
import { PlatformIcon } from '../PlatformIcon';

interface DeviceSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: ScheduledPost | null;
  allPosts: ScheduledPost[];
  onSelectPost: (post: ScheduledPost) => void;
  onPublishNow: (post: ScheduledPost) => void;
}

export const DeviceSimulatorModal: React.FC<DeviceSimulatorModalProps> = ({
  isOpen,
  onClose,
  post,
  allPosts,
  onSelectPost,
  onPublishNow,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId>(
    post?.platforms[0] || 'instagram'
  );
  const [isPublishedNotification, setIsPublishedNotification] = useState(false);

  if (!isOpen || !post) return null;

  const handlePublish = () => {
    onPublishNow(post);
    setIsPublishedNotification(true);
    setTimeout(() => {
      setIsPublishedNotification(false);
    }, 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-[12px] shadow-2xl border border-neutral-200/80 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-4 bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[8px] bg-[rgba(24,144,255,0.08)] border border-[rgba(24,144,255,0.2)] flex items-center justify-center text-[#0000ee]">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#020520] leading-none">
                Interactive Format & Device Simulator
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Test captions, hashtags, and media playback in native channel chrome
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Post Switcher Dropdown */}
            {allPosts.length > 1 && (
              <select
                value={post.id}
                onChange={(e) => {
                  const target = allPosts.find((p) => p.id === e.target.value);
                  if (target) onSelectPost(target);
                }}
                className="text-xs bg-white border border-neutral-200 rounded-[8px] px-2.5 py-1.5 font-medium text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#0000ee]"
              >
                {allPosts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.scheduledDate})
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-[8px] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: Split view (Left: Post info & platform checklist, Right: Device Mockup) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 bg-[#fcfcfc]">
          {/* Left Column: Post Specs & Platform Breakdown */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              {/* Campaign Title & Date */}
              <div className="p-3.5 rounded-[8px] relate-card">
                <span className="text-[11px] font-mono text-[#0000ee] font-medium uppercase tracking-wider">
                  Campaign Title
                </span>
                <h4 className="text-sm font-semibold text-[#020520] mt-0.5">{post.title}</h4>
                <div className="mt-2 pt-2 border-t border-[rgba(24,144,255,0.15)] flex items-center justify-between text-xs text-neutral-600 font-mono">
                  <span>Scheduled: {post.scheduledDate}</span>
                  <span>Time: {post.scheduledTime}</span>
                </div>
              </div>

              {/* Target Platforms List */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700">
                  Target Channels ({post.platforms.length})
                </label>
                <div className="space-y-1.5">
                  {post.platforms.map((pId) => {
                    const pConfig = PLATFORMS[pId];
                    const isCurrent = selectedPlatform === pId;
                    const override = post.platformOverrides[pId];

                    return (
                      <div
                        key={pId}
                        onClick={() => setSelectedPlatform(pId)}
                        className={`p-2.5 rounded-[8px] border transition-all cursor-pointer flex items-center justify-between ${
                          isCurrent
                            ? 'bg-white border-[#0000ee] shadow-2xs ring-1 ring-[#0000ee]'
                            : 'bg-white border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={pId} size={18} />
                          <div>
                            <div className="text-xs font-semibold text-neutral-900">
                              {pConfig.name}
                            </div>
                            <div className="text-[10px] text-neutral-500 font-mono">
                              {override?.scheduledTime || post.scheduledTime} ·{' '}
                              {override?.format || post.format}
                            </div>
                          </div>
                        </div>

                        {override?.caption && (
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-[4px]">
                            Customized
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Media Breakdown */}
              <div className="p-3 rounded-[8px] bg-white border border-neutral-200 space-y-1.5">
                <span className="text-[11px] font-semibold text-neutral-700">
                  Attached Media ({post.media.length})
                </span>
                <div className="space-y-1">
                  {post.media.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-[11px] text-neutral-600 bg-neutral-50 px-2 py-1 rounded-[6px]"
                    >
                      <span className="truncate max-w-[180px]">{item.name}</span>
                      <span className="font-mono text-neutral-400">
                        {item.duration ? `${item.duration}s VID` : `${item.type.split('/')[1]}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Publishing Simulation Actions */}
            <div className="pt-4 border-t border-neutral-200 space-y-2">
              {isPublishedNotification && (
                <div className="p-2.5 rounded-[8px] bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Successfully simulated publishing to {post.platforms.length} connected
                    channel accounts!
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePublish}
                  className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-[#0000ee] hover:bg-[#0000cc] rounded-[8px] transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Simulate Instant Publish</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Authentic Device Simulator */}
          <div className="md:col-span-7 flex flex-col items-center justify-center bg-neutral-100/60 p-4 rounded-[10px] border border-neutral-200/60">
            <DeviceSimulator
              post={post}
              activePlatform={selectedPlatform}
              onPlatformChange={(p) => setSelectedPlatform(p)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
