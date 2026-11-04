# Cross-platform Folder Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add a media library folder from any client — Windows, macOS, Linux (Wayland or headless), or a phone — with a server-side directory browser as the base and a native OS dialog as an optional accelerator.

**Architecture:** The Express server lists directories (`GET /api/fs/dirs`) and the browser renders them; no OS dialog is required, so the same code works on a phone, a tunnel, or a headless box. A capability probe (`GET /api/fs/folder-picker`) reports which native backend exists on the server, and the existing `POST /api/library/pick-folder` route is refactored into a chain of adapters so a missing backend is an invisible capability gap instead of an error toast.

**Tech Stack:** Node 24 + Express 4 (single-file `server.ts`), React 19 + Vite 8 + Tailwind v4 (frontend), `node:test` via `node --import tsx --test` (no test framework added), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-11-04-cross-platform-folder-picker-design.md` — read it before starting; this plan implements it and does not restate it.

## Global Constraints

- **No new npm dependencies.** Everything uses `node:fs`, `node:path`, `node:os`, `node:child_process`, `node:url`, and the packages already in `package.json`.
- **Env vars (exact names and defaults):** `MEDIA_BROWSE_ROOTS` (unset → home + volumes), `MEDIA_BROWSE` (unset → on; off only for `0`/`off`/`false`/`no`, case-insensitive), `MEDIA_BROWSE_REMOTE` (`"0"` → remote browsing off; only `"1"` enables it), `FS_LIST_LIMIT` (`"1000"`), `MEDIA_PICKER_BACKEND` (`"auto"`; also `zenity`/`kdialog`/`gtk4`/`portal`/`powershell`/`osascript`/`none`), `MEDIA_NO_LISTEN` (`"1"` → skip `app.listen`, tests only).
- **Env is read at call time, never frozen into module constants.** Every helper reads `process.env` when called, so a test can flip a flag by setting `process.env` before issuing a request.
- **Error copy is exact.** Use these strings verbatim; never return codes, paths, or `err.message` to the client:
  - `No folders are available to browse on this computer.`
  - `That path points to a file, not a folder.`
  - `That folder is outside the folders this app is allowed to browse.`
  - `That folder could not be found. Check the path and try again.`
  - `That folder cannot be read. Check its permissions.`
  - `Folder browsing is turned off on this computer. Paste the folder path instead.`
  - `Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.`
  - `No native folder picker is available on this system. Paste the folder path instead.`
  - `The folder picker could not open. Paste the folder path instead.`
  - `A folder picker is already open. Finish it first.`
- **Tailwind v4 with no plugins.** `animate-in`, `fade-in`, `slide-in-from-bottom-3`, `scrollbar-none`, `scrollbar-thin`, and `xs:` do nothing in this repo (known gap #20). Only `animate-spin` and `animate-pulse` are real. Do not rely on the others.
- **Frontend data layer:** every call goes through `src/utils/localLibrary.ts`, every failure through `toUserMessage(err, fallback)`.
- **Commits:** one commit per task, Conventional Commits (`feat:`, `test:`, `docs:`, `refactor:`), and only the files that task touches.

## Review Focus

The spec is a vision document; these input classes are implied by it and are not covered by any spec section. Each one gets a test in the task that owns the code.

1. **A folder name with spaces, unicode, or emoji** (`My Videos 🎬`, `Фото`) — must round-trip through `/api/fs/dirs?path=` and render intact in the modal, not arrive mangled or 404.
2. **A symlink inside a browse root pointing outside it** (`~/link -> /etc`) — must be rejected with the "outside the folders this app is allowed to browse" 403, not listed as enterable.
3. **A folder with 5000 subfolders** — must truncate at `FS_LIST_LIMIT`, set `truncated: true`, and say so in the UI; must not hang the phone.
4. **A folder deleted between listing and "Use this folder"** — must surface the "could not be found" 404, not a 500 or a crash.
5. **A phone client** — the "Use system dialog" button must not be present (the dialog would open on the desktop), and browsing must be refused with the remote message unless `MEDIA_BROWSE_REMOTE=1`.

---

## File Structure

| File | Responsibility |
|---|---|
| `server.ts` | Browse-root model, `/api/fs/dirs`, `/api/fs/folder-picker`, picker adapter chain, `isLocalRequest`. New code goes in a new section `// ---------- Folder browsing ----------` inserted before the existing `// ---------- Native folder picker (Windows / macOS / Linux) ----------` block at `server.ts:1449`. |
| `src/types/index.ts` | `BrowsePlace`, `FolderEntry`, `ServerFolderListing`, `FolderPickerCapability` (add next to `LibraryListing` at `src/types/index.ts:50`). |
| `src/utils/localLibrary.ts` | `listServerFolders`, `getFolderPickerCapability` (add next to `listLibraryFolder`). |
| `src/components/MediaLibrary/FolderBrowserModal.tsx` | **New.** The directory browser UI. |
| `src/components/MediaLibrary/MediaLibraryModal.tsx` | Add-folder row: Browse… / Use system dialog / paste path. |
| `tests/fs-browse.test.ts` | **New.** Route tests for `/api/fs/dirs`, `/api/fs/folder-picker`, gates. |
| `tests/picker-chain.test.ts` | **New.** Adapter chain, mutex gate, backend selection. |
| `package.json` | `"test"` script. |
| `.env.example`, `docs/knowledge-base/01-architecture.md`, `05-development.md`, `06-known-gaps-and-recipes.md` | Env + docs. |

---

### Task 1: Browse roots and `GET /api/fs/dirs`

**Files:**
- Modify: `server.ts` (insert new section before `server.ts:1449`; change `server.ts:1947` listen block; export `app`)
- Create: `tests/fs-browse.test.ts`
- Modify: `package.json` (add `"test"` script)

**Interfaces:**
- Consumes: existing `expandUserPath` (`server.ts:1421`), `logDetail` (`server.ts:102`), `execFileAsync` (`server.ts:826`).
- Produces:
  ```ts
  interface BrowseRoot { name: string; path: string; kind: 'home' | 'volume' | 'custom' }
  interface FolderEntry { name: string; path: string }
  interface ServerFolderListing {
    path: string; name: string; parent: string | null; isRoot: boolean;
    limit: number; places: BrowseRoot[]; entries: FolderEntry[]; truncated: boolean;
  }
  function browseRoots(): BrowseRoot[]
  function listFolderListing(target: string): ServerFolderListing // throws Error with .statusCode
  export { app }
  ```
  Route: `GET /api/fs/dirs?path=<abs|empty>` → `ServerFolderListing`; on error → `{ error: <exact message from Global Constraints> }` with the thrown `statusCode` (404/403/400/500).

- [ ] **Step 1: Make the server importable without listening**

