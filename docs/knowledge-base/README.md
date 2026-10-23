# Relate Social — Repository Knowledge Base

> Master entry point for AI agents and developers working on this repository.
> Source of truth is always the code. This knowledge base was reviewed against
> commit `9d75e55` on 2026-10-23.

---

## 1. What this project is

**Relate Social** is a single-page social-media **planner and calendar** for five
channels — Instagram, Facebook, Threads, TikTok and YouTube. It provides:

- Month / week / day calendar views with drag-and-drop scheduling.
- A unified composer with one base caption plus per-platform overrides.
- A bulk campaign generator that turns a batch of media into a drip series.
- A universal, disk-backed media library (1 GB per file, date folders).
- A device simulator that renders posts in native-looking channel chrome.
- **Real OAuth connections** to all five platforms, with server-side token
  storage, automatic refresh where supported, and a live "Test API Connection"
  handshake.

**Publishing is not implemented.** The UI's "Simulate Instant Publish" action
only mutates local state/metrics. This repository covers *planning, composing,
previewing and connecting accounts*, not delivering content to the platforms.

The app began as an AI Studio scaffold (`metadata.json`, `.aistudio/`,
`index.html`, `src/main.tsx`) and was extended with the Express OAuth/media
backend in `server.ts`.

---

## 2. Status at a glance

| Area | Status | Notes |
| --- | --- | --- |
| Calendar UI (month/week/day) | Implemented | Local state only; no date library |
| Drag & drop rescheduling | Implemented | HTML5 DnD, post ID in `application/x-relate-post` |
| Drag & drop media from OS | Implemented | Creates a prefilled scheduled post |
| Unified composer | Implemented | Base content + per-platform overrides |
| Bulk campaign builder | Implemented | One post per media item on a cadence |
| Universal media library | Implemented | Backend disk storage, IndexedDB/localStorage fallback |
| OAuth connect (5 tabs / 5 flows) | Implemented | Meta, Threads, Instagram Login, TikTok, Google |
| Live connection verification | Implemented | `/api/verify/:platform` calls real APIs |
| Automatic token refresh | Partial | TikTok, YouTube, Threads, Instagram Login; **not Meta** |
| Real publishing | **Not implemented** | Simulator only |
| Background scheduling/jobs | **Not implemented** | "Scheduled" is metadata |
| Authentication/authorization | **None** | Backend is a local single-user tool |
| Tests / CI | **None** | No test runner, no workflow |
| Production server build | **None** | `vite build` builds the frontend only |
| Analytics / metrics | Simulated | Random values stored in localStorage |

---

## 3. Quick start

Requirements: Node.js 20+ (developed on Node 24), npm or pnpm.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# fill platform credentials — see ../platform-setup.md

