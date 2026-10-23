# 05 — Development, Configuration, Operations

Scope: getting the app running, environment variables, provider registration,
the HTTPS tunnel, manual verification and troubleshooting.

---

## 1. Prerequisites and install

- Node.js 20+ (the project was developed on Node 24).
- npm or pnpm. A `pnpm-lock.yaml` exists, but README instructions use npm; both
  resolve the same dependencies.
- No database, Docker, or external service is required beyond provider APIs.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

`.env` is git-ignored. Never commit it or `.secrets/`.

---

## 2. Environment variables

| Variable | Required for | Default / fallback | Notes |
| --- | --- | --- | --- |
| `APP_URL` | all OAuth | `http://localhost:3000` | Public origin used to build callback URLs. Must match provider dashboards exactly. |
| `META_APP_ID` | Facebook, IG-via-Page | — | App A (Facebook Login) |
| `META_APP_SECRET` | same | — | |
| `META_GRAPH_VERSION` | Meta/IG | `v26.0` in code | `.env.example` shows `v25.0` in a comment; the running env wins |
| `THREADS_APP_ID` | Threads | `META_APP_ID` | App B in the documented setup |
| `THREADS_APP_SECRET` | Threads | `META_APP_SECRET` | |
| `IG_APP_ID` | Instagram Login | `THREADS_APP_ID` → `META_APP_ID` | |
| `IG_APP_SECRET` | Instagram Login | `THREADS_APP_SECRET` → `META_APP_SECRET` | |
| `TIKTOK_CLIENT_KEY` | TikTok | — | Sandbox keys until review |
| `TIKTOK_CLIENT_SECRET` | TikTok | — | |
| `GOOGLE_CLIENT_ID` | YouTube | — | Google Cloud OAuth web client |
| `GOOGLE_CLIENT_SECRET` | YouTube | — | |
| `OAUTH_SERVER_PORT` | backend | `8787` | Vite proxy reads the same variable |
| `RELATE_DATA_DIR` | media | `%LOCALAPPDATA%\RelateSocial` | Resolved against backend cwd |
| `GEMINI_API_KEY` | — | — | **Unused**; AI Studio scaffold residue |
| `DISABLE_HMR` | dev | unset | `true` disables HMR/file watching |

Credential fallback chain matters: Instagram Login works with a Threads app or
even the Meta app if the scopes/use case exist; Threads works with Meta
credentials only if that app has the Threads use case.

---

## 3. Running

```bash
npm run dev:server   # terminal 1 — http://localhost:8787
npm run dev          # terminal 2 — http://localhost:3000
```

The app requires **both** processes for connections and universal media. The
frontend remains usable without the backend (local posts + IndexedDB media).

Startup logs from the backend state the port, redirect base, media directory and
which credential sets are missing.

Open the app, click **API Connections** in the header, connect a platform, then
click **Test API Connection** on the same tab.

---

## 4. Provider registration (summary)

Full walkthrough with portal steps: [../platform-setup.md](../platform-setup.md).
The essential callback URLs for a local build:

| Provider | Portal redirect URI | Code route |
| --- | --- | --- |
| Facebook/Meta | `http://localhost:3000/auth/meta/callback` | `/auth/meta/*` |
| Threads | `https://redirectmeto.com/http://localhost:3000/auth/threads/callback` (HTTPS proxy for local HTTP) | `/auth/threads/*` |
| Instagram Login | `http://localhost:3000/auth/instagram/callback` | `/auth/instagram/*` |
| TikTok | `http://localhost:3000/auth/tiktok/callback` | `/auth/tiktok/*` |
| Google/YouTube | `http://localhost:3000/auth/google/callback` | `/auth/google/*` |

Scopes requested:

- Meta: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
  `instagram_basic`, `instagram_content_publish`, `business_management`,
  `read_insights`.
