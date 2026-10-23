# 04 — Data Models and Storage

Scope: shared TypeScript contracts, every persistence layer, media API payloads,
and the lifecycle of media URLs. Code: `src/types/index.ts`,
`src/utils/mediaStorage.ts`, `src/utils/mediaUtils.ts`, `server.ts` media section.

---

## 1. Domain types

All types live in `src/types/index.ts`.

```ts
type PlatformId = 'instagram' | 'facebook' | 'threads' | 'tiktok' | 'youtube';
type MediaFormat = 'image' | 'video' | 'carousel';
type PostStatus = 'draft' | 'scheduled' | 'published';
type CalendarViewMode = 'month' | 'week' | 'day';
```

### MediaItem

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `media-<timestamp>-<rand>` for new files, or `<date>/<name>` for server items |
| `name` | string | original filename |
| `url` | string | Blob URL, `data:` URL, remote URL, or `/api/storage/media/file?...` |
| `size` | number | bytes |
| `type` | string | MIME type |
| `width`, `height` | number? | probed for images/videos |
| `duration` | number? | video seconds (fallback 15 if probing fails) |
| `fileRef` | File? | original file, used for server upload; stripped before IndexedDB write |
| `uploadedAt` | string? | ISO timestamp |
| `thumbnailUrl` | string? | declared but currently unused |
| `serverManaged` | boolean? | true for items loaded from the universal store |
| `folderDate` | string? | `YYYY-MM-DD` folder for server items |

### PlatformCustomization (per-channel override)

```ts
{
  caption: string;
  hashtags: string[];
  scheduledTime: string;   // HH:mm
  format: MediaFormat;
  firstComment?: string;   // Instagram only in the UI
  soundTitle?: string;     // TikTok only in the UI
  collaborator?: string;   // declared, no UI
  videoThumbnailUrl?: string; // declared, no UI
}
```

### ScheduledPost

```ts
{
  id: string;                       // `post-<ts>`, `post-drop-<ts>`, `campaign-post-<ts>-<i>`
  title: string;
  campaignName?: string;            // set by bulk builder only
  scheduledDate: string;            // YYYY-MM-DD
  scheduledTime: string;            // HH:mm
  platforms: PlatformId[];
  format: MediaFormat;              // base format
  media: MediaItem[];
  baseCaption: string;
  baseHashtags: string[];
  platformOverrides: Partial<Record<PlatformId, PlatformCustomization>>;
  status: PostStatus;
  createdAt: string;                // ISO
  metrics?: { likes; comments; shares; views? };
}
```

Status semantics:

- `draft` and `scheduled` are treated identically by the calendar and filters.
- The header counts only `scheduled` and `published`.
- `published` is only reachable through the simulated publish action.
- No process transitions posts automatically.

### Other types

- `PlatformConfig` — id, name, brand colors, char/hashtag limits, supported
  formats (with aspect ratios), peak times. Source of truth: `src/constants/platforms.ts`.
- `PlatformApiCredentials` — UI-only credential view model (platform id,
  `isConnected`, masked `accessToken`, `accountId`, `permissions`, environment,
  `lastTested`). Never persisted.
- `BulkCampaignSeriesConfig` — declared but **not wired**; the bulk modal uses
  local component state instead.

---

## 2. Persistence layers

| Data | Primary store | Fallback | Survives reload | Survives backend restart | Shared across browsers |
| --- | --- | --- | --- | --- | --- |
| Scheduled posts | `localStorage` | — | Yes | Yes | No |
| Media (backend up) | Disk date folders | — | Yes | Yes | Yes |
| Media (backend down) | IndexedDB | localStorage metadata only | Yes* | — | No |
| OAuth tokens | `.secrets/connections.json` | — | Yes | Yes | Only through the same backend |
| In-flight OAuth state | `.secrets/oauth-states.json` | — | Yes | Yes | — |

\* Metadata survives, but see the Blob URL caveat in §6.

### localStorage keys

| Key | Content | Written by |
| --- | --- | --- |
| `relate_social_scheduled_posts_v2` | `ScheduledPost[]` | `App.tsx:24-46`, on every `posts` change |
| `relate_media_metadata_list` | `MediaItem[]` (no binary data) | last-resort media fallback |

Writes are wrapped in `try/catch`, but only `console.warn`/`console.error`; there
is no quota management, pruning, or schema migration. The `_v2` suffix is the
only versioning; old keys are not read.