npm run dev:server          # terminal 1 — Express on :8787
npm run dev                 # terminal 2 — Vite on :3000
```

Open <http://localhost:3000> → header **API Connections** → connect a platform →
**Test API Connection**.

Scripts:

| Script | Behaviour |
| --- | --- |
| `npm run dev` | Vite dev server on `:3000`, host `0.0.0.0`, proxies `/auth` + `/api` to `:8787` |
| `npm run dev:server` | `tsx watch server.ts` (Express OAuth + media backend) |
| `npm run build` | `vite build` (frontend only → `dist/`) |
| `npm run preview` | Serves the built frontend |
| `npm run lint` | `tsc --noEmit` (type check; no ESLint configured) |
| `npm run clean` | Removes `dist/` and `server.js` |

Full setup, provider portal configuration and the HTTPS tunnel are documented in
[../platform-setup.md](../platform-setup.md) and in [05-development.md](./05-development.md).

---

## 4. System topology

```
Browser — React 19 SPA (Vite dev server :3000)
   │
   │  same-origin requests:
   │    /api/*   → storage, connections, verify, disconnect
   │    /auth/*  → OAuth start + callback (new tab)
   │  proxied by Vite (vite.config.ts:25-28) to :8787
   ▼
Express OAuth backend — server.ts (:8787)
   ├─ Meta Graph API            facebook.com / graph.facebook.com
   │    Facebook Pages + Instagram via Page
   ├─ Instagram API             instagram.com / api.instagram.com / graph.instagram.com
   │    Standalone "Instagram Login" flow
   ├─ Threads API               threads.net / graph.threads.net
   ├─ TikTok Open API v2        tiktok.com / open.tiktokapis.com  (OAuth 2.0 + PKCE)
   └─ YouTube Data API v3       accounts.google.com / oauth2.googleapis.com / googleapis.com
        │
        ├─ .secrets/connections.json     tokens (git-ignored, 0600)
        ├─ .secrets/oauth-states.json    in-flight PKCE/state (survives tsx watch)
        └─ <DATA_DIR>/media/YYYY-MM-DD/  uploaded media files
```

Key consequence: **OAuth redirect URIs point at `APP_URL` (the Vite origin,
usually `:3000`), never at `:8787`.** The callback hits Vite and is proxied to
Express. See [01-architecture.md](./01-architecture.md).

---

## 5. Repository map

| Path | Role |
| --- | --- |
| `server.ts` | Entire backend: config, OAuth flows, token refresh, verify, media API (942 lines) |
| `src/App.tsx` | Application shell, post state, filtering, modal orchestration, drop handling |
| `src/main.tsx` | React root |
| `src/types/index.ts` | All shared domain types |
| `src/constants/platforms.ts` | Platform capabilities, brand palette, limits, 1 GB cap |
| `src/utils/mediaUtils.ts` | File validation, dimension/duration probing, `MediaItem` creation |
| `src/utils/mediaStorage.ts` | Server-disk ↔ IndexedDB ↔ localStorage media persistence |
| `src/components/Header.tsx` | 3-zone top bar, storage/API/status, primary CTAs |
| `src/components/PlatformFilterBar.tsx` | Platform counts, format filter, caption/tag search |
| `src/components/Calendar/` | `CalendarHeader`, `MonthView`, `WeekView`, `DayView`, `PostCard` |
| `src/components/Composer/UnifiedComposerModal.tsx` | Main post editor with per-platform overrides |
| `src/components/BulkUpload/BulkCampaignModal.tsx` | Batch media → cadence-based series |
| `src/components/MediaLibrary/MediaLibraryModal.tsx` | Library browser, upload, delete, JSON manifest |
| `src/components/DeviceSimulator/` | Post detail modal + five native channel mockups |
| `src/components/Settings/ApiSettingsModal.tsx` | OAuth connect/test/disconnect UI |
| `src/components/PlatformIcon.tsx` | Inline SVG brand icons |
| `src/index.css` | Tailwind v4 import, base typography, `.relate-card` helper |
| `docs/platform-setup.md` | Provider app registration walkthrough |
| `public/tiktokDORlGpmC87m7uYv95gj95MgaVGD9pDgU.txt` | TikTok developer URL verification file (must stay public) |
| `public/assets/aistudio/…md` | AI Studio design-system seed (colors/typography/card spec) |
| `.env.example` | Documented environment variables |
| `vite.config.ts` | React + Tailwind plugins, proxy, allowed tunnel hosts, HMR switch |
| `metadata.json` | AI Studio app metadata (includes an unused Gemini capability flag) |

---

## 6. Core concepts

| Term | Meaning |
| --- | --- |
| **Platform tab** | One of `instagram`, `facebook`, `threads`, `tiktok`, `youtube`. |
| **Connection group** | Backend key that owns a token: `meta` (Facebook), `instagram` (standalone IG Login), `threads`, `tiktok`, `youtube`. Facebook and Instagram-via-Page share `meta`; standalone IG uses `instagram`. |
| **ScheduledPost** | The persisted planning unit. One post targets many platforms and may carry a `platformOverrides` entry per platform. |
| **Platform override** | Per-channel caption, hashtags, time, format, plus IG first comment / TikTok sound title. |
| **Universal media** | Media stored on disk under `<DATA_DIR>/media/YYYY-MM-DD/`, shared across browsers/builds. |
| **Fallback media** | IndexedDB (`RelateSocialMediaDB`) when the backend is unreachable, then localStorage metadata. |
| **Simulated publish** | Local status/metrics mutation; no network call to any platform. |

Deeper reading:

1. [01-architecture.md](./01-architecture.md) — runtime, ports, request lifecycles, config resolution.
2. [02-backend-oauth.md](./02-backend-oauth.md) — every endpoint, each provider flow, token refresh, security.
3. [03-frontend.md](./03-frontend.md) — component tree, state, feature flows, styling.
4. [04-data-and-storage.md](./04-data-and-storage.md) — types, localStorage/IndexedDB, media API contracts, URL lifecycle.
5. [05-development.md](./05-development.md) — environment, provider setup, tunnel, verification checklist, troubleshooting.
6. [06-known-gaps-and-recipes.md](./06-known-gaps-and-recipes.md) — bugs, security notes, extension recipes, conventions.

---

## 7. Non-obvious facts an agent must know

- **No publishing path exists.** Do not assume `POST /api/publish` or any platform
  publish call; `grep` will confirm.
- **The backend is unauthenticated** and holds tokens in plaintext on disk. It is
  intended for local/trusted use.
- **`APP_URL` controls callbacks**, not the Vite port constant. Meta and TikTok
  require HTTPS in real deployments.
- **Media URLs are session-scoped Blob URLs on upload**, while the library reloads
  as server URLs. Posts saved to localStorage can therefore reference dead blob
  URLs after reload. See 04 §6.
- **"Today" in `App.tsx` is hardcoded to 2026-10-21** (`src/App.tsx:277`).
- **Meta tokens are never auto-refreshed**; users must reconnect on expiry.
- **The Express server binds all interfaces** (`app.listen(PORT)`), and the media
  and connection endpoints have no auth.
- **`@google/genai` and `motion` are unused** despite being dependencies;
  `metadata.json`'s Gemini capability flag is scaffold residue.
