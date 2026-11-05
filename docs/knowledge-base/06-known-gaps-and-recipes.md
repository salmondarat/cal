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
- Both publish entry points (`POST /api/posts` with `publish:true` and
  `POST /api/posts/:id/publish`) refuse with `400` when none of the selected
  platforms are supported by this build, so an all-`skipped` run can no longer
  be started deliberately. An all-skipped post also gets no retry backoff —
  only `failed` results schedule a `nextTryAt`.
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
| 1 | Media uploaded while the backend is down still keeps a `blob:` URL | `src/utils/mediaStorage.ts` | Post thumbnails break after reload; such posts cannot publish | Composer blocks publishing for non-`serverManaged` items; a load-time migration repoints saved `blob:` posts at library matches by name+size (`src/App.tsx`); backend-down uploads remain unfixable until the file is re-uploaded |
| 2 | ~~"Today" was hardcoded to 2026-10-21~~ fixed | `src/App.tsx` `handleToday` | — | Now `new Date()` |
| 3 | ~~Library "Schedule Post" ignored the selected item~~ fixed | `src/App.tsx` `onSelectMediaForPost` | — | Composer now receives `initialMedia` and seeds it |
| 4 | Bulk builder hardcodes overrides for IG/TikTok/YouTube and a default start date | `src/components/BulkUpload/BulkCampaignModal.tsx:157-176` | Overrides exist for unselected channels; captions are canned; dates may surprise | Overrides are harmless when unselected but misleading |
| 5 | Bulk format never becomes `carousel` | same file, `:153` | Multi-file batches produce separate image/video posts | One media per post by design |
| 6 | Date handling still mixes local dates and `toISOString()` in a few places | `MonthView`/`WeekView`/`DayView` now use `localDateString()`; composer picker fixed | Cells could shift by a day | Scheduler compares against `publishAt` computed in the backend's zone (`timezone` is stored per post) |
| 7 | Overrides snapshot base values at first edit | `UnifiedComposerModal.tsx` | Later base caption/hashtag changes do not flow into already-edited channels | Expected but easy to mistake for a bug |
| 8 | ~~Simulator kept the previously selected platform across openings~~ fixed | `DeviceSimulatorModal.tsx` | — | Selection resets when the modal opens or the post changes |
| 9 | `/api/health` reports Threads config from Meta credentials | `server.ts` | Cosmetic; fallback makes it equivalent in practice | Use `THREADS_*` for correctness |
| 10 | ~~Graph version documentation mismatch~~ fixed | `server.ts` vs `.env.example` | — | Both now `v26.0`; runtime env still wins |
| 11 | ~~Upload progress was simulated~~ fixed | `UnifiedComposerModal.handleFilesAdded` | — | Now counts real per-file uploads to `/api/storage/media` |
| 12 | Validation is now enforced at save/publish | composer `blockingIssues`, `buildCaption`, `validatePost` | Over-limit captions, browser-only media and empty media are rejected | Drafts still save without media |
| 13 | Media deletion does not clean posts | `MediaLibraryModal.tsx` | Posts keep broken references | Publish then fails with "not in shared media storage" |
| 14 | ~~Manifest import prepended without dedupe~~ fixed | `MediaLibraryModal.tsx` | — | Import validates entries, skips dead `blob:` URLs, dedupes by id, and reports what was dropped |
| 15 | ~~`serverMode` was cached for the page lifetime~~ fixed | `mediaStorage.ts` | — | Success stays sticky; a failed probe retries after 10 s, so a later-started backend is picked up without reload |
| 16 | ~~Card media badge used `post.format`, not the file MIME~~ fixed | `PostCard.tsx` | — | Badge falls back to the first media item's MIME |
| 17 | Test result can mark a connected IG as disconnected if no Page IG is found | `ApiSettingsModal.tsx` | UI-only; reopening the modal re-syncs | Instagram Login path returns early, so this now only affects Page-based setups |
| 18 | Disconnecting Facebook also removes Instagram-via-Page | shared `meta` group | May surprise users | Standalone IG is unaffected |
| 19 | ~~Unused dependencies and helpers~~ fixed | `package.json` | — | `@google/genai`, `motion`, `fileToBase64`, `detectMediaType` and the false Gemini capability claim removed |
| 20 | Tailwind utilities from absent plugins | various components | `animate-in`, `fade-in`, `slide-in-from-bottom-3`, `scrollbar-none`, `scrollbar-thin`, `xs:` do nothing | Cosmetic; `animate-spin`/`pulse` work |
| 21 | ~~No production backend build/start~~ fixed | `package.json` | — | `pnpm build:server` bundles `server.js` (ESM, external packages); `pnpm start` runs it |
| 22 | Backend has no real auth, binds all interfaces | `app.listen(PORT)` | Anyone reaching the port can publish, delete posts, read/write media | Optional `APP_PASSWORD` gate (session cookie + login screen) added as a LAN deterrent; it is not TLS and not internet-grade. Publishing routes make real-account actions |
| 23 | Callback HTML now escapes provider detail; receiver still accepts any origin | `server.ts` `callbackHtml` | Receiver side is the residual risk | `postMessage` origin cannot be pinned while `APP_URL` may differ from the opener's origin (tunnel vs localhost) |
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
11. **Folder browsing enumerates the filesystem** — `GET /api/fs/dirs` lists
    directories on the machine running the backend. It is scoped to *browse
    roots* (the home folder plus real mount points, or exactly
    `MEDIA_BROWSE_ROOTS`), and it refuses requests from another device unless
    `MEDIA_BROWSE_REMOTE=1`. The locality check reads the `Host` header,
    which is a guarding rail against accidental exposure, **not
    authentication** — anyone who can send raw requests to the port can forge
    it. Set `MEDIA_BROWSE=0` in any hosted deployment: there the endpoint
    would enumerate a container's filesystem, which may be shared with other
    tenants.

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