### IndexedDB

- Database: `RelateSocialMediaDB`, version `1`.
- Object store: `media_assets`, keyPath `id`, no indexes.
- Rows are `MediaItem` values with `fileRef` removed.
- Used only when `/api/storage/info` is unreachable.
- `serverMode` in `mediaStorage.ts` caches the availability probe for the page
  lifetime; a later-started backend is not detected until reload.

### Backend secrets

| File | Shape | Notes |
| --- | --- | --- |
| `.secrets/connections.json` | `{ meta?, instagram?, threads?, tiktok?, youtube?: StoredConnection }` | plaintext; mode 0600 on write |
| `.secrets/oauth-states.json` | `{ [state]: { platform, codeVerifier?, redirectUri } }` | in-flight flows only |

Both are git-ignored (`.gitignore` lists `.secrets/`). See
[02-backend-oauth.md](./02-backend-oauth.md) §2 for `StoredConnection`.

---

## 3. Media file layout

```
<DATA_DIR>/
  media/
    2026-10-22/
      launch-teaser.mp4
      launch-teaser-1.mp4     ← collision suffix
    2026-10-23/
      hero.png
```

- `DATA_DIR` = `RELATE_DATA_DIR` (resolved against the backend's cwd) or
  `%LOCALAPPDATA%\RelateSocial`; when `LOCALAPPDATA` is absent the code uses
  `~/AppData/Local/RelateSocial` (this path is used on macOS/Linux too).
- Only folders matching `^\d{4}-\d{2}-\d{2}$` are visible to the API. Other
  folders are ignored, never deleted.
- Allowed extensions: `.jpg .jpeg .png .webp .gif .mp4 .webm .mov`.
- Per-file limit: 1,073,741,824 bytes (1 GB). There is **no total quota** on the
  server; the 1 GB gauge in the UI is cosmetic.
- Files may be added manually if they follow the folder/naming rules; the API
  lists any file, assigning `application/octet-stream` to unknown extensions.

---

## 4. Media API contracts

### `GET /api/storage/info`

```json
{
  "dataDir": "C:\\Users\\…\\AppData\\Local\\RelateSocial",
  "mediaDir": "C:\\Users\\…\\AppData\\Local\\RelateSocial\\media",
  "exists": true,
  "dateFolders": 3,
  "totalFiles": 12,
  "totalBytes": 48201344,
  "maxFileBytes": 1073741824
}
```

### `GET /api/storage/media/dates`

```json
[{ "date": "2026-10-23", "files": 4, "bytes": 120034 }, …]
```

Sorted newest first. Returns `[]` when the media directory does not exist.

### `GET /api/storage/media?date=YYYY-MM-DD`

- 400 if `date` is missing/invalid.
- `[]` if the folder does not exist.
- Otherwise:

```json
[{
  "date": "2026-10-23",
  "name": "hero.png",
  "size": 204800,
  "type": "image/png",
  "modifiedAt": "2026-10-23T04:12:00.000Z",
  "url": "/api/storage/media/file?date=2026-10-23&name=hero.png"
}]
```

Only regular files are listed (directories skipped).

### `GET /api/storage/media/file?date=…&name=…`

- Streams the file with the MIME map, `Content-Length`,
  `Cache-Control: no-cache`.
- 400 for invalid date/name; 404 for missing file.

### `POST /api/storage/media?date=…&name=…`

- Body: **raw bytes** (`express.raw({ type:'*/*', limit:'1GB' })`).
- `date` required and must match `YYYY-MM-DD`.
- `name` is sanitized; if absent it becomes `upload-<timestamp>` (which then
  fails extension validation, so clients should always send a name with a valid
  extension).
- 400 for unsupported extension or empty body; 413 if over 1 GB; 201 on success:

```json
{
  "date": "2026-10-23",
  "name": "hero-1.png",
  "size": 204800,
  "type": "image/png",
  "modifiedAt": "2026-10-23T04:12:00.000Z",
  "url": "/api/storage/media/file?date=2026-10-23&name=hero-1.png"
}
```

Collisions are resolved by appending `-1`, `-2`, … before the extension.

### `DELETE /api/storage/media?date=…&name=…`

- 400 for invalid date/name; 200 `{ "deleted": "2026-10-23/hero.png" }` otherwise.
- 500 with the OS error message if unlink fails.

### Safety primitives

| Function | Rule |
| --- | --- |
| `safeFolder` | must be a string matching `YYYY-MM-DD` |
| `safeFileName` | ≤ 180 chars; invalid chars (`[^A-Za-z0-9._ -]`) → `_`; leading dots stripped |
| `resolveInMediaDir` | resolved path must start with `<mediaDir> + sep` |
| MIME map | fixed whitelist used for both upload validation and responses |

Traversal attempts (`../`, absolute paths, alternate separators that resolve
outside) are rejected by the prefix check. Uploads still buffer the whole file in
memory, so a 1 GB upload costs ~1 GB of backend RAM.

---

## 5. Client-side media pipeline

`src/utils/mediaUtils.ts`:

- `validateFileSize(file)` → rejects > 1 GB with a formatted message.
- `detectMediaType(file)` → image/video/unknown (exported, not currently used).
- `processFileToMediaItem(file)`:
  - `URL.createObjectURL(file)` for immediate preview,
  - generates id `media-<ts>-<rand>`,
  - keeps `fileRef`,
  - probes dimensions (image) or duration/dimensions (video);
    video metadata failure defaults to 15 seconds.
- `formatBytes` — binary units, one decimal by default.

`src/utils/mediaStorage.ts`:

| Function | Behaviour |
| --- | --- |
| `getMediaStorageInfo` | 2 s-timeout probe of `/api/storage/info` |
| `saveMediaItemToStorage(item, date?)` | server upload → IndexedDB → localStorage metadata |
| `getAllStoredMedia()` | server scan → IndexedDB → localStorage |
| `deleteStoredMediaItem(id)` | server delete when id contains `/`, else IndexedDB |
| `clearAllStoredMedia()` | delete every server file, or clear IndexedDB |
| `fileToBase64(file)` | exported helper, currently unused |
| `exportMediaManifestJSON(media)` | downloads a JSON manifest via a `data:` URL |

Server upload path:

- `fileRef` → `arrayBuffer()` posted as a Blob.
- `data:` URL → decoded to bytes and posted with an extension derived from the
  MIME type.
- Remote `http(s)` URLs are **not** copied; they stay as remote references.

Important: `saveMediaItemToStorage` returns `void` and **does not replace the
caller's item** with the server representation.

---

## 6. URL lifecycle — the key caveat

1. User drops `video.mp4`.
2. `processFileToMediaItem` produces `url = blob:http://localhost:3000/<uuid>`.
3. `saveMediaItemToStorage` uploads the bytes to disk, but the item in memory
   still has the Blob URL and `serverManaged` is unset.
4. The composer saves that item inside the `ScheduledPost`, which `App` writes to
   localStorage.
5. On reload:
   - the media **library** is rebuilt from the server and has valid
     `/api/storage/media/file?…` URLs;
   - the **posts** still contain the old `blob:` URL, which the browser has
     discarded.

Result: thumbnails and simulator media in pre-existing posts can be broken after
a reload even though the bytes are safely on disk. The same applies to the
IndexedDB fallback (it stores Blob URL strings, not files).

Media selected from the library picker (server-managed items) does not have this
problem because those items already carry a stable server URL.

Fix direction: have the upload helper return the server item, replace the
media-list entry before building/saving the post, and add a migration that maps
`serverManaged` items by `folderDate/name`. See
[06-known-gaps-and-recipes.md](./06-known-gaps-and-recipes.md).

---

## 7. Limits and failure modes

| Limit | Value | Enforced where |
| --- | --- | --- |
| Per-file media size | 1 GB | client validation + server raw limit |
| Total backend media | unbounded | — |
| UI storage gauge | 1 GB | display only |
| JSON body (non-media) | Express default 100 KB | `express.json()` |
| localStorage | browser-specific (~5 MB) | not handled beyond `console.warn` |
| Library manifest import | unbounded | can import `data:` URLs and bloat localStorage |
| Platforms per post | ≥ 1 (UI), no upper bound | composer |
| Media per post | no cap | composer/bulk |

Failure behaviour:

- Backend down at load → media falls back per browser; the app still works.
- Backend down mid-session → upload/delete errors are logged; upload falls back
  to IndexedDB (`saveMediaItemToStorage` catches and continues).
- Deleting media does not clean up posts that reference it.
- Clearing the library deletes every server file under valid date folders,
  regardless of which posts use them.
