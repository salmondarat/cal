export type PlatformId = 'instagram' | 'facebook' | 'threads' | 'tiktok' | 'youtube';

export type MediaFormat = 'image' | 'video' | 'carousel';

export type PostStatus = 'draft' | 'scheduled' | 'published';

export interface MediaItem {
  id: string;
  name: string;
  url: string; // Object URL or Base64 / Remote URL
  size: number; // in bytes (up to 1,073,741,824 bytes = 1GB)
  type: string; // e.g., 'image/jpeg', 'video/mp4', 'image/png'
  width?: number;
  height?: number;
  duration?: number; // duration in seconds (for video)
  fileRef?: File;
  uploadedAt?: string;
  thumbnailUrl?: string;
  serverManaged?: boolean; // stored in the universal date-folder media dir via backend
  folderDate?: string; // YYYY-MM-DD folder the file lives in
}

export interface PlatformCustomization {
  caption: string;
  hashtags: string[];
  scheduledTime: string; // HH:mm
  format: MediaFormat;
  firstComment?: string;
  soundTitle?: string;
  collaborator?: string;
  videoThumbnailUrl?: string;
}

export interface ScheduledPost {
  id: string;
  title: string;
  campaignName?: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm
  platforms: PlatformId[];
  format: MediaFormat;
  media: MediaItem[];
  baseCaption: string;
  baseHashtags: string[];
  platformOverrides: Partial<Record<PlatformId, PlatformCustomization>>;
  status: PostStatus;
  createdAt: string;
  metrics?: {
    likes: number;
    comments: number;
    shares: number;
    views?: number;
  };
}

export type CalendarViewMode = 'month' | 'week' | 'day';

export interface PlatformConfig {
  id: PlatformId;
  name: string;
  brandColor: string;
  accentBg: string;
  ringColor: string;
  textColor: string;
  badgeBorder: string;
  charLimit: number;
  hashtagLimit: number;
  supportedFormats: {
    format: MediaFormat;
    label: string;
    description: string;
    aspectRatio: string;
  }[];
  peakTimes: string[];
}

export interface PlatformApiCredentials {
  platformId: PlatformId;
  isConnected: boolean;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accountId?: string;
  webhookSecret?: string;
  environment: 'sandbox' | 'production';
  lastTested?: string;
  permissions: string[];
}

export interface BulkCampaignSeriesConfig {
  campaignName: string;
  platforms: PlatformId[];
  startDate: string;
  baseTime: string;
  cadence: 'daily' | 'every-2-days' | 'mon-wed-fri' | 'weekly';
  hashtagTemplate: string[];
  baseCaptionTemplate: string;
}
