import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  Plus,
  Play,
  Film,
  Image as ImageIcon,
  HardDrive,
  Clock,
  Maximize2,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { MediaItem } from '../../types';
import { formatBytes } from '../../utils/mediaUtils';
import { getVideoThumbnail } from '../../utils/videoThumbnail';

interface MediaPreviewModalProps {
  items: MediaItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onSchedule?: (item: MediaItem) => void;
  onDelete?: (item: MediaItem) => void;
}

const formatDuration = (seconds?: number) => {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const formatDateTime = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const typeLabel = (mime: string) => {
  const [, sub] = mime.split('/');
  return (sub || mime).split('+')[0].toUpperCase();
};

// Older listings may predate playUrl, so derive the converted-stream route from the file URL.
function streamSourceFor(item?: MediaItem): string | undefined {
  if (!item) return undefined;
  if (item.playbackUrl) return item.playbackUrl;
  if (item.url.startsWith('/api/library/file?')) return item.url.replace('/api/library/file?', '/api/library/stream?');
  if (item.url.startsWith('/api/storage/media/file?')) return item.url.replace('/api/storage/media/file?', '/api/storage/stream?');
  return undefined;
}

function hasNoDecodedAudio(el: HTMLVideoElement): boolean {
  const probe = el as HTMLVideoElement & { webkitAudioDecodedByteCount?: number; mozHasAudio?: boolean };
  if (typeof probe.mozHasAudio === 'boolean') return !probe.mozHasAudio;
  if (typeof probe.webkitAudioDecodedByteCount === 'number') return probe.webkitAudioDecodedByteCount === 0;
  return false;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
  items,
  index,
  onIndexChange,
  onClose,
  onSchedule,
  onDelete,
}) => {
  const item = items[index];
  const isVideo = Boolean(item?.type.startsWith('video/'));
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [poster, setPoster] = useState<string | null>(null);
  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const [videoStatus, setVideoStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [useRawSource, setUseRawSource] = useState(false);
  const [forceAudioFix, setForceAudioFix] = useState(false);
  const [noAudioTrack, setNoAudioTrack] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [streamPercent, setStreamPercent] = useState<number | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [serverHasAudio, setServerHasAudio] = useState<boolean | null>(null);
  const resumeAtRef = useRef<number | null>(null);
  const streamRetriesRef = useRef(0);
  const streamUrl = streamSourceFor(item);
  const activeStreamUrl = streamUrl && forceAudioFix
    ? `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}force=1`
    : streamUrl;
  const videoSource = useRawSource || !activeStreamUrl ? item?.url : activeStreamUrl;

  useEffect(() => {
    setDimensions(item?.width && item?.height ? { width: item.width, height: item.height } : null);
    setDuration(item?.duration);
    setPoster(item?.thumbnailUrl ?? null);
    setVideoStatus('loading');
    setUseRawSource(false);
    setForceAudioFix(false);
    setNoAudioTrack(false);
    resumeAtRef.current = null;
    streamRetriesRef.current = 0;
    setServerHasAudio(null);
    if (item && isVideo && !item.thumbnailUrl) {
      let alive = true;
      getVideoThumbnail(item.url).then((result) => {
        if (alive && result) setPoster(result.dataUrl);
      });
      return () => {
        alive = false;
      };
    }
  }, [item?.id, item?.url, item?.thumbnailUrl, item?.width, item?.height, item?.duration, isVideo]);

  // Wait for the background conversion before pointing the player at the stream,
  // otherwise the browser gets a 202 and reports the clip as unplayable.
  useEffect(() => {
    setStreamReady(false);
    setStreamPercent(null);
    setStreamError(null);
    if (!isVideo || !activeStreamUrl || useRawSource) {
      setStreamReady(true);
      return;
    }
    let alive = true;
    let fetchFailures = 0;
    const statusUrl = activeStreamUrl.replace('/stream?', '/stream/status?');

    const poll = async () => {
      try {
        const res = await fetch(statusUrl);
        const data = await res.json();
        if (!alive) return;
        fetchFailures = 0;
        if (typeof data.hasAudio === 'boolean') setServerHasAudio(data.hasAudio);
        if (data.status === 'converting') {
          setStreamPercent(typeof data.percent === 'number' ? data.percent : null);
          setTimeout(poll, 1200);
        } else if (data.status === 'failed') {
          setStreamError(data.error || 'The clip could not be converted for playback.');
        } else {
          setStreamReady(true);
        }
      } catch {
        // Network hiccup (proxy/tunnel restart): keep polling instead of attaching
        // a stream that is not ready yet.
        if (!alive) return;
        fetchFailures++;
        if (fetchFailures >= 10) setStreamReady(true);
        else setTimeout(poll, 1500);
      }
    };
    poll();

    return () => {
      alive = false;
    };
  }, [isVideo, activeStreamUrl, useRawSource, item?.id, videoReloadKey]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        onIndexChange(index - 1);
      } else if (event.key === 'ArrowRight' && index < items.length - 1) {
        onIndexChange(index + 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!item) return null;

  const location = item.libraryRoot
    ? `${item.libraryRoot}/${item.libraryPath ?? ''}`
    : item.folderDate
      ? `media/${item.folderDate}`
      : item.serverManaged
        ? 'Media storage'
        : 'Browser storage';

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex flex-col animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${item.name}`}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full h-dvh max-h-dvh overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-white/10 text-white bg-black/40">
          <div className="min-w-0 flex items-center gap-2">
            <div className="w-7 h-7 rounded-[8px] bg-white/10 flex items-center justify-center shrink-0">
              {isVideo ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate" title={item.name}>
                {item.name}
              </h3>
              <p className="text-[11px] text-white/50 font-mono">
                {index + 1} / {items.length} · {typeLabel(item.type)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-[6px] transition-colors"
              title="Open the original file in a new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open original</span>
            </a>
            <button
              onClick={onClose}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-[6px] transition-colors"
              title="Close preview (Esc)"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stage */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          {index > 0 && (
            <button
              onClick={() => onIndexChange(index - 1)}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              title="Previous (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div className="absolute inset-0 flex items-center justify-center px-14 sm:px-16 py-3">
            {isVideo && !streamReady && !streamError ? (
              <div className="text-center text-white/85">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
                <p className="text-sm font-semibold">
                  Converting for playback{streamPercent != null ? ` · ${streamPercent}%` : '...'}
                </p>
                <p className="text-[11px] text-white/45 mt-1">
                  This clip needs a browser-friendly copy. It only happens once per file.
                </p>
              </div>
            ) : isVideo ? (
              <video
                key={`${item.id}-${videoReloadKey}-${useRawSource ? 'raw' : forceAudioFix ? 'forced' : 'stream'}`}
                src={videoSource}
                poster={poster ?? undefined}
                controls
                playsInline
                preload="auto"
                className="h-full w-full object-contain rounded-[8px] bg-black shadow-2xl"
                onLoadedMetadata={(event) => {
                  const el = event.currentTarget;
                  setDuration(Number.isFinite(el.duration) ? el.duration : duration);
                  setDimensions({ width: el.videoWidth, height: el.videoHeight });
                  if (resumeAtRef.current != null) {
                    const resumeAt = resumeAtRef.current;
                    resumeAtRef.current = null;
                    el.currentTime = Math.min(resumeAt, Math.max(0, (el.duration || resumeAt) - 0.1));
                    void el.play().catch(() => {});
                  }
                }}
                onTimeUpdate={(event) => {
                  const el = event.currentTarget;
                  if (el.currentTime < 1.2 || useRawSource || !streamUrl) return;
                  if (!hasNoDecodedAudio(el)) {
                    setNoAudioTrack(false);
                    return;
                  }
                  if (!forceAudioFix) {
                    // The browser refused to decode this audio track: ask for a normalised copy.
                    resumeAtRef.current = el.currentTime;
                    el.pause();
                    setForceAudioFix(true);
                  } else {
                    setNoAudioTrack(true);
                  }
                }}
                onCanPlay={() => setVideoStatus('ready')}
                onPlaying={() => setVideoStatus('ready')}
                onWaiting={() => setVideoStatus('loading')}
                onError={() => {
                  if (!useRawSource && streamUrl && streamRetriesRef.current < 2) {
                    // The stream may have been replaced mid-flight (backend restart):
                    // re-check the conversion status instead of falling back to the
                    // raw file, which Chrome often cannot fully decode.
                    streamRetriesRef.current += 1;
                    setVideoStatus('loading');
                    setVideoReloadKey((n) => n + 1);
                  } else if (!useRawSource && streamUrl) {
                    setUseRawSource(true);
                    setVideoStatus('loading');
                  } else {
                    setVideoStatus('error');
                  }
                }}
              />
            ) : (
              <img
                src={item.url}
                alt={item.name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
                onLoad={(event) => {
                  const el = event.currentTarget;
                  if (el.naturalWidth && el.naturalHeight) {
                    setDimensions({ width: el.naturalWidth, height: el.naturalHeight });
                  }
              }}
            />
          )}
          </div>

          {isVideo && streamReady && videoStatus === 'loading' && (
            <div className="absolute inset-0 flex items-end justify-center pb-16 pointer-events-none">
              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/70 text-white text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                {videoSource === item.url ? 'Loading video...' : 'Loading converted stream...'}
              </div>
            </div>
          )}

          {isVideo && (videoStatus === 'error' || Boolean(streamError)) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-sm text-center px-4 py-4 rounded-[10px] bg-black/75 border border-white/15 text-white">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-amber-400" />
                <p className="text-sm font-semibold">This video could not be played</p>
                <p className="text-[11px] text-white/60 mt-1">
                  {streamError || 'The file may still be loading or the backend restarted. Retry, or open the original file.'}
                </p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <button
                    onClick={() => {
                      setVideoStatus('loading');
                      setStreamError(null);
                      setUseRawSource(false);
                      setVideoReloadKey((n) => n + 1);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#020520] bg-white hover:bg-white/90 rounded-[6px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white/90 bg-white/10 hover:bg-white/20 rounded-[6px]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open
                  </a>
                </div>
              </div>
            </div>
          )}

          {index < items.length - 1 && (
            <button
              onClick={() => onIndexChange(index + 1)}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              title="Next (→)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Metadata + actions */}
        <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-white/10 text-white flex flex-col sm:flex-row sm:items-center gap-3 bg-black/40">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-white/70 font-mono flex-1 min-w-0">
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="w-3 h-3" />
              {dimensions ? `${dimensions.width} × ${dimensions.height}` : '—'}
            </span>
            {isVideo && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(duration) ?? '—'}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {formatBytes(item.size)}
            </span>
            <span className="truncate" title={location}>
              {location}
            </span>
            {formatDateTime(item.uploadedAt) && <span>{formatDateTime(item.uploadedAt)}</span>}
            {(noAudioTrack || serverHasAudio === false) && (
              <span className="inline-flex items-center gap-1 text-amber-300" title="No decodable audio track was found in this file.">
                <AlertCircle className="w-3 h-3" />
                no audio track
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <button
                onClick={() => onDelete(item)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:text-white bg-red-500/15 hover:bg-red-600 rounded-[6px] transition-colors"
                title="Delete from storage"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
            {onSchedule && (
              <button
                onClick={() => onSchedule(item)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#020520] bg-white hover:bg-white/90 rounded-[6px] transition-colors"
              >
                {isVideo ? <Play className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                Schedule Post
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
