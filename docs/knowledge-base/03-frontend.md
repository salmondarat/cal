# 03 — Frontend

Scope: React SPA under `src/`. React 19, Vite 8, TypeScript, Tailwind CSS v4,
lucide-react icons. No router, no state library, no date library, no UI kit.

---

## 1. Entry and component tree

```
index.html
└─ src/main.tsx (createRoot)
   └─ App.tsx                         shell + all top-level state
      ├─ Header.tsx                   brand, storage/API status, CTAs
      ├─ PlatformFilterBar.tsx        platform counts, format, search
      ├─ main
      │  └─ CalendarHeader.tsx        prev/Today/next, month-week-day switch
      │     ├─ MonthView.tsx         7-column month grid
      │     │  └─ PostCard.tsx       draggable post chip
      │     ├─ WeekView.tsx          Monday-start week × 3 time bands
      │     └─ DayView.tsx           hourly timeline 08:00–21:00
      ├─ UnifiedComposerModal.tsx    create/edit post
      ├─ DeviceSimulatorModal.tsx    post detail + publish simulation
      │  └─ DeviceSimulator.tsx      phone frame + 5 channel chromes
      ├─ BulkCampaignModal.tsx       batch → cadence series
      ├─ ApiSettingsModal.tsx        OAuth connect/test/disconnect
      ├─ MediaLibraryModal.tsx       library + upload + JSON manifest
      └─ toast                       fixed bottom-right notification
```

Modals stay mounted and early-return `null` when closed. This matters for any
state initialized once from props (see simulator quirk, §9).

---

## 2. App state and handlers

State in `src/App.tsx`:

| State | Type | Persistence |
| --- | --- | --- |
| `posts` | `ScheduledPost[]` | `localStorage['relate_social_scheduled_posts_v2']`, written on every change |
| `storedMedia` | `MediaItem[]` | Loaded once from `getAllStoredMedia()`; not reloaded after |
| `currentDate` | `Date` | ephemeral |
| `viewMode` | `'month' \| 'week' \| 'day'` | ephemeral |
| `selectedPlatform` | `PlatformId \| 'all'` | ephemeral |
| `selectedFormat` | `MediaFormat \| 'all'` | ephemeral |
| `searchQuery` | `string` | ephemeral |
| modal flags | booleans | ephemeral |
| `editingPost` | `ScheduledPost \| null` | ephemeral |
| `quickAddDate`, `quickAddTime` | strings | ephemeral |
| `activeSimulatorPost` | `ScheduledPost \| null` | ephemeral |
| `toastMessage` | object | auto-clears after 4 s |

Handlers:

| Handler | Behaviour |
| --- | --- |
| `handleMovePost` | Rewrites `scheduledDate` (+ optional time) of one post, toast |
| `handleDropMediaFiles` | Validates each file, processes + saves media, creates a prefilled scheduled post (`instagram`, `tiktok`, `youtube`) |
| `handleSavePost` | Upserts by `id`; toast differs for update vs create |
| `handleScheduleBulkPosts` | Prepends generated posts |
| `handleDeletePost` | Removes post; closes simulator if it was open on it |
| `handlePublishNow` | Sets `status:'published'` and adds canned metrics (`+124` likes, `+18` comments, `+29` shares, `+1450` views) — **no network call** |
| `handleQuickAdd` | Opens composer with a date/time |
| `handleEditPost` | Opens composer with the existing post |
| `handlePreviewPost` | Opens simulator |
| `handlePrev` / `handleNext` | Move by month/week/day from `viewMode` |
| `handleToday` | Sets date to **hardcoded 2026-10-21** (`src/App.tsx:277`) |

Derived data:

- `countsByPlatform` — one increment per platform per post.
- `filteredPosts` — platform ∩ format ∩ case-insensitive search over `title`,
  `baseCaption`, `baseHashtags`. Status is **not** filtered.
- `totalStorageBytes` — sum of media sizes across the library, falling back to
  post media when the library is empty.

---

## 3. Header and filter bar

**Header** (`Header.tsx`) is a three-zone contract:

1. Brand ("Relate Social / Multi-Platform Planner").
2. Desktop-only nav: media storage (`x / 1.0 GB`), API Connections, scheduled
   and published counts. Below `lg`, storage and API become icon buttons.
3. Actions: Bulk Campaign, Device Preview, Schedule.

**PlatformFilterBar** shows "All Channels" plus per-platform counts, format pills
(All / Images / Videos / Carousels) and a search field with clear button.

---

## 4. Calendar views and drag & drop

### Month view

- Sunday-start 7-column grid; pads leading days from the previous month and
  trailing days to complete the final row.
- Current-month date strings are built manually (`YYYY-MM-DD`); adjacent-month
  cells use `toISOString()` (`MonthView.tsx:55,83`) — timezone-sensitive.
