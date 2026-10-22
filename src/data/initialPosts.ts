import { ScheduledPost } from '../types';

export const INITIAL_POSTS: ScheduledPost[] = [
  {
    id: 'post-1',
    title: 'Relate CRM 3.0 Platform Launch Announcement',
    scheduledDate: '2026-10-21',
    scheduledTime: '10:30',
    platforms: ['instagram', 'tiktok', 'youtube'],
    format: 'video',
    media: [
      {
        id: 'media-p1-v1',
        name: 'relate_v3_feature_launch_teaser_4k.mp4',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        size: 45600000, // 45.6 MB
        type: 'video/mp4',
        duration: 15,
        width: 1080,
        height: 1920,
      },
    ],
    baseCaption:
      'Excited to unveil Relate CRM 3.0 today! 🚀 Built ground-up for modern B2B revenue teams with real-time pipeline collaboration and zero manual logging.',
    baseHashtags: ['#B2BSaaS', '#ProductLaunch', '#TechInnovation', '#SalesPipeline'],
    platformOverrides: {
      instagram: {
        caption:
          'Excited to unveil Relate CRM 3.0! 🚀 Seamless collaborative sales workspace for fast-moving teams. Tap the link in bio for early access.',
        hashtags: ['#B2BSaaS', '#ProductLaunch', '#TechInnovation', '#ModernSales', '#CRMDesign'],
        scheduledTime: '10:30',
        format: 'video',
        firstComment: 'Drop your team size below to unlock VIP onboarding perks! 👇',
        soundTitle: 'Original Audio - Relate Sound Lab',
      },
      tiktok: {
        caption:
          'When your CRM actually feels like a modern app instead of 2004 spreadsheet software 👀 Wait till the end for the AI pipeline feature #B2B #startuplife #sales',
        hashtags: ['#B2B', '#startuplife', '#tech', '#saleshacks', '#foryou'],
        scheduledTime: '11:00',
        format: 'video',
        soundTitle: 'trending tech beat - Relate Sound',
      },
      youtube: {
        caption:
          'Relate 3.0 Official Launch Teaser. Discover the collaborative sales CRM designed to replace rigid legacy systems.',
        hashtags: ['#Shorts', '#SaaS', '#CRM', '#Productivity'],
        scheduledTime: '11:15',
        format: 'video',
      },
    },
    status: 'scheduled',
    createdAt: '2026-10-20T14:00:00Z',
    metrics: {
      likes: 1420,
      comments: 89,
      shares: 312,
      views: 18400,
    },
  },
  {
    id: 'post-2',
    title: '5 Golden Rules for High-Velocity B2B Pipeline (Carousel)',
    scheduledDate: '2026-10-22',
    scheduledTime: '14:00',
    platforms: ['instagram', 'facebook', 'threads'],
    format: 'carousel',
    media: [
      {
        id: 'media-p2-c1',
        name: 'carousel-slide-1-hook.png',
        url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1080&q=80',
        size: 4200000,
        type: 'image/jpeg',
        width: 1080,
        height: 1080,
      },
      {
        id: 'media-p2-c2',
        name: 'carousel-slide-2-breakdown.png',
        url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1080&q=80',
        size: 3800000,
        type: 'image/jpeg',
        width: 1080,
        height: 1080,
      },
      {
        id: 'media-p2-c3',
        name: 'carousel-slide-3-action.png',
        url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1080&q=80',
        size: 3400000,
        type: 'image/jpeg',
        width: 1080,
        height: 1080,
      },
    ],
    baseCaption:
      'Swipe through for the 5 fundamental shifts that top-performing enterprise sales leaders make to double pipeline velocity in Q4.',
    baseHashtags: ['#SalesStrategy', '#B2BGrowth', '#Leadership', '#SaaSMetrics'],
    platformOverrides: {
      instagram: {
        caption:
          'Swipe left for the 5 fundamental shifts that top-performing sales leaders use to double velocity in Q4 ⏩ Bookmark this post for your next pipeline review.',
        hashtags: ['#SalesStrategy', '#B2BGrowth', '#Leadership', '#RevenueOps', '#SaaSCarousel'],
        scheduledTime: '14:00',
        format: 'carousel',
      },
      facebook: {
        caption:
          'How do high-growth teams keep deals moving without micromanaging reps? Here is our 5-part framework for transparent pipeline management. Read through the deck slides below.',
        hashtags: ['#SalesLeadership', '#BusinessOperations', '#B2B'],
        scheduledTime: '13:30',
        format: 'carousel',
      },
      threads: {
        caption:
          '5 pipeline rules we learned after analyzing 12,000 enterprise B2B sales cycles. Swipe through the infographics in the thread 🧵',
        hashtags: ['#sales', '#startups', '#ops'],
        scheduledTime: '14:15',
        format: 'carousel',
      },
    },
    status: 'scheduled',
    createdAt: '2026-10-20T16:20:00Z',
    metrics: {
      likes: 680,
      comments: 42,
      shares: 118,
    },
  },
  {
    id: 'post-3',
    title: 'Customer Spotlight: How FinEdge Unified 120 Sales Reps',
    scheduledDate: '2026-10-23',
    scheduledTime: '09:00',
    platforms: ['facebook', 'youtube', 'threads'],
    format: 'video',
    media: [
      {
        id: 'media-p3-v1',
        name: 'finedge_customer_story_cut.mp4',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
        size: 32000000,
        type: 'video/mp4',
        duration: 22,
        width: 1920,
        height: 1080,
      },
    ],
    baseCaption:
      'Case study: FinEdge scaled from 30 to 120 reps while reducing CRM admin time by 48%. Watch their Head of Revenue Ops explain the setup.',
    baseHashtags: ['#CaseStudy', '#CustomerSuccess', '#RevOps', '#Fintech'],
    platformOverrides: {
      youtube: {
        caption:
          'Case Study: How FinEdge Scaled Revenue Ops & Reduced CRM Overhead by 48% with Relate',
        hashtags: ['#CaseStudy', '#EnterpriseSales', '#RevOps', '#FintechSaaS'],
        scheduledTime: '09:00',
        format: 'video',
      },
      facebook: {
        caption:
          'Hear directly from FinEdge’s VP of Revenue Operations on how unified deal collaboration transformed their weekly forecasts.',
        hashtags: ['#CaseStudy', '#SalesExcellence', '#Enterprise'],
        scheduledTime: '09:30',
        format: 'video',
      },
      threads: {
        caption:
          '"Before Relate, reps spent 1.5 hours daily updating stale deal fields. Now it happens collaboratively in minutes." Quick breakdown of FinEdge\'s turnaround 📊',
        hashtags: ['#revops', '#b2b'],
        scheduledTime: '09:00',
        format: 'video',
      },
    },
    status: 'scheduled',
    createdAt: '2026-10-19T10:00:00Z',
  },
  {
    id: 'post-4',
    title: 'Minimalist Sales Architecture: The Philosophy Behind Relate',
    scheduledDate: '2026-10-25',
    scheduledTime: '17:00',
    platforms: ['threads', 'instagram'],
    format: 'image',
    media: [
      {
        id: 'media-p4-i1',
        name: 'relate_design_philosophy_editorial.png',
        url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=1200&q=80',
        size: 5400000,
        type: 'image/jpeg',
        width: 1200,
        height: 800,
      },
    ],
    baseCaption:
      'Why does most B2B enterprise software feel like filing tax forms? We designed Relate to be calm, deliberate, and lightning fast.',
    baseHashtags: ['#DesignSystems', '#B2BDesign', '#ProductDesign', '#Philosophy'],
    platformOverrides: {
      threads: {
        caption:
          'Why does most B2B software feel like filing tax forms? Enterprise tools deserve the same calm typographic discipline and zero-clutter elegance as your favorite consumer apps. Agree or disagree?',
        hashtags: ['#productdesign', '#minimalism', '#tech'],
        scheduledTime: '17:00',
        format: 'image',
      },
      instagram: {
        caption:
          'Clutter is the enemy of deal velocity. An inside look at our design system principles: high-density typography, zero fluff, and instant responsiveness. Read the design manifest on our website.',
        hashtags: ['#DesignSystems', '#ProductDesign', '#Minimalism', '#UIUX', '#DesignTrends'],
        scheduledTime: '17:30',
        format: 'image',
      },
    },
    status: 'scheduled',
    createdAt: '2026-10-21T08:15:00Z',
  },
  {
    id: 'post-5',
    title: 'Weekly Community Office Hours & Live AMA',
    scheduledDate: '2026-10-27',
    scheduledTime: '11:00',
    platforms: ['youtube', 'facebook', 'instagram', 'threads'],
    format: 'image',
    media: [
      {
        id: 'media-p5-i1',
        name: 'live_stream_studio_announcement.png',
        url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
        size: 4100000,
        type: 'image/jpeg',
        width: 1200,
        height: 800,
      },
    ],
    baseCaption:
      'Join our engineering and founding team for this week’s live product AMA! We’ll be answering workflow questions and demoing upcoming automations.',
    baseHashtags: ['#LiveStream', '#AskMeAnything', '#Community', '#Webinar'],
    platformOverrides: {
      youtube: {
        caption:
          'Live AMA: Building Next-Gen Sales Workflows with Relate Founders & Core Engineers (Live Q&A)',
        hashtags: ['#Live', '#Webinar', '#CRM', '#SaaS'],
        scheduledTime: '11:00',
        format: 'image',
      },
    },
    status: 'scheduled',
    createdAt: '2026-10-21T09:00:00Z',
  },
  {
    id: 'post-6',
    title: 'Behind the Design: Relate Color Palette & Inter Typography',
    scheduledDate: '2026-10-18',
    scheduledTime: '15:30',
    platforms: ['instagram', 'tiktok'],
    format: 'video',
    media: [
      {
        id: 'media-p6-v1',
        name: 'design_system_timelapse.mp4',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        size: 19800000,
        type: 'video/mp4',
        duration: 15,
        width: 1080,
        height: 1920,
      },
    ],
    baseCaption:
      'From wireframes to production: How we crafted the Relate design system with Inter 600 headings and refined 8px card rhythm.',
    baseHashtags: ['#UIDesign', '#Figma', '#Frontend', '#DesignSystem'],
    platformOverrides: {},
    status: 'published',
    createdAt: '2026-10-17T11:00:00Z',
    metrics: {
      likes: 2450,
      comments: 134,
      shares: 489,
      views: 31200,
    },
  },
];
