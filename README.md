# Relate Social — Multi-Platform Social Scheduler & Calendar

A visual drag-and-drop social media calendar with per-platform customization, a
universal media library, and **real OAuth connections** to Instagram, Facebook,
Threads, TikTok and YouTube. Preview every post through authentic in-app device
simulators before scheduling.

> **Publishing is real for Instagram and Threads.** The backend creates the
> media container, waits for the platform to finish processing, publishes, and
> records the post id, permalink, or the provider's exact error in
> `<data dir>\logs\publish.jsonl`. A scheduler publishes at the scheduled time
> (backend local clock, 2-hour late grace, 3 retries with backoff). "Publish
> now" sends immediately. TikTok, YouTube and Facebook pages are still
> schedule-only — the app never pretends to have posted to them.
>
> Two prerequisites for a live publish: the media file must sit in shared
> storage (uploaded through the app or picked from the local library), and
> `PUBLIC_MEDIA_BASE_URL`/`APP_URL` must point at a public HTTPS address,
> because Meta downloads the file itself. See
> [docs/platform-setup.md](docs/platform-setup.md) for the tunnel setup and the
> "API access blocked" error.

> **Working on this repo (human or AI)?** Start with the
> [repository knowledge base](docs/knowledge-base/README.md) — architecture,
> backend/OAuth internals, frontend flows, data contracts, known gaps and recipes.

---

## Features

- **Calendar views** — month / week / day, drag-and-drop scheduling.
- **Unified composer** — one caption + hashtags, per-platform overrides, media attachments.
  Threads also publishes **Text Threads** (channel format "Text Thread") — no file needed,
  and they work even without a public media URL; other channels still require media.
- **Bulk campaign builder** — schedule a series across platforms in one pass.
- **Device simulators** — see how a post renders on Instagram, Facebook, Threads, TikTok and YouTube.
- **Universal media library** — files stored on disk outside the project, organized by
  `YYYY-MM-DD` folders and shared across every browser/port/build.
- **Local folder scanner** — browse the machine's folders in the app, use the native OS folder picker, or paste a path
  (Windows, macOS, Linux) and browse subfolders and media in place (files are never
  copied or moved). The grid has type filters and sort controls.
- **Media preview** — click any asset for a full-size lightbox with metadata, video
  playback and arrow-key navigation; videos get generated poster thumbnails in the grid.
- **Cached thumbnails** — images are resized once with `sharp` and cached as WebP on
  disk, so large folders never load full-resolution files into the grid.
- **Live platform connections** — OAuth login, server-side token exchange, automatic
  refresh (TikTok / YouTube / Threads / Instagram Login) and a real "Test API
  Connection" handshake.
- **Multiple Instagram accounts** — connect several Instagram Login accounts, switch
  the active one in Settings, and pick a specific account per post in the composer.

## Architecture

```
Browser (React + Vite :3000)
   │  /api/*  and  /auth/*  (Vite dev proxy)
   ▼
OAuth backend (Express, server.ts, :8787)
   ├─ Meta Graph API v26          (Facebook Pages + Instagram via Page)
   ├─ Instagram API               (Instagram Login, graph.instagram.com)
   ├─ Threads API                 (graph.threads.net)
   ├─ TikTok Open API v2          (OAuth 2.0 + PKCE)
   └─ YouTube Data API v3         (Google OAuth 2.0)
        │
        ├─ .secrets/connections.json      tokens (git-ignored, never sent to the browser)
        └─ %LOCALAPPDATA%\RelateSocial\media\YYYY-MM-DD\...   media files
```

- App secrets stay **only** in the backend (`.env` + disk); the UI receives masked tokens.
- OAuth pops open in a **new tab**; the app detects success, cancel (tab closed),
  or timeout and reports the outcome.
