# 02 — Backend: OAuth, Tokens, Verification, Media API

Scope: `server.ts` (942 lines). It is the only server-side code in the repository
and owns every secret-bearing operation.

---

## 1. Structure

| Region | Lines | Content |
| --- | --- | --- |
| Config & constants | 1–27 | Ports, app IDs, Graph version, fallback chains |
| Token store | 29–54 | `StoredConnection`, `loadStore`, `saveStore` |
| OAuth state | 56–78 | In-memory map + durable `.secrets/oauth-states.json` |
| Helpers | 80–126 | Token masking, config guard, callback HTML, public connection view |
| Meta | 128–249 | Facebook + Instagram-via-Page |
| TikTok | 251–320 | OAuth 2.0 + PKCE |
| YouTube | 322–394 | Google OAuth 2.0 |
| Threads | 396–478 | Threads API |
| Instagram Login | 480–556 | Standalone Instagram flow |
| Media storage | 558–738 | Date-folder disk store and endpoints |
| Refresh | 740–800 | `needsRefresh`, `freshAccessToken` |
| Shared API | 802–933 | health, connections, verify, disconnect |
| Listen | 935–942 | Startup logs and missing-credential warnings |

There is no router module, middleware layer, database, or test file. Sections
are separated by `// ----------` comments.

---

## 2. Token store

File: `.secrets/connections.json`, created with mode `0600` (best-effort; Windows
does not enforce POSIX modes). `saveStore` rewrites the whole JSON object.

```ts
interface StoredConnection {
  accessToken: string;
  tokenType: string;              // meta_long_lived_user | tiktok_access_token |
                                  // google_oauth | threads_long_lived_user | ig_long_lived_user
  expiresAt?: number;             // epoch ms
  accountIds: string[];
  accountNames: string[];         // display names / @handles
  scopes: string[];               // granted scopes
  connectedAt: string;            // ISO
  refreshToken?: string;          // TikTok, YouTube, (not Meta/Threads/IG)
  metaPages?: { id; name; accessToken; instagramId?; instagramUsername? }[];
}
```

Store keys (`type Store`): `meta`, `tiktok`, `youtube`, `threads`, `instagram`.
Facebook has **no key of its own** — it is `meta`. Instagram can exist twice:
inside `meta.metaPages[].instagram*` (Page-linked) and as `instagram`
(standalone Login).

`publicConnections()` (`server.ts:110-126`) strips `accessToken`, `refreshToken`
and `metaPages`, returning only:

```ts
{ connected: true, maskedToken, accountIds, accountNames, scopes,
  connectedAt, expiresAt }
```

Masking (`server.ts:80-83`): tokens ≤ 12 chars → first 3 + `...`; longer → first 8
+ `...` + last 4.

---

## 3. Endpoint reference

| Method + path | Purpose | Auth |
| --- | --- | --- |
| `GET /api/health` | Which credentials are configured, Graph version, redirect base | none |
| `GET /api/connections` | Masked live connection state for all groups | none |
| `GET /auth/meta/start` → `/auth/meta/callback` | Facebook Login (Pages + IG via Page) | none |
| `GET /auth/threads/start` → `/auth/threads/callback` | Threads OAuth | none |
| `GET /auth/instagram/start` → `/auth/instagram/callback` | Standalone Instagram Login | none |
| `GET /auth/tiktok/start` → `/auth/tiktok/callback` | TikTok OAuth + PKCE | none |
| `GET /auth/google/start` → `/auth/google/callback` | Google OAuth (YouTube) | none |
| `POST /api/verify/:platform` | Real identity handshake; refreshes if needed | none |
| `POST /api/disconnect/:platform` | Delete one stored connection group | none |
| `GET /api/storage/info` | Data dir, counts, 1 GB cap | none |
| `GET /api/storage/media/dates` | `[{date, files, bytes}]`, newest first | none |
| `GET /api/storage/media?date=…` | File metadata for one date folder | none |
| `GET /api/storage/media/file?date=&name=` | Stream a file | none |
| `POST /api/storage/media?date=&name=` | Raw-body upload | none |
| `DELETE /api/storage/media?date=&name=` | Delete a file | none |
| `GET /api/public-media/:token` | HMAC-signed media link (6h) for Meta to download | signature |
| `GET /api/posts` · `GET /api/posts/:id` | Server-side schedule with delivery state + warnings | none |
| `PUT /api/posts/:id` | Create/update a post (status is only `draft` or `scheduled`) | none |
| `POST /api/posts/sync` | Bulk-import posts from a browser's localStorage | none |
| `DELETE /api/posts/:id` | Remove from the schedule (does not unpublish) | none |
| `POST /api/posts/:id/publish` | Start a delivery job; replies `202`, poll the post | none |
| `POST /api/posts/:id/validate` | Pre-flight checks without sending | none |
| `POST /api/posts/:id/unpublish` | Delete published media from Instagram/Threads | none |
| `GET /api/publish/log?limit=&postId=` | Tail of `logs/publish.jsonl` | none |
| `GET /api/publish/readiness` | Public URL probe, scheduler config, connected accounts | none |

