# 06 — Known Gaps, Security Notes, Recipes, Conventions

Scope: what is intentionally unfinished, what is currently wrong, how to change
the system safely, and the conventions the codebase follows.

---

## 1. Publishing is a simulation

There is no delivery path anywhere in the repository:

- No backend route publishes content.
- `handlePublishNow` (`src/App.tsx:203-223`) only flips `status` to `published`
  and adds canned metrics.
- The composer seeds new posts with random metrics.
- The simulator's "Simulate Instant Publish" calls that handler.

Therefore: "Scheduled" and "Published" are **local labels**, not facts about the
platforms. Any work that says "schedule/publish to Instagram/TikTok/YouTube"
requires new backend capability, not just UI wiring.

Minimum work needed:

1. A publish endpoint that loads the right token (`store.meta` page token,
   `store.instagram`, `store.threads`, `store.tiktok`, `store.youtube`) and calls
   the real platform API.
2. Media accessible to the backend: server-managed files under the date folders,
   or an upload step. Blob URLs in posts are not usable server-side.
3. Per-platform result handling (success/partial/failure), retries, and status
   persistence beyond `localStorage` if this leaves a single browser.
4. Authentication in front of the publish endpoints.
5. A scheduler/job runner if posts should publish at their scheduled time rather
   than on demand.

Platform API outline (verify against current provider docs before implementing):
Meta/Instagram use a create-container → publish sequence; Threads publishes a
threads container; TikTok initializes an upload then posts the video; YouTube uses
`videos.insert` (resumable for large files).

---

## 2. Known defects and quirks

| # | Issue | Location | Impact | Notes |
| --- | --- | --- | --- | --- |
| 1 | Uploaded media keeps a `blob:` URL in posts; server response is ignored | `src/utils/mediaStorage.ts:43-76,122-150`; composer `:172-204` | Post thumbnails/simulator media break after reload | Highest-impact data bug; see recipe §4.1 |
| 2 | "Today" is hardcoded to 2026-10-21 | `src/App.tsx:277` | Today button jumps to a fixed date | One-line fix |
| 3 | Library "Schedule Post" ignores the selected item | `src/App.tsx:466-472` | Opens a blank composer; chosen media not attached | Needs a prop to seed media |
| 4 | Bulk builder hardcodes overrides for IG/TikTok/YouTube and a default start date | `src/components/BulkUpload/BulkCampaignModal.tsx:48,157-176` | Overrides exist for unselected channels; captions are canned; dates may surprise | Overrides are harmless when unselected but misleading |
| 5 | Bulk format never becomes `carousel` | same file, `:153` | Multi-file batches produce separate image/video posts | One media per post by design |
| 6 | Date handling mixes local dates and `toISOString()` | `MonthView.tsx:40,55,83`; `WeekView.tsx:47`; `DayView.tsx:29` | Cells/columns can shift by one day depending on timezone/time of day | Current-month cells are formatted manually (safe); adjacent-month and week cells are not |
| 7 | Overrides snapshot base values at first edit | `UnifiedComposerModal.tsx:228-247` | Later base caption/hashtag changes do not flow into already-edited channels | Expected but easy to mistake for a bug |
| 8 | Simulator keeps the previously selected platform across openings | `DeviceSimulatorModal.tsx:25-27`; `DeviceSimulator.tsx:38` | Wrong chrome can show for a newly opened post | Props are used after mount, but initial state is one-time |
| 9 | `/api/health` reports Threads config from Meta credentials | `server.ts:809` | Cosmetic; fallback makes it equivalent in practice | Use `THREADS_*` for correctness |
| 10 | Graph version documentation mismatch | `server.ts:10` (`v26.0`) vs `.env.example:16` (comment `v25.0`) | Confusion only | Runtime env wins |
| 11 | Upload progress is simulated | `UnifiedComposerModal.tsx:161-198` | Progress bar is not real network progress | Intentional UI effect |
| 12 | Validation is minimal | composer/bulk | Empty captions, no media, over-limit captions can be saved | Limits are display-only |
| 13 | Media deletion does not clean posts | `MediaLibraryModal.tsx:76-82` | Posts keep broken references | Also true of "Clear All" |
| 14 | Manifest import prepends without dedupe; may import `data:` URLs | `MediaLibraryModal.tsx:88-107` | Duplicates, localStorage bloat | No validation or size cap |
| 15 | `serverMode` cached for the page lifetime | `mediaStorage.ts:13,25-28` | Backend started after page load is not detected | Reload the page |
| 16 | Card media badge uses `post.format`, not the file MIME | `PostCard.tsx:48-50` | Misleading icon when format/media disagree | Cosmetic |
| 17 | Test result can mark a connected IG as disconnected if no Page IG is found | `ApiSettingsModal.tsx:247-261` | UI-only; reopening the modal re-syncs | Warning path returns `ok:false` |
| 18 | Disconnecting Facebook also removes Instagram-via-Page | shared `meta` group | May surprise users | Standalone IG is unaffected |
| 19 | Unused dependencies: `@google/genai`, `motion`; unused helpers `fileToBase64`, `detectMediaType`; unused `BulkCampaignSeriesConfig` | `package.json`, `mediaStorage.ts:252`, `mediaUtils.ts:23`, `types/index.ts:90` | Dead weight / misleading metadata | `metadata.json` claims a Gemini capability that is not implemented |
| 20 | Tailwind utilities from absent plugins | various components | `animate-in`, `fade-in`, `slide-in-from-bottom-3`, `scrollbar-none`, `scrollbar-thin`, `xs:` do nothing | Cosmetic; `animate-spin`/`pulse` work |
| 21 | No production backend build/start | `package.json` | `build` emits frontend only; `clean` removes a non-existent `server.js` | Run with `tsx` |
| 22 | Backend has no auth, binds all interfaces | `server.ts:935` | Anyone reaching it can read state, disconnect accounts, read/write media | Local-only assumption |
| 23 | Callback HTML does not escape provider detail; receiver accepts any origin | `server.ts:100-108`; `ApiSettingsModal.tsx:124-142` | Potential XSS in an origin-served callback page; weak postMessage validation | Harden if exposed |
| 24 | OAuth state file is plaintext | `.secrets/oauth-states.json` | Contains state + PKCE verifier while a flow is in flight | Short-lived |

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

### 4.4 Add real publishing

Suggested backend shape:

```http
POST /api/publish
{ "platform": "instagram", "caption": "...", "media": ["2026-10-23/hero.png"] }
→ { "ok": true, "platformPostId": "…" } | { "ok": false, "error": "…" }
```

Implementation rules:

- Resolve credentials by group; use `freshAccessToken` for refreshable groups.
- Use the **Page token** from `metaPages` for Facebook/Instagram-via-Page.
- Validate that media paths resolve inside the media root (reuse
  `resolveInMediaDir`).
- Return per-platform results; do not fail the whole batch because one channel
  failed.
- Add idempotency (post id + platform) to avoid duplicate publishing on retry.
- Add auth before exposing the route.
- Update the UI to show real results and only set `published` on confirmed
  success.

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
