export type PlatformId = 'instagram' | 'facebook' | 'threads' | 'tiktok' | 'youtube';

export type MediaFormat = 'image' | 'video' | 'carousel';

export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partial'
  | 'failed';

export type PlatformPublishStatus = 'success' | 'failed' | 'skipped';

export interface PlatformPublishResult {
  status: PlatformPublishStatus;
  attemptedAt: string;
  platformPostId?: string;
  permalink?: string;
  profileUrl?: string; // account link when the platform exposes no per-post link
  containerId?: string;
  error?: string;
  via?: string; // e.g. "Instagram Login @account" or "Threads @account"
  durationMs?: number;
  deletedAt?: string;
}

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
  playbackUrl?: string; // browser-compatible stream (audio remuxed when the codec is unsupported)
  serverManaged?: boolean; // stored in the universal date-folder media dir via backend
  folderDate?: string; // YYYY-MM-DD folder the file lives in
  libraryPath?: string; // path relative to a scanned local library root
  libraryRoot?: string; // display name of the scanned library root
  libraryRootId?: string; // backend root id used to resolve the file for publishing
}

export interface LibraryRoot {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  exists: boolean;
}

export interface LibraryFolder {
  name: string;
  path: string;
}

export interface LibraryFile {
  name: string;
  path: string;
  url: string;
  playUrl?: string;
  thumbUrl?: string;
  size: number;
  type: string;
  modifiedAt: string;
}

export interface LibraryListing {
  root: { id: string; name: string; path: string };
  path: string;
  folders: LibraryFolder[];
  files: LibraryFile[];
  truncated: boolean;
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
  scheduledTime: string; // HH:mm, interpreted in the backend's local timezone
  platforms: PlatformId[];
  format: MediaFormat;
  media: MediaItem[];
  baseCaption: string;
  baseHashtags: string[];
  platformOverrides: Partial<Record<PlatformId, PlatformCustomization>>;
  platformAccounts?: Partial<Record<PlatformId, string>>; // per-post account id (e.g. Instagram Login user id)
  status: PostStatus;
  createdAt: string;
  metrics?: {
    likes: number;
    comments: number;
    shares: number;
    views?: number;
  };
  // Delivery state, owned by the backend and mirrored into this browser.
  publishAt?: string; // absolute ISO instant derived from scheduledDate + scheduledTime
  timezone?: string; // IANA zone the backend used for publishAt
  results?: Partial<Record<PlatformId, PlatformPublishResult>>;
  attempts?: number;
  nextTryAt?: string;
  lastError?: string;
  publishedAt?: string;
  deletedAt?: string; // removed from the platforms, still listed for the manager
}

export type CalendarViewMode = 'month' | 'week' | 'day';

export type StatusTab = 'all' | 'scheduled' | 'draft' | 'attention';

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
