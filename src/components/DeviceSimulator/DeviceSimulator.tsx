import React, { useState, useRef } from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Share2,
  MoreHorizontal,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Repeat2,
  Music2,
  Sparkles,
  CheckCircle,
  Search,
} from 'lucide-react';
import { PlatformId, ScheduledPost, MediaItem } from '../../types';
import { PLATFORMS } from '../../constants/platforms';
import { PlatformIcon } from '../PlatformIcon';

interface DeviceSimulatorProps {
  post: ScheduledPost;
  activePlatform?: PlatformId;
  onPlatformChange?: (platform: PlatformId) => void;
}

export const DeviceSimulator: React.FC<DeviceSimulatorProps> = ({
  post,
  activePlatform = post.platforms[0] || 'instagram',
  onPlatformChange,
}) => {
  const [currentPlatform, setCurrentPlatform] = useState<PlatformId>(activePlatform);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(1240);
  const [isExpandedCaption, setIsExpandedCaption] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync internal platform when prop changes
  const platform = activePlatform || currentPlatform;
  const setPlatform = (p: PlatformId) => {
    setCurrentPlatform(p);
    onPlatformChange?.(p);
    setCarouselIndex(0);
  };

  const platformOverride = post.platformOverrides[platform];
  const activeCaption = platformOverride?.caption || post.baseCaption;
  const activeHashtags = platformOverride?.hashtags || post.baseHashtags;
  const activeFormat = platformOverride?.format || post.format;
  const activeTime = platformOverride?.scheduledTime || post.scheduledTime;

  const mediaList = post.media;
  const currentMedia: MediaItem | undefined = mediaList[carouselIndex] || mediaList[0];
  const isVideo = currentMedia?.type.startsWith('video/') || activeFormat === 'video';
  const isCarousel = mediaList.length > 1;

  const toggleLike = () => {
    if (isLiked) {
      setIsLiked(false);
      setLikeCount((prev) => prev - 1);
    } else {
      setIsLiked(true);
      setLikeCount((prev) => prev + 1);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const nextSlide = () => {
    setCarouselIndex((prev) => (prev + 1) % mediaList.length);
  };

  const prevSlide = () => {
    setCarouselIndex((prev) => (prev - 1 + mediaList.length) % mediaList.length);
  };

  return (
    <div className="flex flex-col items-center select-none w-full max-w-sm mx-auto">
      {/* Platform Switcher Tabs */}
      <div className="w-full mb-3 flex items-center justify-center gap-1.5 p-1 bg-neutral-100 rounded-[10px] border border-neutral-200">
        {post.platforms.map((pId) => {
          const isCurrent = platform === pId;
          const pConfig = PLATFORMS[pId];
          return (
            <button
              key={pId}
              onClick={() => setPlatform(pId)}
              className={`flex-1 py-1 px-2 rounded-[8px] text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <PlatformIcon platform={pId} size={14} />
              <span className="hidden sm:inline">{pConfig.name}</span>
            </button>
          );
        })}
      </div>

      {/* Phone Mockup Frame (iPhone 16 Pro styling) */}
      <div className="relative w-full max-w-[340px] aspect-[9/18.5] bg-neutral-900 rounded-[44px] p-3 shadow-2xl border-4 border-neutral-800 ring-1 ring-black/20 flex flex-col overflow-hidden">
        {/* Dynamic Island Screen Header */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full z-30 flex items-center justify-between px-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-neutral-800" />
          <div className="w-2 h-2 rounded-full bg-[#7c3aed]/60 animate-pulse" />
        </div>

        {/* Screen Status Bar */}
        <div className="flex items-center justify-between px-4 pt-1 pb-1 text-[11px] font-semibold text-neutral-800 z-20">
          <span className="font-mono">9:41</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px]">5G</span>
            <div className="w-4 h-2 border border-current rounded-2xs p-0.5 flex items-center">
              <div className="w-2.5 h-full bg-current rounded-3xs" />
            </div>
          </div>
        </div>

        {/* Inner Device Viewport */}
        <div className="flex-1 bg-white rounded-[34px] overflow-hidden flex flex-col relative">
          {/* ==================== 1. INSTAGRAM CHROME ==================== */}
          {platform === 'instagram' && (
            <div className="flex-1 flex flex-col bg-white overflow-y-auto scrollbar-none text-neutral-900 text-xs">
              {/* Instagram Top Bar */}
              <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between">
                <span className="font-serif italic text-base font-bold tracking-tight">
                  Instagram
                </span>
                <div className="flex items-center gap-3">
                  <Heart className="w-4 h-4" />
                  <Send className="w-4 h-4" />
                </div>
              </div>

              {/* Account Header */}
              <div className="px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-purple-600 p-0.5">
                    <div className="w-full h-full bg-white rounded-full p-0.5 flex items-center justify-center font-bold text-[10px] text-neutral-900">
                      R
                    </div>
                  </div>
                  <div className="flex flex-col leading-tight">
                    <div className="flex items-center gap-1 font-semibold text-neutral-900 text-[11px]">
                      <span>relate.sales</span>
                      <CheckCircle className="w-3 h-3 text-[#1877F2] fill-[#1877F2]" />
                    </div>
                    <span className="text-[9px] text-neutral-500">San Francisco, California</span>
                  </div>
                </div>
                <MoreHorizontal className="w-4 h-4 text-neutral-500" />
              </div>

              {/* Media Container */}
              <div className="relative w-full aspect-square bg-neutral-950 flex items-center justify-center overflow-hidden">
                {currentMedia && (
                  isVideo ? (
                    <div className="relative w-full h-full" onClick={togglePlay}>
                      <video
                        ref={videoRef}
                        src={currentMedia.url}
                        className="w-full h-full object-cover"
                        loop
                        playsInline
                        muted={isMuted}
                        autoPlay
                      />
                      {!isPlaying && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Play className="w-10 h-10 text-white fill-white" />
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMuted(!isMuted);
                        }}
                        className="absolute bottom-2.5 right-2.5 p-1 rounded-full bg-black/60 text-white"
                      >
                        {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ) : (
                    <img
                      src={currentMedia.url}
                      alt="Post visual"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )
                )}

                {/* Carousel Controls */}
                {isCarousel && (
                  <>
                    <button
                      onClick={prevSlide}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={nextSlide}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[9px] font-mono">
                      {carouselIndex + 1}/{mediaList.length}
                    </div>
                  </>
                )}
              </div>

              {/* Engagement Bar */}
              <div className="px-3 pt-2 pb-1 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={toggleLike} className="cursor-pointer">
                    <Heart
                      className={`w-5 h-5 transition-transform active:scale-125 ${
                        isLiked ? 'text-red-500 fill-red-500' : 'text-neutral-900'
                      }`}
                    />
                  </button>
                  <MessageCircle className="w-5 h-5 text-neutral-900" />
                  <Send className="w-5 h-5 text-neutral-900" />
                </div>

                {isCarousel && (
                  <div className="flex items-center gap-1">
                    {mediaList.map((_, i) => (
                      <span
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${
                          i === carouselIndex ? 'bg-[#6d28d9]' : 'bg-neutral-300'
                        }`}
                      />
                    ))}
                  </div>
                )}

                <Bookmark className="w-5 h-5 text-neutral-900" />
              </div>

              {/* Likes & Caption */}
              <div className="px-3 pb-3 space-y-1">
                <div className="font-semibold text-neutral-900 text-[11px]">
                  {likeCount.toLocaleString()} likes
                </div>
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-neutral-900 mr-1.5">relate.sales</span>
                  <span className={isExpandedCaption ? '' : 'line-clamp-2'}>
                    {activeCaption}
                  </span>
                  {activeCaption.length > 70 && (
                    <button
                      onClick={() => setIsExpandedCaption(!isExpandedCaption)}
                      className="text-neutral-400 font-medium ml-1 cursor-pointer"
                    >
                      {isExpandedCaption ? 'less' : 'more'}
                    </button>
                  )}
                </div>

                {/* Hashtags */}
                {activeHashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1 text-[10px] text-[#6d28d9]">
                    {activeHashtags.map((tag, i) => (
                      <span key={i}>{tag}</span>
                    ))}
                  </div>
                )}

                {/* First Comment if available */}
                {platformOverride?.firstComment && (
                  <div className="pt-1 text-[10px] text-neutral-600 bg-neutral-50 p-1.5 rounded-[6px]">
                    <span className="font-semibold text-neutral-800 mr-1">relate.sales</span>
                    {platformOverride.firstComment}
                  </div>
                )}

                <div className="text-[9px] text-neutral-400 uppercase pt-1">
                  Scheduled for {activeTime} · Relate Publisher
                </div>
              </div>
            </div>
          )}

          {/* ==================== 2. TIKTOK CHROME ==================== */}
          {platform === 'tiktok' && (
            <div className="flex-1 bg-black text-white relative flex flex-col justify-between overflow-hidden">
              {/* Background Video Player */}
              <div className="absolute inset-0 z-0 bg-neutral-950 flex items-center justify-center" onClick={togglePlay}>
                {currentMedia && (
                  isVideo ? (
                    <video
                      ref={videoRef}
                      src={currentMedia.url}
                      className="w-full h-full object-cover"
                      loop
                      playsInline
                      muted={isMuted}
                      autoPlay
                    />
                  ) : (
                    <img
                      src={currentMedia.url}
                      alt="TikTok"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )
                )}
                {!isPlaying && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Play className="w-12 h-12 text-white/90 fill-white/90" />
                  </div>
                )}
              </div>

              {/* Top Navigation */}
              <div className="relative z-10 flex items-center justify-center gap-4 pt-3 text-xs font-semibold text-white/80">
                <span>Following</span>
                <span className="text-white border-b-2 border-white pb-0.5">For You</span>
              </div>

              {/* Right Action Rail */}
              <div className="absolute right-2 bottom-16 z-10 flex flex-col items-center gap-3 text-center">
                {/* Profile Avatar */}
                <div className="relative mb-1">
                  <div className="w-9 h-9 rounded-full border-2 border-white bg-neutral-800 flex items-center justify-center font-bold text-xs text-white">
                    R
                  </div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#FE2C55] rounded-full flex items-center justify-center text-[10px] font-bold">
                    +
                  </div>
                </div>

                {/* Heart */}
                <button onClick={toggleLike} className="flex flex-col items-center cursor-pointer">
                  <Heart
                    className={`w-6 h-6 ${
                      isLiked ? 'text-[#FE2C55] fill-[#FE2C55]' : 'text-white'
                    }`}
                  />
                  <span className="text-[10px] font-semibold mt-0.5">
                    {(likeCount / 100).toFixed(1)}k
                  </span>
                </button>

                {/* Comments */}
                <div className="flex flex-col items-center">
                  <MessageCircle className="w-6 h-6 text-white" />
                  <span className="text-[10px] font-semibold mt-0.5">312</span>
                </div>

                {/* Bookmark */}
                <div className="flex flex-col items-center">
                  <Bookmark className="w-6 h-6 text-white" />
                  <span className="text-[10px] font-semibold mt-0.5">1.8k</span>
                </div>

                {/* Share */}
                <div className="flex flex-col items-center">
                  <Share2 className="w-6 h-6 text-white" />
                  <span className="text-[10px] font-semibold mt-0.5">Share</span>
                </div>

                {/* Rotating Vinyl Disc */}
                <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center animate-spin">
                  <div className="w-3 h-3 rounded-full bg-neutral-600" />
                </div>
              </div>

              {/* Bottom Metadata Overlay */}
              <div className="relative z-10 p-3 pr-14 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <div className="font-semibold text-xs text-white mb-1">@relatesales</div>
                <div className="text-[11px] text-white/95 line-clamp-2 leading-snug">
                  {activeCaption}
                </div>
                <div className="flex flex-wrap gap-1 text-[10px] font-medium text-white/90 mt-1">
                  {activeHashtags.map((tag, i) => (
                    <span key={i} className="font-bold">
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Music Marquee */}
                <div className="flex items-center gap-1.5 text-[10px] text-white/80 mt-1.5">
                  <Music2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {platformOverride?.soundTitle || 'Original Audio - Relate Sound Lab'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 3. YOUTUBE SHORTS / VIDEO CHROME ==================== */}
          {platform === 'youtube' && (
            <div className="flex-1 bg-neutral-900 text-white relative flex flex-col justify-between overflow-hidden">
              {/* Video Player Area */}
              <div className="absolute inset-0 z-0 bg-black flex items-center justify-center" onClick={togglePlay}>
                {currentMedia && (
                  isVideo ? (
                    <video
                      ref={videoRef}
                      src={currentMedia.url}
                      className="w-full h-full object-cover"
                      loop
                      playsInline
                      muted={isMuted}
                      autoPlay
                    />
                  ) : (
                    <img
                      src={currentMedia.url}
                      alt="YouTube"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )
                )}
                {!isPlaying && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Play className="w-12 h-12 text-white fill-white" />
                  </div>
                )}
              </div>

              {/* Top Shorts Chrome */}
              <div className="relative z-10 flex items-center justify-between p-3">
                <div className="flex items-center gap-1.5 font-bold text-xs tracking-tight">
                  <span className="w-2 h-2 rounded-full bg-red-600" />
                  <span>Shorts</span>
                </div>
                <MoreHorizontal className="w-4 h-4" />
              </div>

              {/* Right Shorts Action Column */}
              <div className="absolute right-2 bottom-12 z-10 flex flex-col items-center gap-3.5 text-center">
                <button onClick={toggleLike} className="flex flex-col items-center cursor-pointer">
                  <ThumbsUp
                    className={`w-5 h-5 ${isLiked ? 'text-red-500 fill-red-500' : 'text-white'}`}
                  />
                  <span className="text-[10px] font-semibold mt-0.5">14K</span>
                </button>
                <div className="flex flex-col items-center">
                  <ThumbsDown className="w-5 h-5 text-white" />
                  <span className="text-[10px] mt-0.5">Dislike</span>
                </div>
                <div className="flex flex-col items-center">
                  <MessageCircle className="w-5 h-5 text-white" />
                  <span className="text-[10px] mt-0.5">890</span>
                </div>
                <div className="flex flex-col items-center">
                  <Share2 className="w-5 h-5 text-white" />
                  <span className="text-[10px] mt-0.5">Share</span>
                </div>
                <div className="flex flex-col items-center">
                  <Repeat2 className="w-5 h-5 text-white" />
                  <span className="text-[10px] mt-0.5">Remix</span>
                </div>
              </div>

              {/* Bottom Channel Info & Title */}
              <div className="relative z-10 p-3 pr-14 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center text-xs font-bold">
                    R
                  </div>
                  <span className="text-xs font-semibold">@RelateCRM</span>
                  <button className="px-2 py-0.5 bg-red-600 text-white rounded-full text-[10px] font-semibold">
                    Subscribe
                  </button>
                </div>
                <div className="text-xs font-medium text-white line-clamp-2">
                  {post.title}
                </div>
                <div className="text-[10px] text-neutral-300 mt-1 line-clamp-1">
                  {activeCaption}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 4. FACEBOOK CHROME ==================== */}
          {platform === 'facebook' && (
            <div className="flex-1 bg-[#f0f2f5] text-neutral-900 text-xs overflow-y-auto scrollbar-none flex flex-col">
              {/* Header */}
              <div className="bg-white p-2.5 border-b border-neutral-200 flex items-center justify-between">
                <span className="font-bold text-base text-[#1877F2]">facebook</span>
                <div className="flex items-center gap-2 text-neutral-500">
                  <Search className="w-4 h-4" />
                  <MessageCircle className="w-4 h-4" />
                </div>
              </div>

              {/* Facebook Card Post */}
              <div className="bg-white my-2 border-y border-neutral-200">
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#1877F2] text-white font-bold flex items-center justify-center text-xs">
                      R
                    </div>
                    <div>
                      <div className="font-semibold text-neutral-900 text-xs">Relate CRM</div>
                      <div className="text-[10px] text-neutral-500">
                        {activeTime} · 🌐 Public
                      </div>
                    </div>
                  </div>
                  <MoreHorizontal className="w-4 h-4 text-neutral-500" />
                </div>

                {/* Caption */}
                <div className="px-3 pb-2 text-[11px] leading-relaxed">
                  {activeCaption}
                  {activeHashtags.length > 0 && (
                    <div className="text-[#1877F2] mt-1">
                      {activeHashtags.join(' ')}
                    </div>
                  )}
                </div>

                {/* Media */}
                <div className="relative w-full aspect-[4/3] bg-neutral-900 flex items-center justify-center overflow-hidden">
                  {currentMedia && (
                    isVideo ? (
                      <video
                        src={currentMedia.url}
                        className="w-full h-full object-cover"
                        controls
                      />
                    ) : (
                      <img
                        src={currentMedia.url}
                        alt="FB Post"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    )
                  )}
                </div>

                {/* Reactions Counter */}
                <div className="px-3 py-1.5 border-b border-neutral-100 flex items-center justify-between text-[10px] text-neutral-500">
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-[#1877F2] text-white flex items-center justify-center text-[8px]">
                      👍
                    </div>
                    <span>{likeCount}</span>
                  </div>
                  <div>42 comments · 12 shares</div>
                </div>

                {/* Action Row */}
                <div className="px-2 py-1 flex items-center justify-around text-neutral-600 font-semibold text-[11px]">
                  <button onClick={toggleLike} className="flex items-center gap-1.5 py-1">
                    <ThumbsUp className={`w-4 h-4 ${isLiked ? 'text-[#1877F2]' : ''}`} />
                    <span>Like</span>
                  </button>
                  <div className="flex items-center gap-1.5 py-1">
                    <MessageCircle className="w-4 h-4" />
                    <span>Comment</span>
                  </div>
                  <div className="flex items-center gap-1.5 py-1">
                    <Share2 className="w-4 h-4" />
                    <span>Share</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 5. THREADS CHROME ==================== */}
          {platform === 'threads' && (
            <div className="flex-1 bg-white text-neutral-900 text-xs overflow-y-auto scrollbar-none flex flex-col p-3">
              {/* Header */}
              <div className="flex items-center justify-center pb-3 border-b border-neutral-100">
                <PlatformIcon platform="threads" size={20} />
              </div>

              {/* Thread Item */}
              <div className="flex items-start gap-3 pt-3">
                {/* Left Avatar + Thread Line */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-black text-white font-bold flex items-center justify-center text-xs">
                    R
                  </div>
                  <div className="w-0.5 flex-1 bg-neutral-200 my-1 min-h-[40px]" />
                </div>

                {/* Content */}
                <div className="flex-1 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 font-semibold text-neutral-900 text-xs">
                      <span>relatesales</span>
                      <CheckCircle className="w-3 h-3 text-[#6d28d9]" />
                      <span className="text-neutral-400 font-normal text-[11px]">· {activeTime}</span>
                    </div>
                    <MoreHorizontal className="w-4 h-4 text-neutral-400" />
                  </div>

                  <div className="text-[11px] leading-relaxed mt-1 text-neutral-800">
                    {activeCaption}
                  </div>

                  {activeHashtags.length > 0 && (
                    <div className="text-[11px] text-[#6d28d9] mt-1 font-medium">
                      {activeHashtags.join(' ')}
                    </div>
                  )}

                  {/* Media */}
                  {currentMedia && (
                    <div className="mt-2 rounded-[12px] overflow-hidden border border-neutral-200 bg-neutral-100 max-h-52">
                      {isVideo ? (
                        <video src={currentMedia.url} className="w-full object-cover" controls />
                      ) : (
                        <img
                          src={currentMedia.url}
                          alt="Threads"
                          referrerPolicy="no-referrer"
                          className="w-full object-cover"
                        />
                      )}
                    </div>
                  )}

                  {/* Action Icons */}
                  <div className="flex items-center gap-4 mt-2.5 text-neutral-700">
                    <button onClick={toggleLike}>
                      <Heart
                        className={`w-4 h-4 ${isLiked ? 'text-red-500 fill-red-500' : ''}`}
                      />
                    </button>
                    <MessageCircle className="w-4 h-4" />
                    <Repeat2 className="w-4 h-4" />
                    <Send className="w-4 h-4" />
                  </div>

                  <div className="text-[10px] text-neutral-400 mt-2">
                    {likeCount} likes · 89 replies
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Home Indicator bar */}
          <div className="w-24 h-1 bg-neutral-400/80 rounded-full mx-auto my-1.5 shrink-0 z-20" />
        </div>
      </div>
    </div>
  );
};