Accepted `:platform` values for verify: `facebook`, `instagram`, `threads`,
`tiktok`, `youtube`. For disconnect: `meta`, `instagram`, `threads`, `tiktok`,
`youtube`.

Delivery state lives in `<RELATE_DATA_DIR>/posts.json`; the scheduler ticks every
`SCHEDULE_TICK_SECONDS` (20) and publishes posts whose `publishAt` has passed,
unless they are more than `SCHEDULE_GRACE_MINUTES` (120) late — those are marked
`failed`. `server.ts` groups all of this under `Publishing` section headers.

`GET /api/health` shape:

```json
{
  "metaConfigured": true,
  "tiktokConfigured": true,
  "youtubeConfigured": true,
  "threadsConfigured": true,
  "instagramLoginConfigured": true,
  "graphVersion": "v26.0",
  "redirectBase": "https://…"
}
```

Quirk: `threadsConfigured` checks `META_APP_ID && META_APP_SECRET`
(`server.ts:809`), even though the Threads flow checks `THREADS_*` (which itself
falls back to `META_*`). In practice both are equivalent under the fallback.

---

## 4. OAuth state and callbacks

Start routes:

1. Validate credentials (`missingConfig` for Meta/TikTok/Google; explicit 400 for
   Threads/Instagram).
2. `state = crypto.randomBytes(16).toString('hex')`.
3. `rememberState(state, { platform, codeVerifier?, redirectUri })`.
4. 302 to the provider authorize URL.

`pendingStates` is a `Map`; every mutation rewrites `.secrets/oauth-states.json`.
On boot, the file is rehydrated (`server.ts:76-78`). `consumeState` deletes the
entry on read (single-use), so a **backend restart between start and callback is
survivable**, but replaying a callback is not.

Callback pages are generated by `callbackHtml` (`server.ts:100-108`):

- Human-readable success/failure heading and detail.
- `window.opener.postMessage({ type:'relate-oauth', platform, ok, message }, '*')`.
- Auto-close after 1.5 s.

Provider callback branches check `pending.platform` to prevent state mixing.

---

## 5. Provider flows

### 5.1 Meta — Facebook Pages + Instagram via Page

Credentials: `META_APP_ID`, `META_APP_SECRET`.

Requested scopes (`server.ts:130-138`):

```
pages_show_list, pages_read_engagement, pages_manage_posts,
instagram_basic, instagram_content_publish, business_management, read_insights
```

Sequence:

1. Authorize: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`.
2. Exchange code: `POST https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
   (client id/secret, redirect URI, code).
3. Upgrade to long-lived user token:
   `GET …/oauth/access_token?grant_type=fb_exchange_token&…&fb_exchange_token=…`.
4. Read identity: `/me?fields=id,name`.
5. Discover Pages: `/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}`.
6. For pages without an IG account, try
   `/{page-id}/connected_instagram_account?fields=id,username` using the page token;
   failures are ignored (page simply has no IG professional account).
7. Read actually granted scopes from `/me/permissions` (the consent dialog lets
   users uncheck); fall back to the requested list.
8. Persist `store.meta` with the long-lived **user** token, page IDs/names, the
   full `metaPages` (including page access tokens), and an expiry of
   `expires_in` or **59 days**.

Notes:

- Facebook tab and Instagram-via-Page both read `store.meta`.
- `metaPages` is the only place Page tokens live; they are never exposed to the
  browser.
- **No refresh implementation exists for Meta.** After expiry/revocation the user
  must reconnect (by design, per `docs/platform-setup.md`).
- Scopes can be granted during Development mode for admins/testers without App
  Review.

### 5.2 Threads

Credentials: `THREADS_APP_ID` / `THREADS_APP_SECRET` (fallback to Meta).

Scopes: `threads_basic`, `threads_content_publish`, `threads_manage_replies`.

