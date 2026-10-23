export interface VideoThumbnail {
  dataUrl: string;
  duration: number;
  width: number;
  height: number;
}

const cache = new Map<string, VideoThumbnail | null>();
const inFlight = new Map<string, Promise<VideoThumbnail | null>>();
const MAX_CONCURRENT = 3;
let active = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
}

function releaseSlot() {
  active--;
  waiting.shift()?.();
}

function generate(url: string): Promise<VideoThumbnail | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (value: VideoThumbnail | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onseeked = null;
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      try {
        video.load();
      } catch {}
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), 15000);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      // A frame a bit into the clip avoids the black lead-in most videos have.
      const target = duration > 0 ? Math.min(Math.max(duration * 0.1, 0.1), 2) : 0.1;

      video.onseeked = () => {
        try {
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) return finish(null);

          const scale = Math.min(1, 640 / Math.max(width, height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return finish(null);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish({
            dataUrl: canvas.toDataURL('image/jpeg', 0.82),
            duration,
            width,
            height,
          });
        } catch {
          // Cross-origin video without CORS headers taints the canvas.
          finish(null);
        }
      };

      try {
        video.currentTime = target;
      } catch {
        finish(null);
      }
    };

    video.onerror = () => finish(null);
    video.src = url;
  });
}

export function getVideoThumbnail(url: string): Promise<VideoThumbnail | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const pending = inFlight.get(url);
  if (pending) return pending;

  const promise = acquireSlot()
    .then(() => generate(url))
    .then((result) => {
      cache.set(url, result);
      return result;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(url);
      releaseSlot();
    });

  inFlight.set(url, promise);
  return promise;
}
