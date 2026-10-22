# Social Media Scheduling Calendar & Cross-Platform Publisher

A modern, high-precision calendar workspace engineered for scheduling, organizing, and previewing social media content across Instagram, Facebook, Threads, TikTok, and YouTube. Adheres strictly to the Relate design system, featuring fluid drag-and-drop scheduling, multi-media ingestion up to 1 GB, per-channel customization, and authentic mobile device simulators.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and user experience decisions have been aligned based on your selections in Phase 1:

- **Confirmed Decision 1 (Calendar Topology)**: Implemented as switchable **Month**, **Week**, and **Day** views with full HTML5 Drag & Drop for reordering dates, times, and channels.
- **Confirmed Decision 2 (Multi-Platform Composer)**: A **Unified Composer** with per-platform custom overrides. Users can draft a core caption, media assets, and hashtags, then tune individual captions, tags, aspect ratios, and publishing times per platform (Instagram, Facebook, Threads, TikTok, YouTube).
- **Confirmed Decision 3 (Format Previews)**: An **Interactive Mobile Device Simulator** with authentic platform UI chrome (status bars, engagement buttons, audio tracks, swipeable carousel slides, and video controls) allowing real-time preview of Feed, Reels/Shorts, and Carousel formats before scheduling.
- **Design System Alignment**: Styled according to the **Relate B2B CRM** design specification: canvas `#fcfcfc`, text `#000000`, card background `rgba(24, 144, 255, 0.05)`, card radius `8px`, pill radius `10px`, primary link/accent `#0000ee`, and Inter typography.

---

## 1. Overview & Core Concept

### What It Does
The platform provides social media creators, marketing teams, and agency managers a central command center for planning content campaigns. Users can:
- Drag and drop posts between calendar days and time slots to re-schedule instantly.
- Filter or highlight posts by platform: **Instagram** (Feed, Reels, Carousel), **Facebook** (Feed, Video, Carousel), **Threads** (Post, Media Thread), **TikTok** (Vertical Video, Carousel), and **YouTube** (Shorts, Standard Video).
- Ingest high-res images, carousel sets, and large video files up to **1 GB** with client-side chunking, video duration/resolution inspection, and upload progress feedback.
- Tailor individual platform payloads (character count checks, platform-specific hashtags, first comments, and channel-specific publish times).
- Test simulated feed experiences in an authentic mobile viewport before locking schedules.

### Target Audience & Persona
- Digital creators, marketing teams, agency managers, and social media strategists who manage multi-channel brand presence with high volume and diverse video/carousel media requirements.

### Key Value
Eliminates fragmented spreadsheets and disjointed tools by bringing multi-platform planning, media handling, and photorealistic platform simulation into a single fast workspace.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Calendar Browsing & Filter Flow**:
   - User views scheduled posts across the month/week/day grid.
   - Platform filter pills in the workspace header allow toggling visibility for Instagram, Facebook, Threads, TikTok, or YouTube.
   - Dragging a post card across calendar cells updates its scheduled date and time with animated drop targets and instant state synchronization.

2. **Unified Post Creation & Customization Flow**:
   - Clicking "Schedule Post" or double-clicking any calendar day opens the Post Composer modal.
   - User selects target platforms via toggleable platform chips with authentic brand colors and official SVG icons.
   - Drag and drop or browse to upload media files (images, video, or multi-item carousel up to 1 GB).
   - Base caption and hashtags are entered; user can switch between platform tabs to adjust specific character lengths (e.g. Threads 500 chars vs. Instagram 2,200 chars vs. YouTube description), customize first comments, or adjust platform-specific publish times.

3. **Interactive Device Preview Flow**:
   - User toggles the "Device Preview" inspector at any time.
   - An authentic mobile phone viewport renders the post in the exact chrome of the selected platform:
     - **Instagram**: Top story bar, account handle, audio indicator, like/comment/share/bookmark bar, carousel swipe indicators, and expandable caption with hashtag highlight.
     - **TikTok**: Full vertical 9:16 player, right-rail action bar (like counter, comment count, bookmark, share, rotating vinyl sound disc), caption with music marquee.
     - **YouTube**: 16:9 or 9:16 Shorts player with subscribe button, thumbs up/down, remix, sound icon, and comments peek.
     - **Facebook**: Header with privacy badge, like/react pill, share button, and formatted link preview.
     - **Threads**: Minimalist conversation thread layout, reply icon, repost button, and clean typography.

4. **Media Handling & Validation Flow**:
   - Supports image formats (PNG, JPG, WebP), video formats (MP4, MOV, WebM), and multi-slide carousels.
   - File sizes up to 1 GB are validated with progress simulators, media duration/dimension checks, and client object URL caching.