In `server.ts`, wrap the listen block at `server.ts:1947` so it only runs when not disabled, and export `app`:

```ts
if (process.env.MEDIA_NO_LISTEN !== '1') {
  app.listen(PORT, () => {
    // ...existing body unchanged...
  });
}

export { app };
```

- [ ] **Step 2: Add the test script and a test helper**

In `package.json` add to `"scripts"`:
```json
"test": "node --import tsx --test tests/*.test.ts"
```

Create `tests/fs-browse.test.ts` with a shared helper at the top of the file:

```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TMP_BASE = fs.existsSync('/tmp/opencode') ? '/tmp/opencode' : require('node:os').tmpdir();
fs.mkdirSync(TMP_BASE, { recursive: true });
const ROOT = fs.mkdtempSync(path.join(TMP_BASE, 'cal-fs-'));
process.env.MEDIA_NO_LISTEN = '1';
process.env.MEDIA_BROWSE_ROOTS = ROOT;
process.env.MEDIA_BROWSE = '1';
process.env.MEDIA_BROWSE_REMOTE = '1';
process.env.FS_LIST_LIMIT = '1000';

const { app } = await import('../server.ts');

let base = '';
let server: import('node:http').Server | null = null;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server!.once('listening', r));
  base = `http://127.0.0.1:${(server!.address() as any).port}`;
});
after(async () => {
  // The server must be closed or `node --test` waits forever on the open handle.
  await new Promise((r) => server?.close(() => r(undefined)));
  fs.rmSync(ROOT, { recursive: true, force: true });
});

async function get(p: string) {
  const res = await fetch(`${base}${p}`);
  return { status: res.status, body: await res.json() };
}
```

Note: the dynamic `import('../server.ts')` must come after the `process.env` assignments — module-level code in `server.ts` reads env, and the route behaviour must be driven by the per-call env reads.

- [ ] **Step 3: Write the failing tests**

Add to `tests/fs-browse.test.ts`:

```ts
test('lists directories only, hides dotfiles, sorts numerically', async () => {
  fs.mkdirSync(path.join(ROOT, 'Folder 2'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'Folder 10'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, '.hidden'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'a.txt'), 'x');
  const { status, body } = await get('/api/fs/dirs');
  assert.equal(status, 200);
  assert.deepEqual(body.entries.map((e: any) => e.name), ['Folder 2', 'Folder 10']);
  assert.equal(body.path, ROOT);
  assert.equal(body.isRoot, true);
  assert.equal(body.parent, null);
  assert.ok(Array.isArray(body.places));
});

test('unicode and spaces round-trip through the query string', async () => {
  const weird = path.join(ROOT, 'My Videos 🎬');
  fs.mkdirSync(weird, { recursive: true });
  const { status, body } = await get(`/api/fs/dirs?path=${encodeURIComponent(weird)}`);
  assert.equal(status, 200);
  assert.equal(body.path, weird);
  assert.equal(body.name, 'My Videos 🎬');
});

test('rejects a path outside the browse roots with 403', async () => {
  const { status, body } = await get('/api/fs/dirs?path=' + encodeURIComponent('/etc'));
  assert.equal(status, 403);
  assert.equal(body.error, 'That folder is outside the folders this app is allowed to browse.');
});

test('rejects traversal out of the browse root with 403', async () => {
  const { status } = await get('/api/fs/dirs?path=' + encodeURIComponent(path.join(ROOT, '..', '..', 'etc')));
  assert.equal(status, 403);
});

test('rejects a symlink that escapes the browse root with 403', async () => {
  const link = path.join(ROOT, 'escape');
  try { fs.symlinkSync('/etc', link, 'dir'); } catch { return; } // no symlink support: skip
  const { status, body } = await get('/api/fs/dirs?path=' + encodeURIComponent(link));
  assert.equal(status, 403);
  assert.equal(body.error, 'That folder is outside the folders this app is allowed to browse.');
});

test('missing folder is 404 and a file is 400', async () => {
  const missing = await get('/api/fs/dirs?path=' + encodeURIComponent(path.join(ROOT, 'nope')));
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'That folder could not be found. Check the path and try again.');
  const file = await get('/api/fs/dirs?path=' + encodeURIComponent(path.join(ROOT, 'a.txt')));
  assert.equal(file.status, 400);
  assert.equal(file.body.error, 'That path points to a file, not a folder.');
});

test('truncates long listings and flags it', async () => {
  const big = path.join(ROOT, 'big');
  fs.mkdirSync(big, { recursive: true });
  for (let i = 0; i < 12; i++) fs.mkdirSync(path.join(big, `d${i}`));
  process.env.FS_LIST_LIMIT = '3';
  const { body } = await get('/api/fs/dirs?path=' + encodeURIComponent(big));
  assert.equal(body.entries.length, 3);
  assert.equal(body.truncated, true);
  process.env.FS_LIST_LIMIT = '1000';
});

test('MEDIA_BROWSE_ROOTS replaces the defaults and never yields the cwd', async () => {
  const { body } = await get('/api/fs/dirs');
  assert.deepEqual(body.places.map((p: any) => p.path), [ROOT]);
  assert.ok(!body.places.some((p: any) => p.path === process.cwd()));
});
```

- [ ] **Step 4: Run the tests and verify they fail**

Run: `pnpm test`
Expected: FAIL — the route does not exist yet (every request returns 404 from Express's default handler, and `body.entries` is undefined).

- [ ] **Step 5: Implement the browse-root model and the route**

In `server.ts`, insert a new section immediately before `// ---------- Native folder picker (Windows / macOS / Linux) ----------` (`server.ts:1449`).

Types (exact):

```ts
interface BrowseRoot { name: string; path: string; kind: 'home' | 'volume' | 'custom' }
interface FolderEntry { name: string; path: string }
interface ServerFolderListing {
  path: string; name: string; parent: string | null; isRoot: boolean;
  limit: number; places: BrowseRoot[]; entries: FolderEntry[]; truncated: boolean;
}
const FS_LIST_LIMIT = () => Math.max(1, Number(process.env.FS_LIST_LIMIT || 1000));
```