### 4.3 Point the media library at a folder

The library panel offers three ways to add a folder, and they are not
interchangeable:

- **Browse folders…** — the server lists directories and the browser renders
  them. This is the one that works everywhere: another device, a headless
  server, a desktop. The path it returns is a real path on the machine
  running the backend, and the media is referenced in place — nothing is
  copied.
- **Use system dialog** — the native OS folder chooser (zenity, kdialog,
  GTK4, the desktop portal, `osascript`, PowerShell). It appears only when
  the server reports a backend **and** the page is on the server's own
  machine, because the dialog opens on the server's screen, not on the
  phone's. If no backend exists the button is simply absent.
- **Paste a path** — always available, and the way in when browsing is
  turned off or the folder is not under a browse root.

To widen or narrow what can be browsed:

- `MEDIA_BROWSE_ROOTS` — a list of paths (`os.path.delimiter` separated).
  When set, it is the *entire* allowlist: the home folder is not added
  implicitly.
- `MEDIA_BROWSE=0` — turns the browser off entirely; pasting still works.
- `MEDIA_BROWSE_REMOTE=1` — lets another device browse. Off by default.

A volume in the Places list is a real mount point (read from
`/proc/mounts` on Linux), not any directory that happens to sit under
`/media` or `/mnt`.

### 4.4 Fix "Today"

`handleToday` should set the current date, for example:

```ts
const handleToday = () => setCurrentDate(new Date());
```

Use the same local-date convention as the calendar views when comparing dates.
Also consider deriving MonthView's "today" from local components rather than
`toISOString()`.

### 4.5 Adding a publishable channel (Instagram and Threads are done)

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

### 4.6 Add a platform

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

### 4.7 Add a calendar view

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
      constants, icon, server, settings). Publishing a new platform also means
      adding it to `SUPPORTED_PUBLISH` — until then both publish endpoints
      refuse posts that target only unsupported platforms.
- [ ] Does it claim to publish? Instagram and Threads are real; anything else
      records `skipped`. Never report success without a platform post id.
- [ ] Did you update `docs/openapi.yaml` when routes or body shapes changed?
- [ ] Do new HTTP tests pin `APP_PASSWORD=''` before importing the server?
      dotenv reads the developer's `.env`, and a live gate password breaks
      every HTTP test suite.
- [ ] Did `pnpm lint`, `pnpm test` and `pnpm build` pass?
- [ ] Were the docs (`README.md`, `docs/platform-setup.md`, this knowledge base)
      updated with the new behaviour or limitation?
