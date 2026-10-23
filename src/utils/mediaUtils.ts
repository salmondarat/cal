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
