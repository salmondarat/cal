# 01 — Architecture

Scope: how the two processes fit together, where configuration comes from, and
what happens on each important request. For provider specifics see
[02-backend-oauth.md](./02-backend-oauth.md).

---

## 1. Two processes, one origin

| Process | Entry | Default port | Responsibility |
| --- | --- | --- | --- |
| Frontend | `index.html` → `src/main.tsx` → `src/App.tsx` | `3000` | React SPA, all planning UI, localStorage posts |
| Backend | `server.ts` (`tsx watch`) | `8787` (`OAUTH_SERVER_PORT`) | Secrets, OAuth, token refresh, verification, media disk |

The browser only talks to **port 3000**. Vite proxies two prefixes to the
backend (`vite.config.ts:25-28`):

```ts
proxy: {
  '/auth': `http://localhost:${oauthPort}`,
  '/api':  `http://localhost:${oauthPort}`,
}
```

This is why every provider dashboard must register
`${APP_URL}/auth/<provider>/callback`, where `APP_URL` is normally
`http://localhost:3000` — **not** `:8787`.

CSS/UI assets are served by Vite; the backend serves no static files.

---

## 2. Configuration resolution

`server.ts` reads configuration once at module load (`server.ts:8-27`):

| Setting | Source | Default / fallback |
| --- | --- | --- |
| Backend port | `OAUTH_SERVER_PORT` | `8787` |
| Public base for callbacks | `APP_URL` | `http://localhost:3000` |
| Meta Graph version | `META_GRAPH_VERSION` | `v26.0` (`.env.example` documents `v25.0` — trust the running env) |
| Meta app | `META_APP_ID`, `META_APP_SECRET` | empty (flows return 400) |
| TikTok app | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | empty (flows return 400) |
| Google app | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty (flows return 400) |
| Threads app | `THREADS_APP_ID`, `THREADS_APP_SECRET` | falls back to `META_*` |
| Instagram Login app | `IG_APP_ID`, `IG_APP_SECRET` | falls back to `THREADS_*`, then `META_*` |
| Data directory | `RELATE_DATA_DIR` | `%LOCALAPPDATA%\RelateSocial` (or `~/AppData/Local/RelateSocial` when the variable is absent) |
| Media directory | derived | `<DATA_DIR>/media` |
| Token store | fixed | `.secrets/connections.json` |
| OAuth state store | fixed | `.secrets/oauth-states.json` |

Frontend build-time variables:

| Setting | Source | Effect |
| --- | --- | --- |
| `DISABLE_HMR` | process env | `'true'` disables HMR and file watching (AI Studio flicker guard) |
| Allowed hosts | hardcoded | `.localtest.me`, `.trycloudflare.com`, `.internalc.my.id` |

`vite.config.ts` also defines alias `@` → **repository root** (`path.resolve(__dirname, '.')`),
not `src/`. Existing source uses relative imports, so the alias is currently
unused. New code importing `@/src/...` would work; `@/components/...` would not.

---

## 3. Request lifecycles

### 3.1 App load

1. `main.tsx` mounts `App`.
2. `App` hydrates posts from `localStorage['relate_social_scheduled_posts_v2']`
   (`src/App.tsx:24-37`).
3. `getAllStoredMedia()` probes `GET /api/storage/info` with a 2 s timeout
   (`src/utils/mediaStorage.ts:15-28`).
   - Backend up → scan `/api/storage/media/dates` + each date list, returning
     server URLs.
   - Backend down → IndexedDB, then localStorage metadata.
4. The media probe result is cached in a module-level `serverMode` variable for
   the tab's lifetime. Starting the backend later requires a page reload.
5. Calendar renders. No posts are fetched from the server; posts are **local**.

### 3.2 OAuth connect (browser → provider → backend → browser)

```
Settings modal
  │ fetch('/auth/<provider>/start', {redirect:'manual'})   // config probe
  │ window.open('/auth/<provider>/start', '_blank')
  ▼
Express: build authorize URL, generate + persist state, 302 to provider
  ▼
Provider consent screen
  ▼
Provider redirects to APP_URL/auth/<provider>/callback
  ▼
Vite proxy → Express callback: consume state, exchange code, store token
  ▼
Express returns an HTML page that:
   • window.opener.postMessage({type:'relate-oauth', platform, ok, message}, '*')
   • closes itself after 1.5 s
  ▼
Settings modal detects success via postMessage OR by polling /api/connections
every 1.5 s (90 s timeout, also detects the user closing the tab).
```

There are **two independent success detectors** (`ApiSettingsModal.tsx:123-146`
and `:216-236`); whichever fires first clears the interval.

### 3.3 "Test API Connection"

`POST /api/verify/:platform` → backend loads stored token, refreshes if it
expires within five minutes, calls the platform identity endpoint, and returns
`{platform, ok, identity, ...}` or `{error}` with a 4xx/5xx status. The browser
renders the result inline; no token ever reaches the page.

### 3.4 Media upload

1. File input/drop → `validateFileSize` (≤ 1 GB, `src/utils/mediaUtils.ts:13-21`).
2. `processFileToMediaItem` creates an object URL and probes dimensions/duration.
3. `saveMediaItemToStorage`:
   - backend reachable → `POST /api/storage/media?date=YYYY-MM-DD&name=…` with
     the raw bytes;
   - otherwise IndexedDB, then localStorage metadata.
4. Backend sanitizes date/name, validates extension, streams bytes to disk,
   resolves filename collisions, returns the stored item.
5. **The in-memory `MediaItem` is not replaced by the server response** — see
   the URL lifecycle caveat in [04-data-and-storage.md](./04-data-and-storage.md).

### 3.5 Media read

`GET /api/storage/media/dates` → folder summaries.
`GET /api/storage/media?date=…` → file metadata with
`url: /api/storage/media/file?date=…&name=…`.
`GET /api/storage/media/file` streams from disk with `Cache-Control: no-cache`.

---

## 4. Design constraints and invariants

- **Single user, single machine.** No accounts, sessions, CSRF protection, or
  rate limiting. Treat the backend as a local helper, not a public service.
- **Secrets never enter the browser.** The client only receives masked tokens,
  account names/IDs and scopes.
- **State split.** Posts and UI state live in the browser; tokens and media live
  on the backend. There is no database.
- **OAuth state is single-use and durable.** Generated with `crypto.randomBytes(16)`,
  stored in a `Map` and mirrored to `.secrets/oauth-states.json` so `tsx watch`
  restarts do not break an in-flight flow (`server.ts:56-78`).
- **Platform identity is derived at connect time**, not entered by users. Account
  fields in Settings are read-only.
- **Publishing is out of scope.** Any change that implies scheduling jobs,
  queues, retries or delivery must introduce new backend capability.

---

## 5. Build and deployment shape

- `npm run build` → static `dist/` (frontend). There is no server bundler and no
  `npm start`; use `tsx server.ts` (or compile it yourself) for the backend.
- The dev topology assumes **one origin**: Vite (or a static host) must forward
  `/api` and `/auth` to Express. The repository does not include a production
  reverse proxy config.
- HTTPS is required by Meta and TikTok for non-localhost callbacks. The documented
  approach is a named Cloudflare Tunnel to `localhost:3000`
  (`docs/platform-setup.md`), with `APP_URL` set to the tunnel origin.
- Tunnel hostnames outside the hardcoded `allowedHosts` list are rejected by Vite
  until added to `vite.config.ts`.
- `.secrets/` and `.env*` (except `.env.example`) are git-ignored. `dist/`,
  `node_modules/`, `coverage/`, `*.log` are ignored as well. `.aistudio/` is
  ignored too.