`browseRoots(): BrowseRoot[]`, in order:
1. If `MEDIA_BROWSE_ROOTS` is set and non-empty after trimming: split on `path.delimiter`, drop empty segments, `expandUserPath` each, keep only existing directories, `kind: 'custom'`, name `path.basename`. This list **replaces** the defaults; `os.homedir()` is not added.
2. Otherwise: `{ name: 'Home', path: os.homedir(), kind: 'home' }` plus volumes — Windows: existing drive letters `A:`–`Z:`; macOS: immediate children of `/Volumes`; Linux: immediate children of `/media`, `/mnt`, `/run/media` **and their immediate children** (this machine's `/run/media/data/salmonpro` is found that way). Volumes are `kind: 'volume'`.

`isInsideRoot(candidate, roots)`: compare `fs.realpathSync(candidate)` with `fs.realpathSync(root.path)` for each root — equal, or prefixed with `root + path.sep`; case-insensitive on Windows. A `realpathSync` failure means "not inside".

`listFolderListing(target)`: throws `Object.assign(new Error(msg), { statusCode })` with these exact cases, evaluated in this order — **textual containment first, then stat, then realpath containment**:

1. The resolved path is not textually inside a browse root → 403 `That folder is outside the folders this app is allowed to browse.` (checked *before* touching the filesystem, so the existence of a path outside the allowlist is never revealed).
2. `statSync` EACCES/EPERM → 403 `That folder cannot be read. Check its permissions.`
3. Any other stat failure (including `ENOENT`) → 404 `That folder could not be found. Check the path and try again.`
4. Not a directory → 400 `That path points to a file, not a folder.`
5. `realpath` of the path is outside the root's `realpath` → 403 `That folder is outside the folders this app is allowed to browse.` (closes the symlink-escape hole: a symlink inside a root pointing outside is refused).

Steps 1 and 5 are both required: step 1 stops a nonexistent out-of-scope path from being probed (which would answer 403 instead of 404, and would otherwise leak existence); step 5 catches a symlink whose textual path is inside the root but whose target is not.

Otherwise it returns the listing: `entries` = subdirectories only, dotfiles skipped, sorted with `localeCompare(undefined, { numeric: true })`, capped at `FS_LIST_LIMIT()` with `truncated: true` when there are more; `parent` = `path.dirname(abs)` unless that is outside every root (then `null` and `isRoot: true`); `places` = `browseRoots()`; `limit` = `FS_LIST_LIMIT()`.

Route:

```ts
app.get('/api/fs/dirs', (req, res) => {
  try {
    const raw = typeof req.query.path === 'string' ? req.query.path : '';
    const roots = browseRoots();
    if (roots.length === 0) {
      throw Object.assign(new Error('No folders are available to browse on this computer.'), { statusCode: 500 });
    }
    res.json(listFolderListing(raw.trim() ? raw : roots[0].path));
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    const message = err?.statusCode ? err.message : 'That folder could not be found. Check the path and try again.';
    res.status(status).json({ error: message });
  }
});
```

The catch must never leak a raw `err.message` for an unexpected error — only messages thrown with a `statusCode` are passed through.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm test`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add server.ts tests/fs-browse.test.ts package.json
git commit -m "feat: add server-side folder browsing endpoint"
```

---

### Task 2: Remote gate and feature kill switch

**Files:**
- Modify: `server.ts` (new helpers + guards on `/api/fs/dirs`)
- Modify: `tests/fs-browse.test.ts`

**Interfaces:**
- Consumes: `browseRoots`, `listFolderListing` from Task 1.
- Produces:
  ```ts
  function isLocalRequest(req: express.Request): boolean
  ```
  Behaviour: `MEDIA_BROWSE=0` → both `/api/fs/dirs` and `/api/fs/folder-picker` refuse with the "turned off" message; `MEDIA_BROWSE_REMOTE=0` and a non-local request → refuse with the "other devices" message.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fs-browse.test.ts` — note the `node:http` helper, not `fetch`:

```ts
// `fetch` silently drops a custom Host header (forbidden header name), so the
// remote gate can only be exercised through node:http.
function getWithHost(path: string, host: string): Promise<{ status: number; body: any }> {
  const port = new URL(base).port;
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(d || '{}') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('refuses to browse when MEDIA_BROWSE is off', async () => {
  process.env.MEDIA_BROWSE = '0';
  const { status, body } = await get('/api/fs/dirs');
  assert.equal(status, 403);
  assert.equal(body.error, 'Folder browsing is turned off on this computer. Paste the folder path instead.');
  process.env.MEDIA_BROWSE = '1';
});

test('refuses a remote host when MEDIA_BROWSE_REMOTE is off', async () => {
  process.env.MEDIA_BROWSE_REMOTE = '0';
  const { status, body } = await getWithHost('/api/fs/dirs', 'example.com');
  assert.equal(status, 403);
  assert.equal(body.error, 'Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.');
  process.env.MEDIA_BROWSE_REMOTE = '1';
});

test('allows a loopback host even when remote browsing is off', async () => {
  process.env.MEDIA_BROWSE_REMOTE = '0';
  const { status } = await getWithHost('/api/fs/dirs', 'localhost');
  assert.equal(status, 200);
  process.env.MEDIA_BROWSE_REMOTE = '1';
});
```

Add `import http from 'node:http';` to the imports at the top of `tests/fs-browse.test.ts`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test`
Expected: FAIL — the gates do not exist; the remote-host request currently returns 200.

- [ ] **Step 3: Implement the gates**

In `server.ts`, in the folder-browsing section, add:

```ts
function browseEnabled(): boolean {
  const raw = String(process.env.MEDIA_BROWSE ?? '').trim().toLowerCase();
  if (raw === '') return true; // unset means on
  return !['0', 'off', 'false', 'no'].includes(raw);
}
function browseRemoteAllowed(): boolean { return process.env.MEDIA_BROWSE_REMOTE === '1'; }

function isLocalRequest(req: express.Request): boolean {
  const host = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return false;
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip']) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (!['localhost', '127.0.0.1', '::1'].includes(originHost)) return false;
    } catch { return false; }
  }
  return true;
}

function browseGuard(req: express.Request): string | null {
  if (!browseEnabled()) return 'Folder browsing is turned off on this computer. Paste the folder path instead.';
  if (!browseRemoteAllowed() && !isLocalRequest(req)) {
    return 'Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.';
  }
  return null;
}
```

Then the first statement inside `app.get('/api/fs/dirs', ...)` becomes:

```ts
const blocked = browseGuard(req);
if (blocked) return res.status(403).json({ error: blocked });
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test`
Expected: PASS — 10 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add server.ts tests/fs-browse.test.ts
git commit -m "feat: gate folder browsing by scope and client locality"
```

---

### Task 3: Capability probe `GET /api/fs/folder-picker`

**Files:**
- Modify: `server.ts`
- Modify: `tests/fs-browse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface PickerCapability { platform: string; available: boolean; backend: string | null; detail: string | null }
  function probeFolderPicker(force?: boolean): PickerCapability
  ```
  Route: `GET /api/fs/folder-picker?refresh=1` → `PickerCapability` (HTTP 200 even when unavailable, so the client can read `detail`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/fs-browse.test.ts`:

```ts
test('probe reports a stable shape and honours MEDIA_PICKER_BACKEND=none', async () => {
  const { status, body } = await get('/api/fs/folder-picker');
  assert.equal(status, 200);
  assert.equal(typeof body.platform, 'string');
  assert.equal(typeof body.available, 'boolean');
  assert.ok('backend' in body && 'detail' in body);

  process.env.MEDIA_PICKER_BACKEND = 'none';
  const off = await get('/api/fs/folder-picker?refresh=1');
  assert.equal(off.body.available, false);
  assert.equal(off.body.backend, null);
  process.env.MEDIA_PICKER_BACKEND = 'auto';
});

test('probe reports browsing disabled when MEDIA_BROWSE is off', async () => {
  process.env.MEDIA_BROWSE = '0';
  const { body } = await get('/api/fs/folder-picker');
  assert.equal(body.available, false);
  assert.equal(body.detail, 'Folder browsing is turned off on this computer. Paste the folder path instead.');
  process.env.MEDIA_BROWSE = '1';
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Implement the probe**

In `server.ts`, in the folder-browsing section:

```ts
interface PickerCapability { platform: string; available: boolean; backend: string | null; detail: string | null }

function hasCommand(cmd: string): boolean {
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? [`${cmd}.exe`, `${cmd}.cmd`, cmd] : [cmd];
  return dirs.some((dir) => names.some((n) => {
    try { return fs.statSync(path.join(dir, n)).isFile(); } catch { return false; }
  }));
}

function hasDisplay(): boolean {
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

let cachedCapability: { key: string; value: PickerCapability } | null = null;
```

`probeFolderPicker(force = false): PickerCapability` — resolves the backend in this order:

- `MEDIA_PICKER_BACKEND` (default `auto`). When it is not `auto`, that id is used verbatim; `none` means "no backend" and must yield `available: false`.
- linux: `zenity` → `kdialog` → `gtk4` → `portal`, but only the first three require `hasDisplay()`; `gtk4` counts as present when `python3` is on `PATH` (the probe for GTK itself happens when the backend runs, and a failure there falls through to the next backend).
- darwin: `osascript` when on `PATH`.
- win32: `powershell` when `powershell.exe` or `powershell` is on `PATH`.

Then: when `browseEnabled()` is false the result is `{ platform, available: false, backend: null, detail: 'Folder browsing is turned off on this computer. Paste the folder path instead.' }`; otherwise `{ platform, available: Boolean(backend), backend, detail: backend ? null : 'No zenity, kdialog, GTK4 or desktop portal backend was found.' }`.

Cache the result in a module-level variable **together with the key it was computed from** — `` `${platform}|${forced}|${browseEnabled()}` `` — and recompute when the key no longer matches. A plain cached value would go stale when `MEDIA_BROWSE` or `MEDIA_PICKER_BACKEND` changes inside one running process, which the global constraint ("env is read at call time") forbids. `?refresh=1` forces a recompute regardless of the key.

Route:

```ts
app.get('/api/fs/folder-picker', (req, res) => {
  res.json(probeFolderPicker(req.query.refresh === '1'));
});
```

Note for the implementer: the probe reports *server-side* capability only. Whether the client may use it is decided in the browser (Task 9), because a native dialog opened by a phone would appear on the server's screen.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test`
Expected: PASS — 12 tests, 0 failures.

- [ ] **Step 5: Verify on this machine**

Run: `pnpm dev:server` in one terminal, then
`curl -s localhost:8787/api/fs/folder-picker`
Expected: `{"platform":"linux","available":true,"backend":"gtk4","detail":null}` (this machine has GTK 4.24.1 with `Gtk.FileDialog`, and no zenity/kdialog).

- [ ] **Step 6: Commit**

```bash
git add server.ts tests/fs-browse.test.ts
git commit -m "feat: add native folder picker capability probe"
```

---

### Task 4: Adapter chain and picker mutex

**Files:**
- Modify: `server.ts` (replace `pickFolderNative` at `server.ts:1453-1509` and the route at `server.ts:1622-1650`)
- Create: `tests/picker-chain.test.ts`

**Interfaces:**
- Consumes: `probeFolderPicker` from Task 3.
- Produces:
  ```ts
  type PickerResult = { canceled: true } | { canceled: false; path: string };
  interface PickerBackend { id: string; run(): Promise<PickerResult> }
  function defaultPickerChain(): PickerBackend[]
  export async function pickFolderNative(chain?: PickerBackend[]): Promise<PickerResult>
  export function createPickerGate(): { isBusy(): boolean; run<T>(fn: () => Promise<T>): Promise<T> }
  ```
  Route `POST /api/library/pick-folder` keeps its current contract: 200 `{canceled: true}` when dismissed, 200 `{canceled: false, path}` when chosen, 409 when a picker is already open, 501 when no backend exists, 500 otherwise.

- [ ] **Step 1: Write the failing tests**

Create `tests/picker-chain.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MEDIA_NO_LISTEN = '1';
const { pickFolderNative, createPickerGate } = await import('../server.ts');

test('chain returns the path from the first backend that answers', async () => {
  const chain = [
    { id: 'first', run: async () => ({ canceled: false, path: '/tmp/picked' }) },
    { id: 'second', run: async () => ({ canceled: false, path: '/tmp/never' }) },
  ];
  assert.deepEqual(await pickFolderNative(chain), { canceled: false, path: '/tmp/picked' });
});

test('chain treats a thrown backend as unavailable and moves on', async () => {
  const chain = [
    { id: 'first', run: async () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); } },
    { id: 'second', run: async () => ({ canceled: false, path: '/tmp/picked' }) },
  ];
  assert.deepEqual(await pickFolderNative(chain), { canceled: false, path: '/tmp/picked' });
});

test('chain reports cancellation', async () => {
  const chain = [{ id: 'only', run: async () => ({ canceled: true }) }];
  assert.deepEqual(await pickFolderNative(chain), { canceled: true });
});

test('chain reports cancellation when every backend cancels', async () => {
  const chain = [{ id: 'a', run: async () => ({ canceled: true }) }];
  assert.deepEqual(await pickFolderNative(chain), { canceled: true });
});

test('gate rejects a second concurrent run and releases after the first', async () => {
  const gate = createPickerGate();
  let release = () => {};
  const first = gate.run(() => new Promise<string>((r) => { release = () => r('done'); }));
  await assert.rejects(() => gate.run(async () => 'second'), /already open/);
  assert.equal(gate.isBusy(), true);
  release();
  assert.equal(await first, 'done');
  assert.equal(gate.isBusy(), false);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test`
Expected: FAIL — `pickFolderNative` and `createPickerGate` are not exported (import yields `undefined`, the test throws).

- [ ] **Step 3: Implement the chain and the gate**

In `server.ts`, replace the body of `pickFolderNative` (currently `server.ts:1453-1509`) with:

```ts
type PickerResult = { canceled: true } | { canceled: false; path: string };
interface PickerBackend { id: string; run(): Promise<PickerResult> }

const PICKER_TIMEOUT = 5 * 60 * 1000;

function commandBackend(id: string, cmd: string, args: string[]): PickerBackend {
  return {
    id,
    run: async () => {
      const { stdout } = await execFileAsync(cmd, args, { timeout: PICKER_TIMEOUT, windowsHide: true });
      const chosen = stdout.trim();
      return chosen ? { canceled: false, path: chosen } : { canceled: true };
    },
  };
}

function defaultPickerChain(): PickerBackend[] {
  const forced = (process.env.MEDIA_PICKER_BACKEND || 'auto').trim().toLowerCase();
  const chain: PickerBackend[] = [];
  const add = (id: string, make: () => PickerBackend) => {
    if (forced === 'auto' || forced === id) chain.push(make());
  };
  if (process.platform === 'win32') {
    // Reuse the existing script at server.ts:1457-1463 unchanged.
    add('powershell', () => commandBackend('powershell', 'powershell.exe', [
      '-NoProfile', '-NonInteractive', '-STA', '-Command', WINDOWS_FOLDER_DIALOG_SCRIPT,
    ]));
  }
  if (process.platform === 'darwin') {
    // Reuse the existing call at server.ts:1475-1481 unchanged.
    add('osascript', () => commandBackend('osascript', 'osascript', [
      '-e', 'POSIX path of (choose folder with prompt "Select a media folder")',
    ]));
  }
  // Reuse the existing call at server.ts:1490-1491 unchanged.
  add('zenity', () => commandBackend('zenity', 'zenity', ['--file-selection', '--directory', '--title=Select a media folder']));
  add('kdialog', () => commandBackend('kdialog', 'kdialog', ['--getexistingdirectory', os.homedir(), '--title', 'Select a media folder']));
  add('gtk4', () => gtk4PickerBackend());
  add('portal', () => portalPickerBackend());
  return chain;
}

export async function pickFolderNative(chain: PickerBackend[] = defaultPickerChain()): Promise<PickerResult> {
  for (const backend of chain) {
    try {
      return await backend.run();
    } catch (err: any) {
      if (err?.code === 'ENOENT') continue;
      if (err?.killed || err?.signal) return { canceled: true };
      const detail = `${err?.stderr || ''} ${err?.message || ''}`;
      if (err?.code === 1 || /cancel|-128/i.test(detail)) return { canceled: true };
      logDetail(`folder picker backend failed: ${backend.id}`, err);
      continue;
    }
  }
  throw Object.assign(new Error('No native folder picker is available. Paste the folder path instead.'), { statusCode: 501 });
}

export function createPickerGate() {
  let busy = false;
  return {
    isBusy: () => busy,
    run: async <T,>(fn: () => Promise<T>): Promise<T> => {
      if (busy) throw Object.assign(new Error('A folder picker is already open. Finish it first.'), { statusCode: 409 });
      busy = true;
      try { return await fn(); } finally { busy = false; }
    },
  };
}

const pickerGate = createPickerGate();
```

`WINDOWS_FOLDER_DIALOG_SCRIPT` is the existing PowerShell script from `server.ts:1458-1462`, moved into a module-level constant without changing it.

Tasks 5 and 6 add `gtk4PickerBackend()` and `portalPickerBackend()`. **Until they land, declare them as stubs that throw `ENOENT`** so Task 4 compiles and passes on its own:

```ts
function gtk4PickerBackend(): PickerBackend {
  return { id: 'gtk4', run: async () => { throw Object.assign(new Error('gtk4 backend not implemented'), { code: 'ENOENT' }); } };
}
function portalPickerBackend(): PickerBackend {
  return { id: 'portal', run: async () => { throw Object.assign(new Error('portal backend not implemented'), { code: 'ENOENT' }); } };
}
```

Replace the route body at `server.ts:1622-1650` with:

```ts
app.post('/api/library/pick-folder', async (req, res) => {
  const blocked = browseGuard(req);
  if (blocked) return res.status(403).json({ error: blocked });
  try {
    const result = await pickerGate.run(() => pickFolderNative());
    if (result.canceled || !('path' in result)) return res.json({ canceled: true });
    const abs = path.resolve(expandUserPath(result.path));
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      return res.status(404).json({ error: `Folder not found: ${abs}` });
    }
    if (!st.isDirectory()) return res.status(400).json({ error: `Not a folder: ${abs}` });
    res.json({ canceled: false, path: abs });
  } catch (err: any) {
    logDetail('folder picker failed', err);
    const status = Number(err?.statusCode) || 500;
    res.status(status === 501 ? 501 : status === 409 ? 409 : 500).json({
      error: status === 501
        ? 'No native folder picker is available on this system. Paste the folder path instead.'
        : status === 409
          ? 'A folder picker is already open. Finish it first.'
          : 'The folder picker could not open. Paste the folder path instead.',
    });
  }
});
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test`
Expected: PASS — 17 tests, 0 failures.

- [ ] **Step 5: Verify the 501 path end to end**

Run: `MEDIA_PICKER_BACKEND=none pnpm dev:server`, then
`curl -s -X POST localhost:8787/api/library/pick-folder`
Expected: HTTP 501 with `{"error":"No native folder picker is available on this system. Paste the folder path instead."}`

- [ ] **Step 6: Commit**

```bash
git add server.ts tests/picker-chain.test.ts
git commit -m "refactor: route folder picking through a backend chain"
```

---

### Task 5: GTK4 backend

**Files:**
- Modify: `server.ts` (replace the `gtk4PickerBackend` stub)
- Modify: `tests/picker-chain.test.ts`

**Interfaces:**
- Consumes: `PickerBackend` from Task 4.
- Produces: `gtk4PickerBackend(): PickerBackend` that prints an absolute path or the sentinel `__CANCELED__`.

- [ ] **Step 1: Write the failing test**

Append to `tests/picker-chain.test.ts`:

```ts
test('gtk4 backend reports the sentinel when the dialog is dismissed', async () => {
  const backend = (await import('../server.ts')).__pickerBackends.gtk4();
  const result = await backend.run();
  assert.deepEqual(result, { canceled: true });
});
```

This test needs a display, so it is skipped when `DISPLAY` and `WAYLAND_DISPLAY` are both unset — guard it with `test('...', { skip: !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY ? 'no display' : false }, async () => { ... })`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test`
Expected: FAIL — `__pickerBackends` is not exported.

- [ ] **Step 3: Export the backend factory for tests**

In `server.ts`, next to `pickFolderNative`:

```ts
export const __pickerBackends = { gtk4: gtk4PickerBackend, portal: portalPickerBackend };
```

- [ ] **Step 4: Implement the GTK4 backend**

Replace the `gtk4PickerBackend` stub with:

```ts
const GTK4_SCRIPT = [
  'import sys',
  'import gi',
  'gi.require_version("Gtk", "4.0")',
  'from gi.repository import GLib, Gtk',
  'app = Gtk.Application(application_id="app.cal.folderpicker")',
  'def on_activate(application):',
  '    # hold() keeps the application alive: Gtk.FileDialog is a portal dialog, not a',
  '    # Gtk.Window, so without a hold the application exits before the dialog appears.',
  '    application.hold()',
  '    dialog = Gtk.FileDialog(title="Select a media folder")',
  '    def on_done(source, result):',
  '        try:',
  '            folder = source.select_folder_finish(result)',
  '            print(folder.get_path(), flush=True)',
  '        except GLib.Error:',
  '            print("__CANCELED__", flush=True)',
  '        application.quit()',
  '    dialog.select_folder(None, None, on_done)',
  'app.connect("activate", on_activate)',
  'app.run([])',
].join('\n');

function gtk4PickerBackend(): PickerBackend {
  return {
    id: 'gtk4',
    run: async () => {
      const { stdout } = await execFileAsync('python3', ['-c', GTK4_SCRIPT], { timeout: PICKER_TIMEOUT });
      const chosen = stdout.trim();
      if (!chosen || chosen === '__CANCELED__') return { canceled: true };
      return { canceled: false, path: chosen };
    },
  };
}
```

- [ ] **Step 5: Verify manually on this machine**

Run: `pnpm dev:server`, then `curl -s -X POST localhost:8787/api/library/pick-folder` — a GTK4 folder dialog must appear; cancel it and the response must be `{"canceled":true}`; pick a folder and the response must be `{"canceled":false,"path":"…"}`.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm test`
Expected: PASS — 18 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add server.ts tests/picker-chain.test.ts
git commit -m "feat: add GTK4 folder picker backend"
```

---

### Task 6: Portal backend (droppable)

**Files:**
- Modify: `server.ts` (replace the `portalPickerBackend` stub)
- Modify: `tests/picker-chain.test.ts`

**Interfaces:**
- Consumes: `PickerBackend` from Task 4.
- Produces: `portalPickerBackend(): PickerBackend` that accepts only `file://` URIs.

- [ ] **Step 1: Spike the portal calls by hand before writing code**

Run these and record the output in the commit message of this task:

```bash
gdbus introspect --session --dest org.freedesktop.portal.Desktop --object-path /org/freedesktop/portal/desktop | grep -c FileChooser
busctl --user call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus GetId
```

Expected on this machine: `1` and `s ":1.NN"`. The `GetId` output gives the caller's unique bus name, which is needed to predict the request path.

- [ ] **Step 2: Implement the portal backend**

Replace the `portalPickerBackend` stub with:

```ts
const PORTAL_TIMEOUT = 5 * 60 * 1000;

function portalPickerBackend(): PickerBackend {
  return {
    id: 'portal',
    run: async () => {
      const token = `cal${Date.now().toString(36)}`;
      const monitor = spawn('gdbus', [
        'monitor', '--session', '--dest', 'org.freedesktop.portal.Desktop',
        '--object-path', '/org/freedesktop/portal/desktop',
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      monitor.stdout.on('data', (chunk) => { out += String(chunk); });

      const { stdout } = await execFileAsync('gdbus', [
        'call', '--session', '--dest', 'org.freedesktop.portal.Desktop',
        '--object-path', '/org/freedesktop/portal/desktop',
        '--method', 'org.freedesktop.portal.FileChooser.OpenFile',
        '', 'Select a media folder',
        `{'handle_token': <'${token}'>, 'directory': <true>, 'multiple': <false>}`,
      ], { timeout: PORTAL_TIMEOUT });

      const requestPath = (stdout.match(/'([^']*\/request\/[^']*)'/) || [])[1];
      if (!requestPath) {
        monitor.kill();
        throw Object.assign(new Error('portal did not return a request handle'), { code: 'ENOENT' });
      }

      const deadline = Date.now() + PORTAL_TIMEOUT;
      while (Date.now() < deadline) {
        const line = (out.match(/org\.freedesktop\.portal\.Request\.Response \(uint32 (\d+),([\s\S]*)$/m) || [])[0];
        if (line) {
          monitor.kill();
          const code = Number(line.match(/uint32 (\d+)/)![1]);
          if (code !== 0) return { canceled: true };
          const uri = (line.match(/'file:\/\/[^']+'/) || [])[0];
          if (!uri) {
            throw Object.assign(new Error('That folder is a network or device location this app cannot read. Choose a folder on this computer.'), { statusCode: 400 });
          }
          return { canceled: false, path: decodeURIComponent(uri.replace(/^'file:\/\//, '').replace(/'$/, '')) };
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      monitor.kill();
      return { canceled: true };
    },
  };
}
```

Note for the implementer: `file://` URIs are percent-decoded by hand because the URI is captured from gdbus output, not from `new URL()`. A non-`file://` scheme (smb, dav, mtp) has no `file://` match, which is exactly the 400 case.

- [ ] **Step 3: Write the failing test**

Append to `tests/picker-chain.test.ts`:

```ts
test('portal backend is a runnable backend', { skip: !process.env.WAYLAND_DISPLAY ? 'no session bus' : false }, async () => {
  const backend = (await import('../server.ts')).__pickerBackends.portal();
  assert.equal(backend.id, 'portal');
  assert.equal(typeof backend.run, 'function');
});
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test`
Expected: PASS — 19 tests, 0 failures.

- [ ] **Step 5: Verify manually on this machine**

Run: `pnpm dev:server`, then `MEDIA_PICKER_BACKEND=portal pnpm dev:server` and `curl -s -X POST localhost:8787/api/library/pick-folder`. A GTK portal dialog must appear; cancelling must return `{"canceled":true}`.

- [ ] **Step 6: Commit**

```bash
git add server.ts tests/picker-chain.test.ts
git commit -m "feat: add desktop portal folder picker backend"
```

If the portal adapter cannot be made to work reliably, **stop and drop this task** — the chain falls through to the other backends, and the feature does not depend on it. Say so in the report rather than committing a flaky adapter.

---

### Task 7: Frontend types and data layer

**Files:**
- Modify: `src/types/index.ts` (after `LibraryListing`, `src/types/index.ts:56`)
- Modify: `src/utils/localLibrary.ts`
- Modify: `tests/fs-browse.test.ts` (contract test against the live route)

**Interfaces:**
- Produces:
  ```ts
  // src/types/index.ts
  export interface BrowsePlace { name: string; path: string; kind: 'home' | 'volume' | 'custom' }
  export interface FolderEntry { name: string; path: string }
  export interface ServerFolderListing {
    path: string; name: string; parent: string | null; isRoot: boolean;
    limit: number; places: BrowsePlace[]; entries: FolderEntry[]; truncated: boolean;
  }
  export interface FolderPickerCapability { platform: string; available: boolean; backend: string | null; detail: string | null }

  // src/utils/localLibrary.ts
  export function listServerFolders(path?: string): Promise<ServerFolderListing>
  export function getFolderPickerCapability(refresh?: boolean): Promise<FolderPickerCapability>
  ```

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, after the `LibraryListing` interface, add the four interfaces exactly as written above.

- [ ] **Step 2: Add the data-layer functions**

In `src/utils/localLibrary.ts`, add the imports for the new types and the two functions:

```ts
export function listServerFolders(path?: string): Promise<ServerFolderListing> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  const query = params.toString();
  return request<ServerFolderListing>(`/api/fs/dirs${query ? `?${query}` : ''}`);
}

export function getFolderPickerCapability(refresh = false): Promise<FolderPickerCapability> {
  return request<FolderPickerCapability>(`/api/fs/folder-picker${refresh ? '?refresh=1' : ''}`);
}
```

`request` already parses the body and throws `new Error(body.error)` for non-2xx, so `toUserMessage` in the caller shows the server's exact message.

- [ ] **Step 3: Add a contract test**

Append to `tests/fs-browse.test.ts`:

```ts
test('listing payload matches the frontend ServerFolderListing shape', async () => {
  const { body } = await get('/api/fs/dirs');
  assert.deepEqual(Object.keys(body).sort(), ['entries', 'isRoot', 'limit', 'name', 'parent', 'path', 'places', 'truncated']);
  assert.deepEqual(Object.keys(body.entries[0] ?? {}).sort(), ['name', 'path']);
  assert.deepEqual(Object.keys(body.places[0]).sort(), ['kind', 'name', 'path']);
});
```

- [ ] **Step 4: Run the tests and type-check**

Run: `pnpm test && pnpm lint`
Expected: PASS, and `tsc --noEmit` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/utils/localLibrary.ts tests/fs-browse.test.ts
git commit -m "feat: add client bindings for folder browsing"
```

---

### Task 8: `FolderBrowserModal`

**Files:**
- Create: `src/components/MediaLibrary/FolderBrowserModal.tsx`

**Interfaces:**
- Consumes: `listServerFolders`, `getFolderPickerCapability` from Task 7; `ServerFolderListing`, `FolderEntry`, `BrowsePlace` types.
- Produces:
  ```tsx
  interface FolderBrowserModalProps {
    isOpen: boolean;
    initialPath?: string;
    onClose: () => void;
    onSelect: (path: string) => void;
  }
  export const FolderBrowserModal: React.FC<FolderBrowserModalProps>
  ```
  It must not import from `MediaLibraryModal` (no cycle).

- [ ] **Step 1: Create the component shell**

Create `src/components/MediaLibrary/FolderBrowserModal.tsx` with:
- Imports: `React, { useEffect, useRef, useState }`, lucide icons `X, Folder, FolderOpen, ChevronRight, ChevronLeft, RefreshCw, AlertCircle, HardDrive, Home`, `listServerFolders`, `toUserMessage`, and the types.
- Props interface exactly as above.
- State: `listing: ServerFolderListing | null`, `loading: boolean`, `error: string | null`, `highlight: number`.
- The modal shell copies the repo's modal conventions from `src/components/MediaLibrary/MediaPreviewModal.tsx:196-206`: outer `div` with `className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex flex-col"`, `role="dialog"`, `aria-modal="true"`, `aria-label="Browse folders"`, `onClick={onClose}`, and an inner `div` with `onClick={(event) => event.stopPropagation()}`.
- `useEffect` for `Escape` → `onClose`, mirroring `MediaPreviewModal.tsx:171-183`.

- [ ] **Step 2: Implement loading and navigation**

- On open, load `initialPath` if given, otherwise call `listServerFolders()` with no argument (the server picks the first browse root).
- `open(path: string)` → set loading, call `listServerFolders(path)`, on success set `listing` and `highlight: 0`, on failure set `error` to `toUserMessage(err, 'That folder could not be opened. Please try again.')`.
- A 403/404 for `initialPath` must fall back to `listServerFolders()` silently — no error banner.
- `goUp()` → `listing.parent ? open(listing.parent) : null`.
- `selectPlace(place: BrowsePlace)` → `open(place.path)`.
- `enter(entry: FolderEntry)` → `open(entry.path)`.
- `useFolder(path)` → `open(path)`.

- [ ] **Step 3: Render the layout**

- Left rail (`hidden sm:flex`, `w-40 shrink-0`): a "Places" heading and one button per `listing.places`, each showing `place.name` with a `HardDrive` or `Home` icon; clicking selects that place. On small screens render the same list in a collapsible block above the list.
- Breadcrumb row: a back button (disabled when `!listing.parent`) showing `ChevronLeft`, then the current path as text with `title={listing.path}`; the path is `text-[11px] text-neutral-500 truncate`.
- Folder list: one row per `listing.entries`, each a `button` with `Folder` icon, the name, and `onClick` → highlight, `onDoubleClick` → `enter(entry)`. Highlighted row uses `bg-blue-50 text-[#0000ee]`, matching the existing tree rows at `MediaLibraryModal.tsx:296-300`.
- Footer: a "Use this folder" primary button (`onClick={() => onSelect(listing.path)}`, disabled while `loading` or when `!listing`) and a "Cancel" button (`onClose`).
- Empty state: "This folder has no subfolders." when `listing.entries.length === 0`.
- Truncation notice: when `listing.truncated`, show "Showing the first {listing.limit} folders." — the client reads the cap from the response, it does not guess it.
- Error banner: `AlertCircle` icon plus the message, with a "Retry" button that re-runs the current path. The message is the server's own text, shown verbatim — a folder deleted between listing and selection produces `That folder could not be found. Check the path and try again.`, and a folder outside the allowed roots produces `That folder is outside the folders this app is allowed to browse.`
- Loading: the list area shows a spinner (`RefreshCw` with `animate-spin`) — the only animation class allowed.

- [ ] **Step 4: Add keyboard handling and focus**

- `ArrowUp`/`ArrowDown` move `highlight` within `listing.entries` (clamped).
- `Enter` calls `enter(listing.entries[highlight])` when there is one.
- `Backspace` calls `goUp()` (when the target is not an input).
- On open, focus the list container; on close, restore focus to the element that had it before opening (store it in a `useRef` at mount).

- [ ] **Step 5: Type-check and build**

Run: `pnpm lint && pnpm build`
Expected: `tsc --noEmit` clean and `vite build` succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/MediaLibrary/FolderBrowserModal.tsx
git commit -m "feat: add folder browser modal"
```

---

### Task 9: Wire the modal into `MediaLibraryModal`

**Files:**
- Modify: `src/components/MediaLibrary/MediaLibraryModal.tsx` (add-folder form at `MediaLibraryModal.tsx:769-814`)

**Interfaces:**
- Consumes: `FolderBrowserModal` from Task 8, `getFolderPickerCapability`, `pickLibraryFolder` from Task 7 / existing code.
- Produces: no new exports.

- [ ] **Step 1: Add state and the capability fetch**

In `MediaLibraryModal`, add state next to the existing library state (`MediaLibraryModal.tsx:83-85`):

```ts
const [isBrowsingFolders, setIsBrowsingFolders] = useState(false);
const [pickerCapability, setPickerCapability] = useState<FolderPickerCapability | null>(null);
```

Fetch the capability once when the modal opens (in the existing `isOpen` effect), and compute locality in the browser:

```ts
const isLocalHost = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
```

The system-dialog button is shown only when `pickerCapability?.available && isLocalHost` — the dialog would open on the server's screen, which is not the phone's.

- [ ] **Step 2: Replace the add-folder form**

Replace the block at `MediaLibraryModal.tsx:769-814` with a row containing:
1. The existing text input plus the existing submit button (keep the `+` icon and `title="Scan folder"`), with the label changed to "Add local folder" → keep, and the helper text changed to "Browse or paste a full path. Files stay in place — nothing is copied."
2. A "Browse folders..." button (`FolderOpen` icon) that sets `isBrowsingFolders` to true.
3. The existing "Browse folder..." button (`MediaLibraryModal.tsx:792-810`) renamed to "Use system dialog" and rendered only when `pickerCapability?.available && isLocalHost`.

Keep `handleBrowseFolder` for the system dialog and add `handleFolderSelected(path: string)` that calls `registerRoot(path)` and closes the browser modal, reusing the same error handling as `handleBrowseFolder`.

- [ ] **Step 3: Mount the modal**

Render `<FolderBrowserModal isOpen={isBrowsingFolders} initialPath={newRootPath.trim() || undefined} onClose={() => setIsBrowsingFolders(false)} onSelect={handleFolderSelected} />` next to `<MediaPreviewModal>` at the end of the component.

- [ ] **Step 4: Type-check and build**

Run: `pnpm lint && pnpm build`
Expected: both clean.

- [ ] **Step 5: Verify manually**

Run `pnpm dev:server` and `pnpm dev`. Then, at desktop width:
- "Browse folders..." opens the modal showing `Home` and the mounted volumes.
- Clicking into `/run/media/data/salmonpro` → `cal` → "Use this folder" adds the root, the tree expands, media list loads.
- "Use system dialog" appears (this machine has `gtk4`) and opens a real GTK dialog; cancelling leaves the UI idle, with no stuck spinner and no 409 on the next attempt.
- Close the browser with `Escape`; focus returns to the button that opened it.
- At phone width (375px), the places list collapses, rows are tappable, and "Use system dialog" is absent.

Then the remote gate, from the phone on the LAN address of the dev server:
- With `MEDIA_BROWSE_REMOTE=0` in `.env` (the default), opening "Browse folders..." shows the error `Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.`, and "Use system dialog" is still absent.
- With `MEDIA_BROWSE_REMOTE=1` and the backend restarted, browsing works from the phone and "Use system dialog" is still absent (the dialog would open on the desktop).
- In both cases the paste field still works from the phone.

- [ ] **Step 6: Commit**

```bash
git add src/components/MediaLibrary/MediaLibraryModal.tsx
git commit -m "feat: wire folder browser into the media library"
```

---

### Task 10: Environment variables and documentation

**Files:**
- Modify: `.env.example`
- Modify: `docs/knowledge-base/01-architecture.md`
- Modify: `docs/knowledge-base/05-development.md`
- Modify: `docs/knowledge-base/06-known-gaps-and-recipes.md`
- Modify: `README.md` (only if it documents adding a library folder)

**Interfaces:**
- Produces: no code.

- [ ] **Step 1: Add the env vars to `.env.example`**

Append a block:

```
# --- Folder browsing ---
# Limit folder browsing to specific trees (os.path.delimiter separated).
# Default: home folder + mounted volumes (/media, /mnt, /run/media, /Volumes, drives).
MEDIA_BROWSE_ROOTS=""

# Turn the folder browser off entirely.
# Unset = on. Off = 0, off, false, no (case-insensitive).
MEDIA_BROWSE="1"

# Allow folder browsing from other devices (phone, second laptop, tunnel).
# 0 = only the computer running the app may browse; 1 = anyone who can reach it.
MEDIA_BROWSE_REMOTE="0"

# Max subfolders returned per listing.
FS_LIST_LIMIT="1000"
```

- [ ] **Step 2: Document the endpoints**

In `docs/knowledge-base/01-architecture.md`, add the two new endpoints to the API list with one line each: `GET /api/fs/dirs` (server-side directory listing, scoped to browse roots) and `GET /api/fs/folder-picker` (native backend probe).

- [ ] **Step 3: Document the env vars and the test command**

In `docs/knowledge-base/05-development.md`, add the four env vars with their defaults and the new `pnpm test` command.

- [ ] **Step 4: Add the security note and the recipe**

In `docs/knowledge-base/06-known-gaps-and-recipes.md`:
- Add a note in the security section: folder browsing is scoped to browse roots and refused for remote clients unless `MEDIA_BROWSE_REMOTE=1`; the `Host` header check is a guarding rail, not authentication.
- Add a recipe "Choosing a media folder": what the Browse button does, what the system dialog does, and how to set `MEDIA_BROWSE_ROOTS`.

- [ ] **Step 5: Verify the docs match the code**

Run: `grep -n "MEDIA_BROWSE\|FS_LIST_LIMIT\|api/fs/dirs\|api/fs/folder-picker" .env.example docs/knowledge-base/*.md`
Expected: every variable and endpoint appears with the same spelling as in `server.ts`.

- [ ] **Step 6: Run the full verification**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: `tsc --noEmit` clean, all tests pass, `vite build` succeeds.

- [ ] **Step 7: Commit**

```bash
git add .env.example docs/knowledge-base/01-architecture.md docs/knowledge-base/05-development.md docs/knowledge-base/06-known-gaps-and-recipes.md README.md docs/superpowers
git commit -m "docs: document folder browsing endpoints and settings"
```