### Visual Identity & Theme (Relate Design System)
- **Background**: `#fcfcfc` (Relate canvas).
- **Text & Foreground**: `#000000` body, `#020520` (h1), `#0f1f3d` (h2), `rgba(20, 20, 30, 0.8)` (h3).
- **Cards**: `background: rgba(24, 144, 255, 0.05)`, border `1px solid rgba(24, 144, 255, 0.15)`, shadow `rgba(0, 0, 0, 0.25) 0px 0px 4px -2px`, radius `8px`.
- **Pills / Active Selectors**: `border-radius: 10px`, subtle borders, clear active indicators.
- **Accents & Links**: Brand electric blue `#0000ee` and `#1890ff`.
- **Platform Palettes**:
  - Instagram: Gradient magenta/rose `#E1306C`
  - Facebook: Classic royal `#1877F2`
  - Threads: Pure dark slate `#000000` / `#1E1E1E`
  - TikTok: Cyan & red accent `#00F2FE` & `#FE2C55`
  - YouTube: Pure red `#FF0000`

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Native HTML5 Drag and Drop with Accessible Keyboard Fallback**
  - *Chosen Approach*: Lightweight HTML5 drag-and-drop state management with visual drop indicator highlights and card drop zones across Month, Week, and Day calendar grids.
  - *Why*: High-performance, zero heavy runtime overhead, seamless support for dragging posts between dates and time slots.

- **Decision 2: Client-Side Object URL & Chunk Inspection for Large Media (Up to 1 GB)**
  - *Chosen Approach*: Streamlined browser `File` and `Blob` handling with `URL.createObjectURL`, file size check up to `1024 * 1024 * 1024` bytes (1 GB), media type detection, and progress simulation.
  - *Why*: Allows instant local playback and carousel preview of real 4K video files or massive photo albums without requiring server upload bandwidth or backend storage limits.

- **Decision 3: Device Simulator with Platform Switcher & Viewport Dimensions**
  - *Chosen Approach*: Live interactive device mockup displaying real video elements, image carousels with arrow and swipe controls, and reactive caption truncation.
  - *Why*: Social media creators require exact visual confidence in how line breaks, hashtag wraps, and aspect ratios render on real devices prior to scheduling.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        App Navigation & Top Bar                        │
│  [ Relate Social Calendar ]   [ Filter Platforms ]   [ + Schedule Post ]│
└────────────────────────────────────────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼                                                               ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│        Calendar Workspace         │   │     Live Mobile Device Preview    │
│  ┌─────────────────────────────┐  │   │  ┌─────────────────────────────┐  │
│  │ View Switcher: M | W | D    │  │   │  │ Platform Tab: IG|FB|TH|TT|YT│  │
│  ├─────────────────────────────┤  │   │  ├─────────────────────────────┤  │
│  │ Month Grid / Day Schedule   │  │   │  │ Phone Mockup Chrome         │  │
│  │ - Drag & Drop Target Cells  │  │   │  │ - Video / Carousel Carousel │  │
│  │ - Post Cards with Badges    │  │   │  │ - Real Engagement UI Layout │  │
│  └─────────────────────────────┘  │   │  └─────────────────────────────┘  │
└───────────────────────────────────┘   └───────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Unified Post Composer Modal & Media Ingest               │
│  - Multi-Platform Selector (Instagram, Facebook, Threads, TikTok, YT)  │
│  - Drag & Drop Media Uploader (Images, Videos, Carousels <= 1GB)       │
│  - Base Caption, Smart Hashtag Suggestion, Platform Overrides          │
│  - Per-Platform Schedule Timers & Timezone Selector                    │
│  - Instant Validation (file format, length limits, aspect ratios)      │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Strategy
- **`PostItem`**:
  - `id`: unique string
  - `title`: internal headline/campaign name
  - `platforms`: array of `'instagram' | 'facebook' | 'threads' | 'tiktok' | 'youtube'`
  - `format`: `'image' | 'video' | 'carousel'`
  - `media`: array of `{ id, url, name, size, type, duration? }`
  - `baseCaption`: string
  - `baseHashtags`: string[]
  - `platformOverrides`: `{ [platform]: { caption?: string, hashtags?: string[], scheduledTime?: string, format?: string } }`
  - `scheduledDate`: string (`YYYY-MM-DD`)
  - `scheduledTime`: string (`HH:mm`)
  - `status`: `'draft' | 'scheduled' | 'published'`
  - `stats`: `{ likes: number, comments: number, shares: number }`

- **Seed Data**: Pre-loaded with rich, realistic multi-platform posts (e.g., product release reel, B2B SaaS carousel infographic, Threads thought-leadership thread, YouTube Shorts feature walkthrough) so the user experiences an active workspace immediately.

---

## 5. Verification & Quality Gates
- **Interactive Drag & Drop**: Verify drag and drop between calendar cells with date mutation.
- **Large Media Upload**: Test uploading images, videos, and multi-file carousels with 1 GB ceiling validation.
- **Mobile Responsive Layout**: Responsive breakpoints ensuring smooth usability on desktop (1440px), tablet (768px), and mobile (375px).
- **Design System Fidelity**: Exact conformance with Relate specs (`#fcfcfc` canvas, `rgba(24, 144, 255, 0.05)` cards, 8px radius, 10px pills, Inter typography).
- **Zero Build Errors**: Clean TypeScript compilation with `compile_applet`.
