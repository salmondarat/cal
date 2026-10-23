# Relate Social — Multi-Platform Social Scheduler & Calendar

A visual drag-and-drop social media calendar with per-platform customization, a
universal media library, and **real OAuth connections** to Instagram, Facebook,
Threads, TikTok and YouTube. Preview every post through authentic in-app device
simulators before scheduling.

> Publishing to the platforms is **not implemented yet** — this build covers
> connecting accounts and verifying them against the real APIs.

---

## Features

- **Calendar views** — month / week / day, drag-and-drop scheduling.
- **Unified composer** — one caption + hashtags, per-platform overrides, media attachments.
- **Bulk campaign builder** — schedule a series across platforms in one pass.
- **Device simulators** — see how a post renders on Instagram, Facebook, Threads, TikTok and YouTube.
- **Universal media library** — files stored on disk outside the project, organized by
  `YYYY-MM-DD` folders and shared across every browser/port/build.
- **Live platform connections** — OAuth login, server-side token exchange, automatic
  refresh (TikTok / YouTube / Threads / Instagram Login) and a real "Test API
  Connection" handshake.

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

**Requirements:** Node.js 20+ (developed on Node 24), npm or pnpm.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
# fill in the platform credentials (see docs/platform-setup.md)
npm run dev:server          # terminal 1 — OAuth backend on :8787
npm run dev                 # terminal 2 — Vite on :3000
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
| `npm run dev` | Vite dev server on `:3000` (proxies `/auth` and `/api` to the backend) |
| `npm run dev:server` | OAuth backend with auto-reload (`tsx watch server.ts`) |
| `npm run build` | Production build of the frontend |
| `npm run preview` | Preview the production build |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npm run clean` | Remove `dist/` |

## Data locations

| What | Where |
| --- | --- |
| OAuth tokens | `.secrets/connections.json` (git-ignored, file mode 600) |
| In-flight OAuth state | `.secrets/oauth-states.json` |
| Media files | `%LOCALAPPDATA%\RelateSocial\media\YYYY-MM-DD\` (override with `RELATE_DATA_DIR`) |
| Scheduled posts | browser `localStorage` (`relate_social_scheduled_posts_v2`) |
| Media fallback (without backend) | IndexedDB `RelateSocialMediaDB` |

Media endpoints: `GET /api/storage/info`, `GET /api/storage/media/dates`,
`GET /api/storage/media?date=YYYY-MM-DD`, `GET|POST|DELETE /api/storage/media`.
Only folders named `YYYY-MM-DD` are scanned; uploads are limited to
jpg/jpeg/png/webp/gif/mp4/webm/mov up to 1 GB.

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

## Security notes

- Never commit `.env`, `.secrets/`, or tunnel credentials — all are git-ignored.
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
