# 06 — Known Gaps, Security Notes, Recipes, Conventions

Scope: what is intentionally unfinished, what is currently wrong, how to change
the system safely, and the conventions the codebase follows.

---

## 1. Publishing: what is real and what is not

Instagram and Threads publish through the platform APIs. Everything else is
still schedule-only.

Real (backend `server.ts`, "Publishing" sections):

- `POST /api/posts/:id/publish` starts a delivery job and answers `202`
  immediately; the job keeps running after the browser closes. The client polls
  `GET /api/posts/:id` until the status leaves `publishing`.
- Instagram (Instagram Login, or an Instagram account attached to a Facebook
  Page): create container → poll `status_code` until `FINISHED` →
  `media_publish` → read `permalink`. Feed image, Reel, and carousel (child
  containers with `is_carousel_item=true`, then a `CAROUSEL` parent).
- Threads: image thread, video container + `container_id`, carousel children.
- `POST /api/posts/:id/unpublish` deletes what was published
  (`DELETE /{ig-id}/media?media_id=…`, `DELETE /{threads-id}?id=…`) and keeps
  the record with `deletedAt`.
- `POST /api/posts/:id/validate` runs every pre-flight check — media resolves
  on disk, the public download URL answers, the account is readable, the caption
  fits — without sending anything. This is what the "Check" button uses.
- Scheduler: `setInterval` tick (default 20s) plus a catch-up tick 4s after
  boot. `publishAt` is computed from `scheduledDate` + `scheduledTime` in the
  **backend's local timezone**; a post more than `SCHEDULE_GRACE_MINUTES` (120)
  late is marked `failed` instead of being posted at the wrong hour. Up to
  `PUBLISH_MAX_ATTEMPTS` (3) retries at 2/10/30 minutes, and a platform that
  already succeeded is never re-published.
- Audit trail: every phase is appended to `<RELATE_DATA_DIR>/logs/publish.jsonl`
  (`publish-start`, `provider-error` with Meta's code/subcode/fbtrace_id,
  `platform-success`, `missed-window`, …) and served by `GET /api/publish/log`.

Still not implemented:

- TikTok, YouTube and Facebook-page publishing. Those platforms return
  `status: "skipped"` with an explicit "not implemented in this build" error, so
  a post can end `partial` — the UI never claims a silent success.
- No authentication on `/api/*` (see §3) — anyone who can reach the port can
  publish or delete.
- No insights: engagement numbers were removed rather than faked.

Two hard requirements for a live publish:

1. **Media on shared storage.** Posts must reference `folderDate`+name in
   `<data>/media/YYYY-MM-DD/` or a scanned library root (`libraryRootId` +
   `libraryPath`). Blob/data URLs in `localStorage` cannot be published; the
   composer blocks them.
2. **A public HTTPS base URL.** Meta curls the file, so
   `PUBLIC_MEDIA_BASE_URL` (or a non-localhost `APP_URL`) has to reach this
   backend. Locally that means a tunnel — the app's Cloudflare tunnel serves
   `https://<host>` → Vite :3000 → `/api` proxy → :8787. Media is served by
   `GET /api/public-media/:token`, an HMAC-signed, 6-hour-expiry link over the
   existing file resolvers; the publisher probes that URL first so a dead tunnel
   reads as "not reachable (Cloudflare 530)" instead of a mystery failure.

---

## 2. Known defects and quirks