Redirect URI (`server.ts:400-405`): Threads requires HTTPS. If `APP_BASE` starts
with `http://`, the backend uses
`https://redirectmeto.com/${APP_BASE}/auth/threads/callback`; otherwise it uses
`${APP_BASE}/auth/threads/callback`. This proxy URL must be registered in the
Threads product.

Sequence:

1. `https://www.threads.net/oauth/authorize`.
2. `POST https://graph.threads.net/oauth/access_token` (authorization_code).
3. Long-lived exchange: `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=…&access_token=…`.
4. Identity: `GET https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url`.
5. Store as `threads_long_lived_user`, expiry `expires_in` or **58 days**.

Refresh: `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=…`.

### 5.3 Instagram — standalone "Instagram Login"

Credentials: `IG_APP_ID` / `IG_APP_SECRET` → fallback `THREADS_*` → `META_*`.

Scopes: `instagram_business_basic`, `instagram_business_content_publish`.

Sequence:

1. `https://www.instagram.com/oauth/authorize`.
2. `POST https://api.instagram.com/oauth/access_token` (form-encoded, authorization_code).
3. Long-lived: `GET https://graph.instagram.com/${GRAPH_VERSION}/access_token?grant_type=ig_exchange_token&client_secret=…&access_token=…`.
4. Identity: `GET https://graph.instagram.com/${GRAPH_VERSION}/me?fields=user_id,username`.
5. Store as `ig_long_lived_user`, expiry `expires_in` or **58 days**.

Refresh: `GET https://graph.instagram.com/access_token?grant_type=ig_refresh_token&access_token=…`
(note: no version segment and no client secret).

This flow requires no personal Facebook account. It can coexist with the
Page-linked Instagram discovered through Meta; the Settings UI shows the
standalone connection as authoritative when present (`ApiSettingsModal.tsx:91`).

### 5.4 TikTok — Open API v2

Credentials: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.

Scopes: `user.info.basic`, `video.list`, `video.publish`, `video.upload`.

PKCE: `verifier = crypto.randomBytes(32).toString('base64url')`;
`challenge = sha256(verifier)` base64url; method `S256`. The verifier is stored
with the OAuth state until the callback.

Sequence:

1. `https://www.tiktok.com/v2/auth/authorize/` with `client_key`, `response_type=code`,
   scopes, redirect URI, state, `code_challenge`, `code_challenge_method=S256`.
2. `POST https://open.tiktokapis.com/v2/oauth/token/` (client key/secret, code,
   `grant_type=authorization_code`, redirect URI, `code_verifier`).
3. Profile: `GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name`.
4. Store access + **refresh token**, expiry `expires_in` or 24 h.

Refresh: same token endpoint with `grant_type=refresh_token`.

Sandbox accounts must be listed in the app's Sandbox → Target users, and sandbox
client keys must be used until the app passes review.

### 5.5 YouTube — Google OAuth 2.0

Credentials: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

Scopes: `https://www.googleapis.com/auth/youtube.readonly`,
`https://www.googleapis.com/auth/youtube.upload` (upload requested up-front).

Sequence:

1. `https://accounts.google.com/o/oauth2/v2/auth` with
   `access_type=offline&prompt=consent` (guarantees a refresh token).
2. `POST https://oauth2.googleapis.com/token` (authorization_code).
3. `GET https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true`.
4. If the account owns **no channel**, the connection is rejected with a clear
   message.
5. Store channel IDs/titles, access + refresh token, expiry `expires_in` or 1 h.

Refresh: `POST https://oauth2.googleapis.com/token` with `grant_type=refresh_token`.

Workspace accounts may hit `invalid_rapt` if the OAuth app is not admin-approved.

---

## 6. Token refresh

`freshAccessToken(storeKey)` (`server.ts:744-800`) is only called by verification:

- Refresh when `expiresAt - now < 5 minutes`.
- Otherwise return the stored access token.
- After refresh, persist the new access token, optional new refresh token, and
  `expiresAt = now + expires_in` (default 1 h if omitted).

| Group | Refresh mechanism | Requires refresh token |
| --- | --- | --- |
| `meta` | **Not supported** — reconnect | — |
| `threads` | `th_refresh_token` | No (uses long-lived access token) |
| `instagram` | `ig_refresh_token` | No (uses long-lived access token) |
| `tiktok` | `refresh_token` grant at token endpoint | Yes |
| `youtube` | `refresh_token` grant at Google token endpoint | Yes |

If a required refresh token is missing, the call throws a reconnect message.

There is no proactive background refresh; tokens refresh lazily on
`/api/verify/:platform`.

