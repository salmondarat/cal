# Connecting real platform APIs (Meta, Threads, TikTok, YouTube)

> **This deployment** serves the app at `https://relate.internalc.my.id` through a
> named Cloudflare Tunnel (`relate-social` → `localhost:3000`). All callbacks below
> use `APP_URL`, so the dashboards must register the `https://relate.internalc.my.id/...`
> variants, not localhost. Keep `pnpm dev:server`, `pnpm dev`, and
> `cloudflared tunnel run relate-social` running while testing.

`server.ts` is a small local OAuth backend that owns all secrets and access tokens.
The browser never sees app secrets; the connection status of **all five platforms**
in **Settings → API connections** is read live from `/api/connections`.

Tokens are stored in `.secrets/connections.json` (git-ignored) and auto-refreshed
where the platform supports it (TikTok, YouTube, Threads). Meta user tokens are
long-lived (~60 days) and require reconnect on expiry/revocation — same approach
as Postiz.

## 1. Register Meta apps (Facebook + Instagram, and Threads as a separate app)

In Meta's current dashboard, use cases **cannot be combined** into one app: an app
created with "Facebook Login" cannot add the Threads API later ("Add more use
cases" only shows compatible ones). So create **two apps**:

**App A — "Relate Social" (Facebook Login):**
1. <https://developers.facebook.com/apps> → **Create App** → use case
   **"Authenticate and request data from users with Facebook Login"**.
   (Business step: "I don't want to connect a business portfolio yet".
   Requirements/App Review: skip — admins/testers get everything in Development mode.)
2. **Settings → Basic** → copy **App ID** / **App Secret** into `.env`
   (`META_APP_ID`, `META_APP_SECRET`).
3. **Facebook Login → Settings → Valid OAuth Redirect URIs**:
   ```
   http://localhost:3000/auth/meta/callback
   ```
4. Instagram works through this app via Page discovery
   (`/me/accounts?fields=instagram_business_account`) with `instagram_basic` —
   the IG professional account must be linked to a Page you administer.
   (The separate "Instagram API with Instagram Login" app type is NOT needed.)

**App B — "Relate Social Threads" (Threads API + Instagram Login):**
1. Create App again → use cases **"Access the Threads API"** and
   **"Manage messaging & content on Instagram"** (these two CAN share an app).
2. Copy its **App ID** / **App Secret** into `.env` as `THREADS_APP_ID`,
   `THREADS_APP_SECRET` (falls back to META_* if you leave them empty).
   `IG_APP_ID`/`IG_APP_SECRET` default to the same THREADS_* pair.
3. **Threads API → Valid OAuth Redirect URIs** (HTTPS required —
   `redirectmeto.com` proxies localhost):
   ```
   https://redirectmeto.com/http://localhost:3000/auth/threads/callback
   ```
4. **Instagram → Valid OAuth Redirect URIs** (Instagram Login):
   ```
   http://localhost:3000/auth/instagram/callback
   ```
5. **Threads API → App roles → Threads testers**: add your Threads account and
   **accept the invite in the Threads app/website**, otherwise consent is refused.
6. Scopes requested: `threads_basic`, `threads_content_publish`,
   `threads_manage_replies` and `instagram_business_basic`,
   `instagram_business_content_publish` — testers can grant these without App Review.

The **Instagram tab offers two connect options**: *Instagram Login* (log in with
the IG account itself, no personal Facebook account needed — token on
`graph.instagram.com`, refreshable via `ig_refresh_token`) or *Facebook Page*
(IG discovered through the Meta connection in App A). Both can coexist;
standalone wins in the tab status.

**Multiple Instagram accounts:** the app stores every Instagram Login account in
`.secrets/connections.json` (`instagramAccounts`, keyed by IG user id). To add one:

1. Register the account as an **Instagram tester** in App B and accept the invite
   from that Instagram account.
2. In the app, Instagram tab → **Add another account** (the authorize URL sends
   `force_reauth=true`, so the login screen always appears).
3. Accounts from a different account center may require a separate browser
   profile/incognito window; accounts in the same account center can be switched
   on the login screen.
4. Settings lists every account — **Use** sets the default (active) account, the
   composer's *Instagram account* dropdown sets it per post
   (`ScheduledPost.platformAccounts.instagram`).

For both apps: **App roles → Roles** — the creator is automatically Administrator,
which is enough; the "Create test users" (simulated accounts) page can be ignored,
especially while Meta shows "ability to create test users is disabled temporarily".

## 2. Register a TikTok app (Open API v2 — Display API)

1. <https://developers.tiktok.com/> → **Register an app** with a developer account.
2. App type **Web App**. Enable **Login with TikTok** and request scopes:
   `user.info.basic`, `video.list`, `video.publish`, `video.upload` (request them
   now even if posting comes later — otherwise every publish feature needs a new app).
3. Copy **Client key** / **Client secret** into `.env` (`TIKTOK_CLIENT_KEY`,
   `TIKTOK_CLIENT_SECRET`).
4. **Authorization → Redirect URI**, exactly:
   ```
   http://localhost:3000/auth/tiktok/callback
   ```
5. **Sandbox members**: until review, only listed test accounts can connect.
6. Notes: the backend uses OAuth v2 with **PKCE (S256)** automatically; the token
   response's **refresh_token is stored** and used on `Test API Connection` when
   the 24h access token expires. (If you later add Business API posting, that uses
   a *separate* app under `business-api.tiktok.com` — different client key.)

## 3. Register a Google Cloud OAuth client (YouTube)

1. <https://console.cloud.google.com/> → project → **APIs & Services → Library**
   → enable **YouTube Data API v3**.
2. **OAuth consent screen**: type **External**, add your account under **Test users**.
3. **Credentials → Create Credentials → OAuth client ID → Web application**,
   authorized redirect URI exactly:
   ```
   http://localhost:3000/auth/google/callback
   ```
4. Copy into `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. Scopes: `youtube.readonly` + `youtube.upload` (upload requested up front so
   publishing later won't force a re-consent).
6. `access_type=offline&prompt=consent` → a **refresh token is stored** and used
   automatically; expired 1-hour access tokens refresh silently on verify.

## 4. Connect every platform (in-app)

```bash
pnpm dev:server   # terminal 1 — OAuth backend :8787 (reload-safe state file)
pnpm dev          # terminal 2 — Vite :3000, proxies /auth + /api
```

Open the app → header **API Keys**, then per tab:

1. **Facebook** → *Connect via Meta OAuth* → approve → popup closes automatically.
2. **Instagram** — shares the Meta connection you just made; its tab turns green
   only if a Page with a connected IG account was found.
3. **Threads** → *Connect via Meta OAuth* (separate consent on threads.net).
4. **TikTok** → *Connect via TikTok OAuth*.
5. **YouTube** → *Connect via Google OAuth*.
6. On each tab click **Test API Connection** — it hits the real API
   (`/me` + pages/IG for Meta, `graph.threads.net/v1.0/me`, `user/info` for TikTok,
   `channels?mine=true` for YouTube) and prints the actual identity.

## Universal media storage (date folders)

Media uploaded through the app is stored **outside the project** so every build,
port, and browser shares one library:

```
%LOCALAPPDATA%\RelateSocial\media\YYYY-MM-DD\<original-filename>
```

- `YYYY-MM-DD` folders are the app's naming convention — `/api/storage/*` only
  scans folders matching that pattern and ignores anything else.
- Override the base directory with `RELATE_DATA_DIR` in `.env`.
- Frontend probes `/api/storage/info` on load: backend up → universal store
  (streamed from disk); backend down → per-browser IndexedDB fallback.
- Collisions get `-1`, `-2`… suffixes. Types: jpg/jpeg/png/webp/gif/mp4/webm/mov,
  max 1GB per file.

## Backend endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | which credentials are configured |
| `GET /api/connections` | masked live connection state (used by the modal) |
| `GET /auth/meta/start` → `/auth/meta/callback` | Meta OAuth (long-lived, `/me/permissions` recorded) |
| `GET /auth/threads/start` → `/auth/threads/callback` | Threads OAuth (`th_exchange_token`, 60-day) |
| `GET /auth/tiktok/start` → `/auth/tiktok/callback` | TikTok OAuth with PKCE + refresh token stored |
| `GET /auth/google/start` → `/auth/google/callback` | Google OAuth, refresh token stored |
| `POST /api/verify/:platform` | real handshake (auto-refreshes tiktok/youtube/threads) |
| `POST /api/disconnect/:platform` | `meta`, `threads`, `tiktok` or `youtube` |
| `GET/POST/DELETE /api/storage/...` | universal media (see above) |

## Troubleshooting

- **"Given URL is not allowed"** (Meta): redirect URI must match character for
  character, callback goes through Vite (:3000), never :8787.
- **Threads error about redirect**: the Threads product must list the
  `https://redirectmeto.com/...` URI, and your browser must allow the
  redirectmeto redirect (it's an HTTPS proxy for localhost).
- **TikTok `scope_permission_missed`**: the scope wasn't enabled on the app in
  the developer portal — add it there, then reconnect.
- **Empty Instagram list**: IG account not linked to any administered Page, or
  you connected with an account that isn't an app tester.
- **Meta "session has been invalidated"**: consent was revoked (password change,
  app permissions) — reconnect; FB/IG tokens are not auto-refreshed by design.
- **`invalid_rapt`** (Google, Workspace accounts): admin must approve the OAuth
  app; otherwise reconnect from a personal account.