| # | Issue | Location | Impact | Notes |
| --- | --- | --- | --- | --- |
| 1 | Media uploaded while the backend is down still keeps a `blob:` URL | `src/utils/mediaStorage.ts:128-158` | Post thumbnails break after reload; such posts cannot publish | Composer now blocks publishing for non-`serverManaged` items; the load-time migration to library matches is still missing |
| 2 | ~~"Today" was hardcoded to 2026-10-21~~ fixed | `src/App.tsx` `handleToday` | — | Now `new Date()` |
| 3 | Library "Schedule Post" ignores the selected item | `src/App.tsx` `onSelectMediaForPost` | Opens a blank composer; chosen media not attached | Needs a prop to seed media |
| 4 | Bulk builder hardcodes overrides for IG/TikTok/YouTube and a default start date | `src/components/BulkUpload/BulkCampaignModal.tsx:157-176` | Overrides exist for unselected channels; captions are canned; dates may surprise | Overrides are harmless when unselected but misleading |
| 5 | Bulk format never becomes `carousel` | same file, `:153` | Multi-file batches produce separate image/video posts | One media per post by design |
| 6 | Date handling still mixes local dates and `toISOString()` in a few places | `MonthView`/`WeekView`/`DayView` now use `localDateString()`; composer picker fixed | Cells could shift by a day | Scheduler compares against `publishAt` computed in the backend's zone (`timezone` is stored per post) |
| 7 | Overrides snapshot base values at first edit | `UnifiedComposerModal.tsx` | Later base caption/hashtag changes do not flow into already-edited channels | Expected but easy to mistake for a bug |
| 8 | Simulator keeps the previously selected platform across openings | `DeviceSimulatorModal.tsx`; `DeviceSimulator.tsx` | Wrong chrome can show for a newly opened post | Props are used after mount, but initial state is one-time |
| 9 | `/api/health` reports Threads config from Meta credentials | `server.ts` | Cosmetic; fallback makes it equivalent in practice | Use `THREADS_*` for correctness |
| 10 | Graph version documentation mismatch | `server.ts` vs `.env.example` | Confusion only | Runtime env wins |
| 11 | ~~Upload progress was simulated~~ fixed | `UnifiedComposerModal.handleFilesAdded` | — | Now counts real per-file uploads to `/api/storage/media` |
| 12 | Validation is now enforced at save/publish | composer `blockingIssues`, `buildCaption`, `validatePost` | Over-limit captions, browser-only media and empty media are rejected | Drafts still save without media |
| 13 | Media deletion does not clean posts | `MediaLibraryModal.tsx` | Posts keep broken references | Publish then fails with "not in shared media storage" |
| 14 | Manifest import prepends without dedupe; may import `data:` URLs | `MediaLibraryModal.tsx` | Duplicates, localStorage bloat | No validation or size cap |
| 15 | `serverMode` cached for the page lifetime | `mediaStorage.ts` | Backend started after page load is not detected | Reload the page |
| 16 | Card media badge uses `post.format`, not the file MIME | `PostCard.tsx` | Misleading icon when format/media disagree | Cosmetic |
| 17 | Test result can mark a connected IG as disconnected if no Page IG is found | `ApiSettingsModal.tsx` | UI-only; reopening the modal re-syncs | Instagram Login path returns early, so this now only affects Page-based setups |
| 18 | Disconnecting Facebook also removes Instagram-via-Page | shared `meta` group | May surprise users | Standalone IG is unaffected |
| 19 | Unused dependencies: `@google/genai`, `motion`; unused helpers `fileToBase64`, `detectMediaType` | `package.json`, `mediaStorage.ts`, `mediaUtils.ts` | Dead weight | `metadata.json` claims a Gemini capability that is not implemented |
| 20 | Tailwind utilities from absent plugins | various components | `animate-in`, `fade-in`, `slide-in-from-bottom-3`, `scrollbar-none`, `scrollbar-thin`, `xs:` do nothing | Cosmetic; `animate-spin`/`pulse` work |
| 21 | No production backend build/start | `package.json` | `build` emits frontend only; the scheduler only runs under `tsx` | Publishing needs the backend to be running |
| 22 | Backend has no auth, binds all interfaces | `app.listen(PORT)` | Anyone reaching the port can publish, delete posts, read/write media | Now more dangerous: publish/unpublish routes act on real accounts |
| 23 | Callback HTML does not escape provider detail; receiver accepts any origin | `server.ts` `callbackHtml` | Potential XSS in an origin-served callback page | Harden if exposed |
| 24 | OAuth state file and media-signing key are plaintext | `.secrets/` | Short-lived state + HMAC key for public media links | Written with mode 0600 |
| 25 | `posts.json` is the live schedule | `<RELATE_DATA_DIR>/posts.json` | Deleting it deletes the queue | Browser localStorage is a mirror; the backend wins when both exist |