- Threads: `threads_basic`, `threads_content_publish`, `threads_manage_replies`.
- Instagram Login: `instagram_business_basic`, `instagram_business_content_publish`.
- TikTok: `user.info.basic`, `video.list`, `video.publish`, `video.upload`.
- Google: `youtube.readonly`, `youtube.upload`.

Account constraints:

- Meta/IG/TikTok/Google apps in development only work for accounts added as
  admins, developers, testers or sandbox target users.
- The IG professional account must be linked to an administered Facebook Page for
  the Page-based route; standalone IG Login avoids that requirement.
- Threads testers must accept the invite inside Threads.
- Google Workspace accounts may require admin OAuth approval.

TikTok domain verification: `public/tiktokDORlGpmC87m7uYv95gj95MgaVGD9pDgU.txt`
must remain publicly served at the site root.

---

## 5. Exposing the app over HTTPS

Meta and TikTok require HTTPS redirect URIs for non-localhost apps. The
documented workflow is a named Cloudflare Tunnel to the Vite server:

```bash
cloudflared tunnel login
cloudflared tunnel create relate-social
cloudflared tunnel route dns relate-social <subdomain>.<domain>
cloudflared tunnel run relate-social
```

Then:

1. Set `APP_URL="https://<subdomain>.<domain>"`.
2. Register `https://<subdomain>.<domain>/auth/<provider>/callback` in every
   provider dashboard. Threads uses the same HTTPS URL directly (no
   `redirectmeto.com` wrapper once `APP_URL` is HTTPS).
3. Keep **all three** processes alive: `dev:server`, `dev`, `cloudflared`.
4. Ensure the hostname is permitted by Vite `server.allowedHosts`
   (`.localtest.me`, `.trycloudflare.com`, `.internalc.my.id` are preconfigured).

`docs/platform-setup.md` documents the current named-tunnel deployment at
`https://relate.internalc.my.id`.

---

## 6. Manual verification checklist

Use this after any change touching OAuth, tokens, media or persistence:

**Backend**

- [ ] `GET /api/health` reports the expected `*Configured` booleans and
      `redirectBase`.
- [ ] `GET /api/connections` returns `{}` on a fresh install.
- [ ] Starting an unconfigured provider returns HTTP 400 with a config message.

**OAuth (per platform)**

- [ ] Connect opens a new tab and the provider consent screen shows the
      expected scopes.
- [ ] Callback page reports success and closes.
- [ ] Settings tab shows the connected account, masked token and scopes.
- [ ] `Test API Connection` returns the real identity.
- [ ] Disconnect removes the group from `/api/connections` and deletes the entry
      from `.secrets/connections.json`.
- [ ] Closing the login tab early produces the "nothing was stored" message.
- [ ] Restarting `dev:server` between start and callback still succeeds
      (`oauth-states.json`).

**Media**

- [ ] Upload an image and a video ≤ 1 GB; both appear in the library and on disk
      under `media/YYYY-MM-DD/`.
- [ ] Uploading the same filename twice produces `-1`.
- [ ] Unsupported extension returns 400; > 1 GB returns 413.
- [ ] List/file/delete endpoints work; deleting removes the file from disk.
- [ ] Stop the backend and reload: the library falls back to IndexedDB and the
      app still loads.
- [ ] Manifest export/import round-trips metadata.

**Calendar/composer**

- [ ] Create, edit, drag-reschedule, delete a post across all three views.
- [ ] Drop OS files onto a day/hour creates a prefilled post.
- [ ] Per-platform overrides appear in the simulator and card.
- [ ] Reload preserves posts (localStorage).
- [ ] Bulk campaign generates the expected dates for each cadence.

**Quality**

- [ ] `npm run lint` passes.
- [ ] `npm run build` succeeds and `npm run preview` serves the SPA.
- [ ] Browser console has no new errors; network tab shows no failed
      `/api/*` or `/auth/*` calls.

---