- Meta requires HTTPS callbacks; see [Exposing the app over HTTPS](#exposing-the-app-over-https).

## Getting started

**Requirements:** Node.js 20+ (developed on Node 24) and pnpm 12 (pinned via `packageManager`).
Video conversion ships with the app: `@ffmpeg-installer/ffmpeg` + `@ffprobe-installer/ffprobe`
bundle the binaries per platform, so no system ffmpeg install is needed (a system `ffmpeg` is
used as fallback only).

```bash
pnpm install
cp .env.example .env        # Windows: copy .env.example .env
# fill in the platform credentials (see docs/platform-setup.md)
pnpm dev:server             # terminal 1 — OAuth backend on :8787
pnpm dev                    # terminal 2 — Vite on :3000
```

Open the app → header **API Keys** → connect a platform → **Test API Connection**.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public base URL used to build OAuth callbacks (`http://localhost:3000` or your HTTPS tunnel) |
| `META_APP_ID` / `META_APP_SECRET` | Meta app with Facebook Login (Pages + Instagram via Page) |
| `META_GRAPH_VERSION` | Graph API version (default `v26.0`) |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` | Meta app with the Threads API (falls back to `META_*`) |
| `IG_APP_ID` / `IG_APP_SECRET` | App with Instagram Login (falls back to `THREADS_*`) |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok app credentials (sandbox keys for development) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client for YouTube |
| `OAUTH_SERVER_PORT` | Backend port (default `8787`) |
| `RELATE_DATA_DIR` | Optional override for the media/data directory |

Full registration walkthrough — including redirect URIs and tester roles — is in
[docs/platform-setup.md](docs/platform-setup.md).

## Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Vite dev server on `:3000` (proxies `/auth` and `/api` to the backend) |
| `pnpm dev:server` | OAuth backend with auto-reload (`tsx watch server.ts`) |
| `pnpm build` | Production build of the frontend |
| `pnpm build:server` | Bundle the backend to `server.js` (esbuild, ESM) |
| `pnpm start` | Run the bundled backend (`node server.js`) |
| `pnpm preview` | Preview the production build |
| `pnpm lint` | TypeScript type check (`tsc --noEmit`) |
| `pnpm clean` | Remove `dist/` |

## Data locations

| What | Where |
| --- | --- |
| OAuth tokens | `.secrets/connections.json` (git-ignored, file mode 600) |
| In-flight OAuth state | `.secrets/oauth-states.json` |
| Media files | `%LOCALAPPDATA%\RelateSocial\media\YYYY-MM-DD\` (override with `RELATE_DATA_DIR`) |
| Scanned folder list | `%LOCALAPPDATA%\RelateSocial\library-roots.json` |
| Thumbnail cache | `%LOCALAPPDATA%\RelateSocial\thumbnails\` (safe to delete; regenerated on demand) |
| Browser-playable video cache | `%LOCALAPPDATA%\RelateSocial\streams\` (created by ffmpeg when a clip needs remuxing; safe to delete) |
| Scheduled posts | browser `localStorage` (`relate_social_scheduled_posts_v2`) |
| Media fallback (without backend) | IndexedDB `RelateSocialMediaDB` |

Media endpoints: `GET /api/storage/info`, `GET /api/storage/media/dates`,
`GET /api/storage/media?date=YYYY-MM-DD`, `GET|POST|DELETE /api/storage/media`,
`GET /api/storage/thumbnail?date=YYYY-MM-DD&name=<file>&w=480`.
Only folders named `YYYY-MM-DD` are scanned; uploads are limited to
jpg/jpeg/png/webp/gif/mp4/webm/mov up to 1 GB.

Folder browsing endpoints: `GET /api/fs/dirs` (lists one folder, scoped to the
browse roots), `GET /api/fs/folder-picker` (reports whether this computer has
a native folder dialog).

Post & publish endpoints (the live schedule is `posts.json` on the server):
`GET /api/posts`, `GET|PUT|DELETE /api/posts/:id`, `POST /api/posts` (single
creation — accepts inline base64 media for small files and `publish: true` to
deliver immediately instead of waiting for the scheduled time),
`POST /api/posts/sync` (bulk import of browser-held posts),
`POST /api/posts/:id/publish|unpublish|validate|reset-platform|refresh-links`,
`GET /api/publish/log`, `GET /api/publish/readiness`.
Status semantics to know (especially as an API client): only **Instagram and
Threads** are sent by this build. A post whose targets are all other platforms
is rejected outright when created with `publish: true` (400), and if it
publishes anyway (scheduled or mixed targets), every platform records
`skipped` and the overall status becomes **`failed` — meaning "all platforms
skipped", not "a transient error"; retrying will not help.** Check
`results[platform].status` to tell the two apart.
Full request/response shapes for every route: [`docs/openapi.yaml`](docs/openapi.yaml).

Local folder endpoints: `GET|POST /api/library/roots`, `DELETE /api/library/roots/:id`,
`GET /api/library/list?root=<id>&path=<relative>`, `GET /api/library/file?root=<id>&path=<relative>`(range requests supported for video), `GET /api/library/thumbnail?root=<id>&path=<relative>&w=480`,
`GET /api/library/video-thumbnail?root=<id>&path=<relative>&w=480&t=<seconds>`,
`GET /api/library/stream?root=<id>&path=<relative>` (browser-playable copy; `202` while converting),
`GET /api/library/stream/status?root=<id>&path=<relative>` (`original` | `converting` + `percent` | `ready` | `failed`),
`POST /api/library/pick-folder` (opens the native folder dialog on the machine running the
backend). Device folder import: `POST /api/imports?collection=<name>&path=<relative path>`
(raw bytes; files land in `<DATA_DIR>/imports/<collection>/<path>` and the collection is
auto-registered as a library root), `GET /api/imports` (collection summaries),
`GET /api/imports/files` (flattened media list — merged into the **Stored** tab, because
imported media is server-held data) and `DELETE /api/imports?collection=&path=` (one file).
Access gate:
`POST /gate/login`, `GET /api/gate/status` (both exempt from the gate itself). The same `thumbnail` / `video-thumbnail` / `stream` / `stream/status` set exists under `/api/storage/*`.

How the two library tabs divide work across devices: **Stored** lists everything the
server physically holds — uploads in the date folders plus all imported collections —
and is identical on every device. **Local Folders** browses the accessing device's own
situation: on the computer running the app it shows that machine's indexed folders; on
any other device it offers "Import folder from this device" instead, because the
server's private folders stay private and the phone's own files can only reach the
library by being copied up.

Clips that Chrome cannot decode are converted once and cached in
`%LOCALAPPDATA%\RelateSocial\streams\`: HE-AAC / xHE-AAC audio is remuxed to AAC-LC (this is
what makes the player's volume control usable), and HEVC/other video is re-encoded to H.264.
Conversion runs in the background — `GET .../stream` answers `202 converting` right away and
`GET .../stream/status` reports progress, so the preview shows "Converting for playback · %"
instead of timing out through the dev proxy or the tunnel. The backend logs which ffmpeg it
picked at startup.

## Exposing the app over HTTPS

Meta and TikTok require HTTPS redirect URIs. During development, a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
maps a stable subdomain to the local Vite server:

```bash
cloudflared tunnel login
cloudflared tunnel create relate-social
cloudflared tunnel route dns relate-social <your-subdomain>.<your-domain>
cloudflared tunnel run relate-social
```

Then set `APP_URL="https://<your-subdomain>.<your-domain>"` and register
`https://<your-subdomain>.<your-domain>/auth/<provider>/callback` in each provider's
dashboard. Keep the backend, Vite and the tunnel running while testing.

## Keyboard shortcuts

The shortcut layer is idle while you are typing in a field or a dialog is open.

| Key | Action |
| --- | --- |
| `m` / `w` / `d` | Month / week / day view |
| `←` / `→` | Previous / next period |
| `t` | Jump to today |
| `n` | New post at today |
| `l` | Media library |
| `b` | Bulk campaign |
| `s` | API connections |
| `Tab` | Move focus |
| `Enter` | Activate the focused item |
| `Esc` | Close the topmost dialog |
| `?` | Shortcut help |

## Security notes

- Never commit `.env`, `.secrets/`, or tunnel credentials — all are git-ignored.
- Set `APP_PASSWORD` in `.env` to require a password before any device (other
  laptops, phones, anything reaching the port) can use the app. Sessions last
  30 days; changing the password invalidates them. Over plain HTTP this deters
  casual access only — it is not protection over the internet.
- The frontend only ever sees masked tokens; all secret-bearing calls happen in `server.ts`.
- OAuth `state` values are persisted server-side and consumed once.
- Disconnect from the settings modal deletes the stored tokens on the backend.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Invalid Scopes" from Facebook | Wrong App ID, or the app lacks the Facebook Login use case / Business type |
| "Given URL is not allowed" | Redirect URI mismatch or missing App Domain (`Settings → Basic`) |
| Threads `1349245` | The account must accept the Threads tester invite |
| Instagram `Insufficient Developer Role` | Add the IG account as an Instagram tester and accept the invite |
| TikTok `non_sandbox_target` | Add the account under Sandbox → Target users, use sandbox client keys |
| `Invalid or expired OAuth state` | Restart the flow after backend reload |
| Media not visible | Backend must be running; otherwise the app falls back to IndexedDB |
| Thumbnails missing / full-size images in the grid | Run `pnpm install` (installs `sharp`) and restart the backend; check the thumbnail cache folder is writable |
| Native folder picker does not open on Linux | Install `zenity` or `kdialog`; paste the folder path as a fallback |
| Volume control greyed out in the preview | The clip uses HE-AAC/xHE-AAC audio, which Chrome cannot decode. The backend converts it on first play — check `pnpm dev:server` logs `video conversion: bundled ffmpeg`; if it says disabled, run `pnpm install` and restart |
| "This video could not be played" for an HEVC clip | The browser cannot decode HEVC; open the clip again so `/api/library/stream` can produce the cached H.264 copy (large files take longer) |