---

## 3. Security hardening checklist

Before exposing the backend beyond localhost:

1. **Authentication** — require a session or shared secret for `/api/*` and the
   media file route. OAuth start routes can stay public, but state should be tied
   to a session.
2. **Bind loopback** — `app.listen(PORT, '127.0.0.1')` unless a proxy fronts it.
3. **Escape callback output** — HTML-escape `detail` or only ever inject a
   constant message; keep the JSON message separately.
4. **Validate `postMessage` origin** on both sides; use a specific target origin.
5. **Restrict media access** — per-user namespaces or signed URLs; do not return
   absolute `dataDir` in `/api/storage/info`.
6. **Stream uploads** to disk instead of buffering 1 GB in memory.
7. **Rate-limit and CSRF-protect** disconnect/verify/publish endpoints.
8. **Protect secrets at rest** — keep `.secrets` out of backups/logs; on POSIX
   verify `0600`; consider OS keychain for real deployments.
9. **Add a security header baseline** (CSP, `X-Content-Type-Options`,
   `Referrer-Policy`) on backend HTML responses.
10. **Do not log tokens** — current code does not, keep it that way.

---

## 4. Recipes

### 4.1 Fix media URL persistence after reload

Problem recap: `processFileToMediaItem` creates a Blob URL; the server upload
discards its own response, so the saved post keeps the Blob URL.

Recommended change:

1. Make `uploadBufferToServer`/`saveToServer` return the server `MediaItem`
   (already constructed at `mediaStorage.ts:51-60`).
2. Make `saveMediaItemToStorage` return `MediaItem | null` (`null` for remote
   URLs that need no copy).
3. In `UnifiedComposerModal.handleFilesAdded`, `BulkCampaignModal.handleFilesAdded`
   and `MediaLibraryModal.handleUploadFiles`, replace each new item with the
   returned server item before adding it to component state.
4. Ensure `serverManaged: true`, `folderDate`, and `id = "<date>/<name>"` are set
   on the item that goes into the post.
5. Add a load-time migration in `App`: for each post media item whose `url`
   starts with `blob:`, attempt to match a library item by `name`/`size`; replace
   when found, otherwise mark it missing. Blob URLs themselves cannot be revived.
6. Optional: store only the stable relative `/api/storage/media/file?...` URL in
   posts; keep Blob URLs purely as immediate previews.

Tests to add: upload → save post → reload → thumbnail and simulator still render;
fallback mode behaves predictably.

### 4.2 Attach the chosen library item from MediaLibrary

1. Add `initialMedia?: MediaItem` to `UnifiedComposerModalProps` and append it in
   the reset effect (dedupe by id).
2. In `App`, keep the selected item in state (`const [seedMedia, setSeedMedia] = …`)
   inside `onSelectMediaForPost(item)` and pass it to the composer.
3. Clear `seedMedia` when the composer closes so it does not leak into the next
   new post.

### 4.3 Fix "Today"

`handleToday` should set the current date, for example:

```ts
const handleToday = () => setCurrentDate(new Date());
```

Use the same local-date convention as the calendar views when comparing dates.
Also consider deriving MonthView's "today" from local components rather than
`toISOString()`.

### 4.4 Adding a publishable channel (Instagram and Threads are done)

The delivery pipeline is generic: `publishPost()` → per-platform
`publishOnePlatform()` → `PlatformResult` stored on the post. To add TikTok,
YouTube or a Facebook Page:

1. Write `publishTikTok(post): Promise<PlatformResult>` next to
   `publishInstagram`. Resolve the token with `freshAccessToken('tiktok')`, take
   the id from `store.tiktok.accountIds[0]`, and reuse `postMediaRefs()` +
   `readyPublicUrls()` (TikTok also accepts a direct file upload instead).
2. Add the platform to `SUPPORTED_PUBLISH` and, if deletable, extend
   `removeFromPlatforms()` so "Remove from platforms" works in Manage posts.
3. Map `post.format` to the provider's own type names and reject mismatches with
   a message a normal user can act on — see the Reel/carousel guards.
