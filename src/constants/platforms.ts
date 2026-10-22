import { PlatformConfig, PlatformId } from '../types';

export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    brandColor: '#E1306C',
    accentBg: 'rgba(225, 48, 108, 0.08)',
    ringColor: '#E1306C',
    textColor: '#C13584',
    badgeBorder: 'rgba(225, 48, 108, 0.25)',
    charLimit: 2200,
    hashtagLimit: 30,
    supportedFormats: [
      { format: 'image', label: 'Feed Post', description: 'Square or 4:5 portrait photo', aspectRatio: '1:1' },
      { format: 'carousel', label: 'Carousel (1-10)', description: 'Multi-slide swipeable photos/videos', aspectRatio: '1:1' },
      { format: 'video', label: 'Reel (9:16)', description: 'Full-screen vertical video up to 90s', aspectRatio: '9:16' },
    ],
    peakTimes: ['09:00', '12:30', '19:00'],
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    brandColor: '#1877F2',
    accentBg: 'rgba(24, 119, 242, 0.08)',
    ringColor: '#1877F2',
    textColor: '#1877F2',
    badgeBorder: 'rgba(24, 119, 242, 0.25)',
    charLimit: 63206,
    hashtagLimit: 15,
    supportedFormats: [
      { format: 'image', label: 'Feed Photo', description: 'Standard desktop & mobile post', aspectRatio: '1.91:1' },
      { format: 'carousel', label: 'Carousel Album', description: 'Multi-photo story grid', aspectRatio: '1:1' },
      { format: 'video', label: 'Video Post', description: 'Landscape or vertical video', aspectRatio: '16:9' },
    ],
    peakTimes: ['08:30', '13:00', '17:30'],
  },
  threads: {
    id: 'threads',
    name: 'Threads',
    brandColor: '#000000',
    accentBg: 'rgba(0, 0, 0, 0.06)',
    ringColor: '#000000',
    textColor: '#111111',
    badgeBorder: 'rgba(0, 0, 0, 0.22)',
    charLimit: 500,
    hashtagLimit: 5,
    supportedFormats: [
      { format: 'image', label: 'Photo Thread', description: 'Single high-res image with discussion', aspectRatio: '4:5' },
      { format: 'carousel', label: 'Carousel Thread', description: 'Swipeable sequence of up to 10 images', aspectRatio: '4:5' },
      { format: 'video', label: 'Video Thread', description: 'Clips up to 5 minutes duration', aspectRatio: '16:9' },
    ],
    peakTimes: ['07:00', '11:45', '21:00'],
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    brandColor: '#000000',
    accentBg: 'rgba(254, 44, 85, 0.08)',
    ringColor: '#FE2C55',
    textColor: '#FE2C55',
    badgeBorder: 'rgba(254, 44, 85, 0.25)',
    charLimit: 4000,
    hashtagLimit: 10,
    supportedFormats: [
      { format: 'video', label: 'TikTok Video (9:16)', description: 'Immersive full-screen vertical video', aspectRatio: '9:16' },
      { format: 'carousel', label: 'Photo Swipe Mode', description: 'Swipeable photo cards with background sound', aspectRatio: '9:16' },
      { format: 'image', label: 'Single Snapshot', description: 'Still portrait photo with trending music', aspectRatio: '9:16' },
    ],
    peakTimes: ['12:00', '16:30', '20:00'],
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    brandColor: '#FF0000',
    accentBg: 'rgba(255, 0, 0, 0.08)',
    ringColor: '#FF0000',
    textColor: '#CC0000',
    badgeBorder: 'rgba(255, 0, 0, 0.25)',
    charLimit: 5000,
    hashtagLimit: 15,
    supportedFormats: [
      { format: 'video', label: 'YouTube Shorts (9:16)', description: 'Vertical short-form video under 60s', aspectRatio: '9:16' },
      { format: 'video', label: 'Standard Video (16:9)', description: 'Long-form landscape 4K/HD video', aspectRatio: '16:9' },
      { format: 'image', label: 'Community Post', description: 'Channel community tab update', aspectRatio: '1:1' },
    ],
    peakTimes: ['15:00', '18:00', '20:30'],
  },
};

export const ALL_PLATFORM_IDS: PlatformId[] = [
  'instagram',
  'facebook',
  'threads',
  'tiktok',
  'youtube',
];

export const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1 Gigabyte