- Posts are grouped by exact `scheduledDate`.
- `PostCard` becomes `compact` when a day has more than two posts.
- Drop targets accept both a dragged post and OS files; a floating "Drop to
  schedule" pill appears without shifting layout.

### Week view

- Monday-start (`WeekView.tsx:30-33`).
- Three bands: Morning 08:00–12:00, Afternoon 12:00–17:00, Evening 17:00–22:00.
- A post is shown in a band by its hour (hour < 12, 12–16, ≥ 17).
- Dropping a **post** into a band rewrites the time to the band default
  (`09:30`, `13:30`, `19:00`), not the original time.
- Minimum grid width 700 px with horizontal scroll on small screens.

### Day view

- Hours 08:00 through 21:00, one row each; posts matched by exact hour.
- Dropping a post or files sets the time to `HH:00` (`DayView.tsx:67`).
- Empty rows expose a `+` quick-add.

### Drag payload

`PostCard` writes the post id to both `application/x-relate-post` and
`text/plain` (`PostCard.tsx:35-41`). Cells check `dataTransfer.files` first
(OS drop), then read the id. `handleDragLeave` uses `relatedTarget` containment
to avoid flicker.

### Post card

Shows time, platform icon stack, first media thumbnail (video/carousel/image
badge), title, one-line caption, first three hashtags, and hover actions
Preview / Edit / Delete. Published posts get a check icon. The media badge is
based on `post.format`, not the actual file type.

---

## 5. Unified composer

`UnifiedComposerModal.tsx` is the main editor.

Form state: title, date, time, target platforms, base format, media list, base
caption, base hashtags, per-platform overrides, active platform tab, upload
state.

Default new post: `instagram`, `tiktok`, `youtube`; format `image`; hashtags
`['#B2BSaaS', '#TechInnovation']`; date = today (ISO date string); time `10:00`.

Sections:

1. **Target channels** — 2×5 grid; at least one platform must remain selected.
2. **Media ingestion** — click/drag files, validate ≤ 1 GB, simulated progress
   (20 → 90 via timer, then 100 and a 300 ms pause), `processFileToMediaItem`,
   `saveMediaItemToStorage`; auto-format: >1 item → `carousel`, one video →
   `video`, otherwise `image`. Also a picker for existing library items.
3. **Title, date, time.**
4. **Base caption + hashtags** — Enter adds a tag, dedupe, suggestion chips.
5. **Per-platform overrides** — tab per selected platform:
   - caption (textarea value falls back to base caption until edited),
   - time,
   - format (options from `PLATFORMS[id].supportedFormats`),
   - Instagram only: automated first comment,
   - TikTok only: sound/audio title.
   Overrides are created lazily by `updatePlatformOverride` and initialized from
   the base values *at first edit*; later base changes do not propagate.

Footer: Cancel / Save Draft / Schedule Across Channels. "Device Preview" (header)
builds the post and opens the simulator without saving.

Validation is minimal: empty caption/media are allowed; character limits are
displayed but not enforced. New posts receive random starter metrics
(`likes 120–920`, `comments 10–70`, `shares 5–45`) (`UnifiedComposerModal.tsx:264-268`).

---

## 6. Bulk campaign builder

`BulkCampaignModal.tsx` turns N media files into N posts.

Inputs: campaign name, channels, start date (default hardcoded `2026-10-22`),
daily time (default `11:00`), cadence, hashtag list, media queue.

Cadences (`calculatePostDate`):

- `daily` — start + index days,
- `every-2-days` — start + index×2 days,
- `mon-wed-fri` — walk forward counting Mondays, Wednesdays, Fridays,
- `weekly` — start + index×7 days.

For each media item it creates one `ScheduledPost` titled
`"<Campaign> · Part <n> (<file>)"`, format `video` when the file is video else
`image` (never carousel), base caption built from the campaign name, and
**hardcoded overrides for Instagram, TikTok and YouTube** regardless of which
channels are selected (`BulkCampaignModal.tsx:157-176`). The schedule button is
disabled until at least one media item exists.

---

## 7. Media library

`MediaLibraryModal.tsx`:

- Quota gauge: sum of item sizes vs 1 GB. The pool is **display-only**; only
  per-file 1 GB is enforced by the server.
- Upload multiple files → process + persist; prepend to the library.
- Delete one item (storage only; posts keep referencing it).
- Clear all with `window.confirm` → deletes every date-folder file (server mode)
  or clears IndexedDB.
- Export metadata manifest as JSON (`data:` URL download).
- Import a JSON array; every item is re-saved, then prepended (no dedupe).
- Filter All / Videos / Images and search by filename.
- "Schedule Post" calls `onSelectMediaForPost(item)` and closes.

Known mismatch: `App`'s `onSelectMediaForPost` ignores the item and opens a blank
composer for today at 10:00 (`src/App.tsx:466-472`). The chosen media is not
attached.

---

## 8. API settings modal

`ApiSettingsModal.tsx` — tabs for all five platforms with connected dots.