4. Never return `success` unless the provider returned an id. `skipped` means
   "this build does not send it"; `failed` means "it tried and the provider said
   no". The UI colours only these.
5. Log every phase through `logPublish()` so `GET /api/publish/log` explains the
   outcome; `provider-error` entries carry Meta's code and `fbtrace_id`.

Rules that still apply:

- Resolve credentials per account, honour `post.platformAccounts.instagram`.
- Use the **Page token** from `metaPages` for Instagram-via-Page.
- Validate that media paths resolve inside the media root (`resolveInMediaDir`).
- One channel failing must not roll back another (`partial` exists for that).
- Idempotency: a platform already recorded `success` is never re-published.
- Authentication is still required before this leaves localhost (§3 item 1).

### 4.5 Add a platform

1. `src/types/index.ts` — extend `PlatformId`.
2. `src/constants/platforms.ts` — add the `PlatformConfig` entry and
   `ALL_PLATFORM_IDS`.
3. `src/components/PlatformIcon.tsx` — add the brand SVG.
4. `server.ts` — add start/callback routes, a `Store` key, a verify branch, a
   disconnect allow-list entry, and refresh support if applicable.
5. `ApiSettingsModal.tsx` — extend `OAUTH_START_PATH`, `CONNECTION_GROUP`,
   `OAUTH_PROVIDER`.
6. `UnifiedComposerModal` / simulator / device chrome — add per-platform UI only
   if the product needs it; otherwise the generic override UI works.
7. `docs/platform-setup.md` + this knowledge base — document registration.
8. `npm run lint` and manual OAuth/media checks.

### 4.6 Add a calendar view

1. Extend `CalendarViewMode`.
2. Add a component under `src/components/Calendar/` receiving the same handler
   props as the existing views.
3. Add the switch case in `App.tsx` and the mode button in `CalendarHeader`.
4. Update navigation step logic in `handlePrev`/`handleNext`.
5. Preserve the drag payload contract (`application/x-relate-post` + `text/plain`)
   so cards remain movable between views.

---

## 5. Coding conventions

- **Types first.** Shared shapes belong in `src/types/index.ts`; platform facts in
  `src/constants/platforms.ts`. Avoid inline duplicated literals.
- **Relative imports** inside `src/` (`../`, `../../`). The `@` alias exists but
  points at the repo root and is unused.
- **Components:** `export const Name: React.FC<Props>` with a local props
  interface; modal-local state stays in the modal.
- **Styling:** Tailwind utilities inline, arbitrary brand colors, small type
  scale (10–14 px), 8/12 px radii, `.relate-card` for blue-tinted panels.
- **Feedback:** toasts in `App`, inline banners in modals; no alert library.
  `window.confirm` is used only for clearing the media library.
- **Dates/times:** strings `YYYY-MM-DD` / `HH:mm`; avoid introducing a date
  library unless it replaces the current inconsistent math.
- **Backend:** plain Express, JSON errors `{ error: string }`, success payloads as
  documented in 02/04, no ORM, no router split. Keep provider sections grouped
  with `// ----------` headers.
- **Errors:** provider errors are caught per callback and rendered in the callback
  page; verify errors return 502; validation errors return 400.
- **Comments:** sparse; backend section headers and a few "why" comments only.
- **Before finishing a change:** `npm run lint`, `npm run build`, and a manual
  pass through the affected flow (OAuth, media, calendar, simulator). No tests
  will catch regressions for you.

---

## 6. Change checklist

For any non-trivial change:

- [ ] Does it touch OAuth, tokens or secrets? Re-read 02 §9 and run the OAuth
      checklist in 05 §6.
- [ ] Does it touch media? Verify server mode **and** backend-down fallback.
- [ ] Does it touch posts? Confirm localStorage survives reload and old posts
      still render.
- [ ] Does it add a platform? Every mapping table must be updated (types,
      constants, icon, server, settings).
- [ ] Does it claim to publish? It does not, unless a real backend call was added.
- [ ] Did `npm run lint` and `npm run build` pass?
- [ ] Were the docs (`README.md`, `docs/platform-setup.md`, this knowledge base)
      updated with the new behaviour or limitation?