## 7. Troubleshooting

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| "OAuth backend is not running" in Settings | `dev:server` stopped | Start it; Vite proxies to `OAUTH_SERVER_PORT` |
| Popup blocked | Browser popup policy | Allow popups for the origin, click Connect again |
| "Missing environment configuration" (HTTP 400) | Empty app ID/secret for that provider | Fill `.env`, restart backend |
| Invalid Scopes (Facebook) | Wrong App ID or missing Facebook Login use case / app type | Use App A, enable the use case |
| "Given URL is not allowed" (Meta) | Redirect URI mismatch or missing App Domain | Register the exact `${APP_URL}/auth/meta/callback`; ensure App Domain matches |
| Threads error `1349245` | Account did not accept tester invite | Accept in the Threads app; retry |
| Threads redirect rejected | `redirectmeto.com` URI not registered, or browser blocked the proxy | Register it exactly; try the HTTPS tunnel instead |
| Instagram "Insufficient Developer Role" | Account is not an IG tester | Add it in App roles and accept |
| Instagram list empty (Page route) | No IG professional account linked to an administered Page | Link the account or use standalone Instagram Login |
| TikTok `non_sandbox_target` | Account not in Sandbox target users, or production keys used | Add target user; use sandbox keys |
| TikTok `scope_permission_missed` | Scope not enabled in the developer portal | Enable it, reconnect |
| "Invalid or expired OAuth state" | Callback replayed, `APP_URL` changed mid-flow, or state file removed | Restart the flow from Connect |
| Meta "session has been invalidated" | Consent revoked or token expired | Reconnect; Meta tokens are not refreshed |
| Google `invalid_rapt` | Workspace OAuth not approved | Admin approval or use a personal account |
| Media library empty after starting the backend | `serverMode` probe was cached as false at page load | Reload the page |
| Media thumbnails in old posts broken | Posts store Blob URLs that die on reload | See 04 §6 / 06 recipe; re-select media from the library |
| Upload 400 "Unsupported file type" | Missing/unsupported extension, or no filename | Send a name ending in an allowed extension |
| Upload 413 | File over 1 GB | Reduce or split the file |
| Vite "Blocked request… host not allowed" | New tunnel domain | Add it to `server.allowedHosts` |
| Connection times out after 90 s | Provider error in the login tab, wrong redirect, untested account | Read the login tab error; fix provider config |
| `npm run lint` fails after edits | TypeScript contract broken | Fix types; `tsc --noEmit` is the only static gate |

---

## 8. Testing and quality gates

- **No automated tests** exist (no Vitest/Jest/Playwright config).
- `npm run lint` = `tsc --noEmit`; tsconfig has `strict` unset (so it is not
  strict), `skipLibCheck: true`, `moduleResolution: bundler`, `noEmit: true`.
- No ESLint, Prettier, CI workflow, Husky hooks, or commit linting.
- `npm run build` is the frontend compile check; it does not type-check (Vite
  transpiles only). Run `lint` explicitly.
- Manual browser verification is expected for every UI change; the simulator and
  OAuth flows cannot be meaningfully validated by types alone.

---

## 9. Deployment notes

- `vite build` emits static assets to `dist/`; `public/` (including the TikTok
  verification file) is copied as-is.
- The backend is not bundled. Run `tsx server.ts` or compile it separately, and
  keep `APP_URL`/provider credentials in its environment.
- The SPA and backend are assumed to share an origin. Serve `dist/` behind a
  reverse proxy that forwards `/api` and `/auth` to the backend. No CORS headers
  are configured, so splitting origins requires changes.
- Use HTTPS in front of both; `APP_URL` must be the public HTTPS origin.
- The backend is single-user and unauthenticated: do not expose it to an
  untrusted network. If it must be public, add authentication, restrict
  `/api/storage/*` and `/api/connections`, and review the callback HTML handling.
- The backend has no graceful shutdown, logging pipeline, health check beyond
  `/api/health`, or process manager configuration.
- `npm run clean` deletes `dist/` and `server.js` (the latter is not currently
  produced by any script).
