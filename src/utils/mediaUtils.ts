import { MAX_FILE_SIZE } from '../constants/platforms';
import { MediaItem } from '../types';

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function validateFileSize(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds the maximum 1 GB limit (${formatBytes(file.size)}).`,
    };
  }
  return { valid: true };
}

export function detectMediaType(file: File): 'image' | 'video' | 'unknown' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'unknown';
}

export async function processFileToMediaItem(file: File): Promise<MediaItem> {
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith('video/');

  const item: MediaItem = {
    id: `media-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: file.name,
    url,
    size: file.size,
    type: file.type,
    fileRef: file,
  };

  if (isVideo) {
    try {
      const { duration, width, height } = await getVideoMetadata(url);
      item.duration = duration;
      item.width = width;
      item.height = height;
    } catch {
      // fallback if video metadata couldn't be parsed
      item.duration = 15;
    }
  } else {
    try {
      const { width, height } = await getImageDimensions(url);
      item.width = width;
      item.height = height;
    } catch {
      // fallback
    }
  }

  return item;
}

function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

function getVideoMetadata(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        duration: Math.round(video.duration),
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    video.onerror = reject;
    video.src = url;
  });
}

// Built-in presets for instant testing of images, 4K style reels, and carousel albums
export const SAMPLE_MEDIA_LIBRARY: {
  category: string;
  items: MediaItem[];
}[] = [
  {
    category: 'SaaS Product & Workspace (Images)',
    items: [
      {
        id: 'sample-img-1',
        name: 'relate-dashboard-dark-analytics.png',
        url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80',
        size: 3840000, // 3.8 MB
        type: 'image/jpeg',
        width: 1200,
        height: 800,
      },
      {
        id: 'sample-img-2',
        name: 'modern-creator-studio-desk.png',
        url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
        size: 5120000, // 5.1 MB
        type: 'image/jpeg',
        width: 1200,
        height: 800,
      },
      {
        id: 'sample-img-3',
        name: 'design-system-typography-preview.png',
        url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1200&q=80',
        size: 4200000,
        type: 'image/jpeg',
        width: 1200,
        height: 800,
      },
    ],
  },
  {
    category: 'High-Res Vertical Reels & Shorts (Videos)',
    items: [
      {
        id: 'sample-video-1',
        name: 'cinematic_motion_reel_4k.mp4',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        size: 15400000, // 15.4 MB
        type: 'video/mp4',
        duration: 15,
        width: 1080,
        height: 1920,
      },
      {
        id: 'sample-video-2',
        name: 'product_walkthrough_1080p.mp4',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
        size: 28900000, // 28.9 MB
        type: 'video/mp4',
        duration: 22,
        width: 1920,
        height: 1080,
      },
    ],
  },
  {
    category: 'Multi-Slide Carousel Set (Carousels)',
    items: [
      {
        id: 'sample-car-1',
        name: 'carousel-slide-1-hook.png',
        url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1080&q=80',
        size: 2900000,
        type: 'image/jpeg',
        width: 1080,
        height: 1080,
      },
      {
        id: 'sample-car-2',
        name: 'carousel-slide-2-breakdown.png',
        url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1080&q=80',
        size: 3100000,
        type: 'image/jpeg',
        width: 1080,
        height: 1080,
      },
      {
        id: 'sample-car-3',
        name: 'carousel-slide-3-action.png',
        url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1080&q=80',
        size: 2750000,
        type: 'image/jpeg',
        width: 1080,
        height: 1080,
      },
    ],
  },
];