---

## 7. Verification behaviour

`POST /api/verify/:platform` (`server.ts:820-922`) evaluates branches in this
order:

1. **`instagram` with `store.instagram`** → refresh if needed, call
   `graph.instagram.com/me`, return `via: 'Instagram Login'`.
2. **`facebook` or `instagram`** → require `store.meta`, call `/me`, return
   user identity + `pages` + discovered `instagram` accounts. For `instagram`
   with zero discovered accounts, returns HTTP 200 with `ok: false` and a
   `warning`.
3. **`tiktok`** → refresh, call `user/info`, return display name + open_id.
4. **`youtube`** → refresh, call `channels?mine=true`, return first channel and
   the full channel list; 404 when the account owns no channel.
5. **`threads`** → refresh, call `/v1.0/me`, return `@username`.
6. Unknown platform → 404. Any thrown/API error → 502 `{error}`.

Note the precedence: if standalone Instagram is connected, testing "Instagram"
never falls through to the Meta/Page route.

---

## 8. Media API (summary)

Detailed contracts and safety rules are in
[04-data-and-storage.md](./04-data-and-storage.md). Endpoint-level essentials:

- Base dir: `RELATE_DATA_DIR` or `%LOCALAPPDATA%\RelateSocial`; media lives in a
  `media` subdirectory.
- Only directories matching `^\d{4}-\d{2}-\d{2}$` are scanned.
- Upload accepts raw bytes (`express.raw({ type:'*/*', limit:'…b' })`), maximum
  1 GB (1,073,741,824 bytes), buffered fully in memory before writing.
- Allowed extensions: `.jpg .jpeg .png .webp .gif .mp4 .webm .mov`.
- Filenames are sanitized to `[A-Za-z0-9._ -]`, leading dots stripped, max 180
  chars; collisions get `-1`, `-2`, … suffixes.
- Path resolution is constrained to the media root; invalid date/name returns 400.
- Reads stream from disk with a MIME map and `Cache-Control: no-cache`.

---

## 9. Security model and known risks

Intended model: **local, single-user, trusted machine**. Nothing below is a
vulnerability in that model, but each matters if the backend is exposed (for
example through the Cloudflare Tunnel used for OAuth).

| Risk | Detail |
| --- | --- |
| No authentication | Every `/api/*` and `/auth/*` endpoint is open to anyone who can reach the origin |
| Binds all interfaces | `app.listen(PORT)` listens on `0.0.0.0`, not loopback |
| Token files in plaintext | `.secrets/connections.json`; mode `0600` is best-effort and ignored on Windows |
| Unescaped callback HTML | `callbackHtml` interpolates provider/user detail into HTML (`server.ts:100-108`); a malicious error string could inject markup into an origin-served page |
| `postMessage('*')` | Callback posts to any opener; the modal does not validate `event.origin` (`ApiSettingsModal.tsx:124-142`) |
| Absolute path disclosure | `/api/storage/info` returns the server's absolute data directory |
| Memory pressure | A 1 GB upload is fully buffered in Express memory |
| No CSRF/rate limits | Any page able to POST to the origin can disconnect accounts or verify with stored tokens |
| State file durability | `oauth-states.json` holds in-flight verifier/state values; it is git-ignored but plaintext |

Positive controls: secrets never reach the browser; state is single-use;
filenames/dates are validated; path traversal is blocked; tokens are masked in
all responses; `Cache-Control: no-cache` on media.

---

## 10. How to extend the backend safely

To add a platform:

1. Add the ID to `PlatformId`, `PLATFORMS`, `ALL_PLATFORM_IDS` and
   `PlatformIcon`.
2. Add a `Store` key and `StoredConnection` handling (usually reuse the shape).
3. Add start/callback routes following an existing provider; always generate and
   consume `state`.
4. Add a verify branch before the fallback 404.
5. Add the ID to the disconnect allow-list and to the frontend mapping objects in
   `ApiSettingsModal` (`OAUTH_START_PATH`, `CONNECTION_GROUP`, `OAUTH_PROVIDER`).
6. If it supports refresh, extend the `freshAccessToken` union and branch.
7. Register the callback `${APP_URL}/auth/<provider>/callback` in the provider
   portal and update `docs/platform-setup.md`.

To implement real publishing, add new authenticated server endpoints that call
`freshAccessToken` / load `store.<group>` and post media, then expose a
frontend action. The existing media files are local paths, so publishing requires
either multipart upload from disk or a publicly reachable media URL; this is not
provided by the current code.
