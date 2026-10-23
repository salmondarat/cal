import React, { useEffect, useRef, useState } from 'react';
import { Film, Image as ImageIcon, Loader2 } from 'lucide-react';
import { MediaItem } from '../../types';
import { getVideoThumbnail } from '../../utils/videoThumbnail';

interface MediaThumbProps {
  item: MediaItem;
  className?: string;
  /** Skip lazy observation (used by the large preview). */
  eager?: boolean;
}

export const MediaThumb: React.FC<MediaThumbProps> = ({ item, className = 'w-full h-full object-cover', eager = false }) => {
  const isVideo = item.type.startsWith('video/');
  const [thumb, setThumb] = useState<string | null>(item.thumbnailUrl ?? null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [imageFailed, setImageFailed] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setThumb(item.thumbnailUrl ?? null);
    setStatus('idle');
    setImageFailed(false);
    setUseOriginal(false);
  }, [item.url, item.thumbnailUrl]);

  useEffect(() => {
    if (!isVideo || thumb || status !== 'idle') return;
    const node = containerRef.current;
    if (!node) return;

    let cancelled = false;
    const start = () => {
      setStatus('loading');
      getVideoThumbnail(item.url).then((result) => {
        if (cancelled) return;
        if (result) {
          setThumb(result.dataUrl);
          setStatus('idle');
        } else {
          setStatus('failed');
        }
      });
    };

    if (eager || typeof IntersectionObserver === 'undefined' || document.visibilityState === 'hidden') {
      start();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, thumb, item.url, eager]);

  if (isVideo) {
    if (thumb) {
      return (
        <div ref={containerRef} className="w-full h-full">
          <img
            src={thumb}
            alt={item.name}
            className={className}
            draggable={false}
            onError={() => {
              // Server poster unavailable: fall back to decoding a frame in the browser.
              if (item.thumbnailUrl) {
                setThumb(null);
                setStatus('idle');
              }
            }}
          />
        </div>
      );
    }
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-400">
        {status === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Film className="w-6 h-6" />}
      </div>
    );
  }

  if (imageFailed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-100 text-neutral-400">
        <ImageIcon className="w-6 h-6" />
      </div>
    );
  }

  return (
    <img
      src={useOriginal ? item.url : item.thumbnailUrl || item.url}
      alt={item.name}
      loading="lazy"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useOriginal && item.thumbnailUrl) {
          setUseOriginal(true);
        } else {
          setImageFailed(true);
        }
      }}
      className={className}
    />
  );
};