On open: `GET /api/connections`; if unreachable, shows "OAuth backend is not
running". Connection mapping:

| Tab | Source | Notes |
| --- | --- | --- |
| Facebook | `meta` | Account label uses page name when available |
| Instagram | `instagram` first, else `meta` with an `@` account name | Standalone wins |
| Threads | `threads` | |
| TikTok | `tiktok` | |
| YouTube | `youtube` | Account field shows channel title, not ID |

Connect flow:

1. Probe the start route with `redirect:'manual'` to surface config errors (400).
2. `window.open(oauthPath, '_blank')`; blocked popups produce an error.
3. Start polling `/api/connections` every 1.5 s.
4. Success when the connection group appears; also success via the
   `relate-oauth` `postMessage` from the callback page.
5. Failure when the tab closes first or after 90 s.

Displayed account ID and token fields are **read-only**; the token is the masked
string from the server. "Reveal" only toggles visibility of that masked value.
Scopes render as chips. "Test API Connection" calls `/api/verify/:platform` and
prints identity or a warning. "Disconnect" posts to
`/api/disconnect/<group>` and refreshes state. "Done" closes; `App` passes no
save callback, so nothing is persisted client-side.

---

## 9. Device simulator

`DeviceSimulatorModal` splits the view: left = post metadata, target channels,
media list, publish simulation; right = phone mockup.

`DeviceSimulator` renders an iPhone-16-Pro-style frame with a dynamic island,
status bar and five chromes:

- **Instagram** — account header, square media, carousel controls/dots, like
  toggle, caption expand/collapse, hashtags, optional first comment, scheduled
  time.
- **TikTok** — full-bleed player, action rail, rotating vinyl, caption, tags,
  sound title.
- **YouTube Shorts** — player, action column, channel row with Subscribe,
  post title.
- **Facebook** — card layout, page identity, 4:3 media, reaction/action rows.
- **Threads** — thread line, avatar, caption, tags, media, reply rail.

It resolves content per platform: override caption/hashtags/format/time, falling
back to base values. Video playback and mute toggle are local; like counts are
local UI state. Publishing calls `onPublishNow`, which is the simulated mutation
described in §2.

Simulator quirk: both the modal and the inner simulator initialize the selected
platform once from the post prop. Because they stay mounted while closed, opening
a later post can retain the previous platform selection; opening a post whose
`platforms` do not include it can show a chrome with no corresponding tab.

All handles/avatars/metrics inside the mockups are static placeholders
(`relate.sales`, `@relatesales`, `@RelateCRM`, fixed follow counts), not the
connected account.

---

## 10. Visual system

- Tailwind v4 via `@tailwindcss/vite`; no `tailwind.config.*`. Utilities are
  written inline, often with arbitrary values.
- Fonts: Inter (Google Fonts link in `index.html`), system fallback in
  `index.css`.
- Palette:
  - page background `#fcfcfc`, text `#000000`
  - brand/near-black `#020520`, deep navy `#0f1f3d`
  - action blue `#0000ee` (links/primary), accent `#1890ff`
  - emerald for connected/published, red for destructive, neutral grays for chrome
- Radii: cards/inputs 8 px, modals 12 px, chips 6–8 px, pills 10 px.
- `.relate-card` = blue-tinted panel (`rgba(24,144,255,.05)` background,
  `rgba(24,144,255,.16)` border, 8 px radius, soft shadow). Used for composer
  sections, simulator info and settings panels.
- Icon set: lucide-react throughout; brand marks are inline SVG in
  `PlatformIcon.tsx` (color and mono variants).
- Layout is full-width with responsive padding; calendar card is bordered and
  rounded; modals use a dimmed backdrop with `max-h-[92vh]` and internal scroll.
- Some utility classes come from plugins that are **not installed**
  (`animate-in`, `fade-in`, `slide-in-from-bottom-3`, `scrollbar-none`,
  `scrollbar-thin`, `xs:` breakpoint). They are effectively no-ops; built-in
  `animate-spin` / `animate-pulse` do work.
- Design seed (colors, type scale, card spec) is mirrored in
  `public/assets/aistudio/relate-modern-sales-crm-for-b2b-companies_7735f738.md`.

---

## 11. Frontend conventions

- Function components typed as `React.FC<Props>` with a local `interface Props`.
- Relative imports (`../types`, `../../constants/platforms`); the `@` alias is
  unused.
- All shared domain types in `src/types/index.ts`; all platform facts in
  `src/constants/platforms.ts` — do not duplicate limits/colors in components.
- Modal-local state stays inside the modal; only posts, library, filters, date,
  view mode and active post are lifted to `App`.
- Toast messages are the primary feedback mechanism; there is no alert library.
- Dates are strings `YYYY-MM-DD`; times are `HH:mm`.
- No tests, no Storybook, no ESLint config; `npm run lint` is only `tsc`.
