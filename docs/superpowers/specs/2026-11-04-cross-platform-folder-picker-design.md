# Cross-platform folder selection — design

Date: 2026-11-04
Status: awaiting approval
Scope: how the app lets a user choose a media library folder on Windows, macOS,
Linux (including Wayland and headless servers), and from a phone browser.

---

## 1. Intent

Today "Add folder" either needs a typed path or a native OS dialog. The dialog is
shelled out from the backend (`server.ts:1453-1509`) and only exists on Linux if
`zenity` or `kdialog` is installed. On this machine neither is, so the endpoint
returns 501 and the UI shows:

> No native folder picker is available on this system. Paste the folder path instead.

The goal is a folder chooser that works on every OS, in a browser on another
machine, and from a phone — without making the app's core function depend on
which desktop packages happen to be installed.

**The constraint that shapes everything else:** the folder being chosen is a path
on the machine running the Express server. Roots are stored as absolute paths
(`library-roots.json`), listing is `fs.readdirSync` (`server.ts:1563`), thumbnails
come from `sharp`/`ffmpeg` reading disk. The browser is only a client. A
browser-side picker (File System Access API, `webkitdirectory`, Android SAF) can
only return *client* files or handles — never a server path.

## 2. Goals

1. Choose a server-side folder on Windows, macOS and Linux with one code path.
2. Work when the server has no display, no GTK, no zenity, runs in Docker, or is
   reached from another device (phone, tablet, second laptop).
3. Keep the OS-native dialog as an *optional* accelerator, offered only when a
   probe proves a backend exists — never as a requirement.
4. Never trap the user: the typed path stays, and every failure has a way forward.
5. Listings must stay inside an explicit allowlist of browse roots.

## 3. Non-goals

- Uploading media from the picking device. On a phone, "browse folders" means
  *the computer's* folders. Importing from the phone's own gallery is a separate
  feature (needs an upload path, storage model change, and its own design).
- Replacing the existing library tree (`/api/library/list`) inside a root. That
  tree stays exactly as it is; this design only adds browsing *before* a root exists.
- Authentication. Out of scope; see §9.2.

## 4. Anti-goals

What would make this a failure even if it works:

- A picker that only functions on the developer's own desktop.
- A picker that silently falls back to a blank screen or a spinner when a backend
  is missing.
- Exposing the whole filesystem to anyone who can reach the port.

## 5. Approaches considered

| | Approach | Cross-OS | Phone / remote | Headless / Docker | Verdict |
|---|---|---|---|---|---|
| **A** | Server lists directories, UI draws them (`GET /api/fs/dirs`) | uniform | works | works | **Chosen as base** |
| **B** | Native dialog adapter chain + capability probe | per-OS, per-DE | meaningless | fails | **Chosen as optional accelerator** |
| **C** | Client-side pickers (FSA API / `webkitdirectory` / Capacitor SAF) | Chromium only | only as an *upload* feature | works | Rejected for this feature |

Why A is the base: it asks the OS for nothing, so it cannot fail for the same
reason the current code fails. It is also the only approach that behaves the same
on a phone, a remote browser, a headless box and a dev laptop.

Why B survives: a native dialog is genuinely nicer when it is available — OS
favourites, network shares, type-ahead. Keeping it behind a probe preserves that
without paying for it on machines that can't provide it. The 501 in the current
code stops being an error the user sees and becomes an invisible capability gap.

Why C is rejected for this feature: it returns client files, not server paths.
It would be a different product (import from device). Recorded as future work in §11.

## 6. Design

### 6.1 Browse roots (the allowlist)

A single module-level function, `browseRoots()`, returns the folders browsing may
start from and may never leave:

```
interface BrowseRoot { name: string; path: string; kind: 'home' | 'volume' | 'custom' }
```

Resolution order:

1. `MEDIA_BROWSE_ROOTS` env, split on `path.delimiter`. If the variable is unset,
   empty, or whitespace-only, it is treated as **unset** — do not run
   `path.resolve('')`, which would silently make the process cwd a browse root.
   Empty segments are dropped (`/a::/b` is harmless). Each entry is `~`-expanded
   via `expandUserPath` (`server.ts:1421`), resolved, and kept only if it is an
   existing directory, `kind: 'custom'`, named `path.basename`.
   When this variable is set, the list is **exactly** what it names — `os.homedir()`
   is not appended implicitly.
2. Otherwise defaults, always including `os.homedir()` as `{ name: 'Home', kind: 'home' }`:
   - Windows: `os.homedir()` plus every drive letter `A:`–`Z:` that exists
     (`fs.existsSync('C:\\')`), `kind: 'volume'`.
   - macOS: `os.homedir()` plus immediate children of `/Volumes` that are
     directories, `kind: 'volume'`.
   - Linux: `os.homedir()` plus **real mount points** under `/media`, `/mnt` and
     `/run/media`, read from `/proc/mounts` (a child segment is required, so a
     tmpfs mounted on `/run/media` itself is not offered). A volume is a mount
     point, not merely a directory that happens to sit under those roots —
     otherwise `Program Files`, `Recovery` and `$RECYCLE.BIN` would be offered
     as browsable places. When `/proc/mounts` is unreadable, fall back to the
     immediate children of those roots. `kind: 'volume'`.

If the resulting list is empty (for example `MEDIA_BROWSE_ROOTS` names only
missing paths), browsing is unavailable: `/api/fs/dirs` returns
`500 No folders are available to browse on this computer.` and the UI falls back
to the paste field.

Navigation is allowed to a path `p` iff `realpath(p)` equals or is inside
`realpath(root.path)` for some root, compared case-insensitively on Windows. `~`
expansion reuses the existing `expandUserPath` (`server.ts:1421`). Paths are
normalised with `path.resolve`, NUL bytes rejected (same rule as
`resolveInRoot`, `server.ts:1434`).

Consequence: "up" stops at the root boundary (`parent: null`, `isRoot: true`);
a symlink that escapes a root is not entered. Both are intended.

### 6.2 `GET /api/fs/dirs`

Query: `path` — absolute path or empty. Empty selects the first browse root.

```json
{
  "path": "/run/media/data/salmonpro",
  "name": "salmonpro",
  "parent": "/run/media/data",
  "isRoot": false,
  "places": [
    { "name": "Home", "path": "/home/salmon", "kind": "home" },
    { "name": "salmonpro", "path": "/run/media/data/salmonpro", "kind": "volume" }
  ],
  "entries": [{ "name": "cal", "path": "/run/media/data/salmonpro/cal" }],
  "truncated": false
}
```

Rules, matching the conventions already used by `/api/library/list`
(`server.ts:1554-1612`):

- Directories only. Files are omitted — this endpoint selects folders.
- Names starting with `.` are skipped.
- Sort with `localeCompare(undefined, { numeric: true })`.
- Cap entries at `FS_LIST_LIMIT` (env-overridable, default 1000) and set
  `truncated: true` — a phone must not be asked to render 40k entries.
- `places` is always the full browse-root list, even when the current folder is
  not itself a root.
- Symlinked directories are included; `realpath` is used for the scope check and
  to detect loops (a child whose realpath equals the current realpath is skipped).

Status codes and messages (human sentences, no codes — the project convention
enforced by `src/utils/errorMessages.ts`):

| Case | Status | Message |
|---|---|---|
| Empty path, no roots resolvable | 500 | `No folders are available to browse on this computer.` |
| Not a directory / NUL / weird type | 400 | `That path points to a file, not a folder.` |
| Outside every browse root | 403 | `That folder is outside the folders this app is allowed to browse.` |
| Missing (`ENOENT`) | 404 | `That folder could not be found. Check the path and try again.` |
| `EACCES` / `EPERM` | 403 | `That folder cannot be read. Check its permissions.` |
| Browsing disabled (`MEDIA_BROWSE` off) | 403 | `Folder browsing is turned off on this computer. Paste the folder path instead.` |
| Remote request, `MEDIA_BROWSE_REMOTE=0` | 403 | `Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.` |

`MEDIA_BROWSE` off is a switch over the whole feature, not just this route: the
probe in §6.3 reports `available: false` with the same reason, and
`POST /api/library/pick-folder` returns 403 with the same message so a stale
page cannot spawn a dialog. The UI then shows only the paste field.

**Kill-switch semantics.** `MEDIA_BROWSE` is read at call time. It is **off only
for an explicit off value** — `0`, `off`, `false`, `no` (trimmed,
case-insensitive). Anything else, **including unset**, leaves browsing on. Two
reasons: the feature must work for someone who runs the server with no `.env`
at all (a default-off reading would make the endpoint dead on arrival, which is
the bug this feature exists to fix), and a kill switch that ignores the
spellings a human would actually type (`off`, `false`) is a kill switch that
fails open. `MEDIA_BROWSE_REMOTE` is deliberately the opposite: remote access is
opt-in and fail-closed, because only `"1"` enables it.

`isLocalRequest(req)` decides the remote gate, in this order (all must hold):

1. `Host` (port stripped) is `localhost`, `127.0.0.1`, `::1` or `[::1]`.
2. None of `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip` is present.
3. `Origin`, when present, has a loopback host.

The `Host` check is what survives the dev setup: Vite proxies `/api` without
`changeOrigin`, so the original host header (`localhost:3000` or
`something.trycloudflare.com`) is what arrives at `server.ts`. This is a guarding
rail against accidental exposure, not authentication — anyone who can already
send raw requests to port 8787 can forge headers, and the app has no auth at all
(gap #22). It is documented as such.

### 6.3 `GET /api/fs/folder-picker` — capability probe

Answers "is there a native dialog on this machine, and which one". Cached per
process; `?refresh=1` re-probes.

```json
{ "platform": "linux", "available": true, "backend": "gtk4", "detail": null }
{ "platform": "linux", "available": false, "backend": null,
  "detail": "No zenity, kdialog, GTK4 or desktop portal backend was found." }
```

Probe order and test (first hit wins):

| Platform | Order | Test |
|---|---|---|
| linux | `zenity` → `kdialog` → `gtk4` → `portal` | `zenity`/`kdialog`: present on `PATH`. `gtk4`: `python3 -c "import gi; gi.require_version('Gtk','4.0'); from gi.repository import Gtk; Gtk.FileDialog"` exits 0 within 5s. `portal`: `gdbus introspect --session --dest org.freedesktop.portal.Desktop --object-path /org/freedesktop/portal/desktop` exits 0. |
| darwin | `osascript` | `/usr/bin/osascript` exists. |
| win32 | `powershell` | `powershell.exe` resolvable on `PATH` (fall back to `pwsh`). |

On Linux, `zenity`/`kdialog`/`gtk4` additionally require `DISPLAY` or
`WAYLAND_DISPLAY`; without one they are reported unavailable and `portal` is
tried last (it can still reach a session bus). Verified on this machine:

```
GTK 4.24.1  FileDialog: True
portal introspect: FileChooser present
zenity: NOT installed   kdialog: NOT installed
```

So after this change this machine reports `backend: "gtk4"`, and on a machine
with none of the four it reports `available: false` and the UI simply does not
show the system-dialog button.

The probe reports **server-side** capability. Whether the *client* may use it is
decided in the browser (§6.6), because the dialog would otherwise open on the
computer while a phone waits up to five minutes holding the mutex.

### 6.4 `POST /api/library/pick-folder` — adapter chain

Route and response contract stay as they are (`server.ts:1622-1650`), including
the `folderPickerBusy` 409 mutex and the 5-minute timeout.

`pickFolderNative()` gains a shared adapter shape:

```
type PickerResult = { canceled: true } | { canceled: false; path: string }
type Backend = { id: string; run(): Promise<PickerResult> }
```

- Backends are built in probe order; each attempt falls through on
  `ENOENT`/unavailable. Any other error is logged (`logDetail`) and falls through
  too, so one broken backend can't block the chain.
- Cancellation is per backend: zenity/kdialog exit code 1, osascript `-128`,
  PowerShell empty stdout, GTK4 sentinel line, portal `Response` code 1.
- Timeout or a killed process is treated as `canceled` (matches today's
  behaviour: a dialog nobody answered is not an error).
- All backends gone → 501 with the existing message, which is now accurate
  because the probe already told the UI not to offer the button.

New adapters:

**GTK4** (`backend: 'gtk4'`) — inline `python3 -c` script: `Gtk.Application` +
`Gtk.FileDialog(title="Select a media folder")`, `select_folder_finish`, print
the absolute path, print `__CANCELED__` on `GLib.Error`, `app.run([])`.

The script **must call `application.hold()`** before opening the dialog.
`Gtk.FileDialog` is implemented over the desktop portal and is not a
`Gtk.Window`, so the `GApplication` has no window to keep it alive and `run()`
returns within a second — the dialog never appears and the process exits. The
hold is released implicitly when the process exits, so it needs no matching
`release()`. Verified on this machine: without the hold the picker produced
nothing; with it the dialog opens, cancelling returns `{"canceled":true}` and
picking a folder returns its absolute path.

Note that `Gtk.FileDialog` is a **portal** dialog, so `Escape` does not dismiss
it and window-management tricks aimed at the "focused window" may hit an
unrelated window. The only safe dismissal is the dialog's own cancel action.

**Portal** (`backend: 'portal'`) — `gdbus` `FileChooser.OpenFile` with a fixed
`handle_token`, then read `org.freedesktop.portal.Request.Response` from a
`gdbus monitor` child; `code 0` + first `uris` entry → path, `code 1` → canceled.
URI handling is strict: only `file://` URIs are accepted (decoded with
`fileURLToPath`). GVFS/network schemes (`smb://`, `dav://`, `mtp://`) are
rejected with `400 That folder is a network or device location this app cannot
read. Choose a folder on this computer.` — those paths are not readable by the
library layer, and silently failing would be worse than saying so. This is the
highest-complexity backend, so it is last in the chain and only reached when the
other three are absent; it is also the only backend that works inside a Flatpak
sandbox.

Existing adapters are kept as-is: PowerShell `FolderBrowserDialog`
(`server.ts:1456-1471`), `osascript choose folder` (`server.ts:1473-1487`),
zenity/kdialog (`server.ts:1489-1503`).

### 6.5 Frontend: `FolderBrowserModal`

New file `src/components/MediaLibrary/FolderBrowserModal.tsx`.

```
props: { open: boolean; initialPath?: string; onClose(): void; onSelect(path: string): void }
```

`initialPath` is only a hint for which folder to open at. The caller passes the
current contents of the path input when it resolves to an existing directory;
otherwise it is omitted. If the server answers 403/404 for it, the modal silently
reopens at the first browse root without showing an error — a hint that missed is
not a failure the user needs to read about.

Layout:

- Left rail: `places` from the response, plus an "Up" affordance.
- Main: breadcrumb built from the current path, then one row per subfolder.
- Single click selects a row, double click or Enter enters it. Two distinct
  actions ("enter" vs "use this") prevents the classic wrong-folder selection.
- Primary action `Use this folder` submits the *current* folder. Disabled while
  loading or on error.
- Header "Browse folders", subtitle with the full current path (truncated in the
  middle, wrapped, or shown in a `title` attribute — full path always reachable).
- Mobile: one column, places behind a "Places" toggle, row height ≥ 44px.

States: first load (skeleton rows), folder load (dim + spinner on the list, keep
breadcrumb usable), error banner with `Retry`, empty folder ("This folder has no
subfolders"), `truncated` notice ("Showing the first 1000 folders").

Keyboard and a11y, matching the repo's existing modals: `role="dialog"`,
`aria-modal="true"`, labelled heading, focus trapped, focus restored to the
trigger on close, `Esc` closes, backdrop click closes, `↑`/`↓` move the row
highlight, `Enter` enters, `Backspace`/`←` go up. Path changes announced through
`aria-live="polite"`.

Data access goes through two new functions in `src/utils/localLibrary.ts`, next to
the existing ones:

```ts
listServerFolders(path?: string): Promise<FolderListing>
getFolderPickerCapability(): Promise<FolderPickerCapability>
```

Errors routed through `toUserMessage` as today; no new error taxonomy.

### 6.6 Wiring in `MediaLibraryModal`

Replace the add-root block (`MediaLibraryModal.tsx:203-243`) with three
affordances in one row:

1. `Browse…` — always present, opens `FolderBrowserModal` (approach A).
2. `Use system dialog` — rendered only when `getFolderPickerCapability()` reports
   `available: true` **and** the page is running on the server's own machine:
   `window.location.hostname` is `localhost`, `127.0.0.1`, `::1`, or `[::1]`.
   The locality check has to happen in the browser, not the server: in dev every
   `/api` request arrives through the Vite proxy from `127.0.0.1`, so the server
   cannot tell a phone from the desktop (and `allowedHosts` includes tunnel
   domains, so header inspection is equally unreliable). A remote user on a phone
   never sees a button whose dialog would open on someone else's screen.
3. The existing path input with `Add` — kept, now labelled "or paste a path".
   Needed for keyboard users, network shares that aren't in `places`, and the
   disabled-browsing case.

Selected paths then flow through the existing `registerRoot()` unchanged
(`addLibraryRoot` → active root → expanded tree).

### 6.7 Config additions (`.env.example` + `docs/knowledge-base/05-development.md`)

```
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

## 7. Decisions I made (builder calls, challengeable)

- **Directories only** on `/api/fs/dirs`. Files add noise to a folder chooser and
  the add-root endpoint rejects files anyway.
- **`realpath` for the scope check**, so a symlink cannot escape a browse root.
  Cost: a `~/folder` symlinked to a path outside every root is not browsable;
  the user can set `MEDIA_BROWSE_ROOTS` or paste the path.
- **Phone browses the computer's folders, not its own.** Matches the current
  architecture and the stated goal; device import is deferred.
- **Remote browsing is gated by `MEDIA_BROWSE_REMOTE`, default `0`.** The app
  binds all interfaces with no auth (gap #22) and `vite.config.ts:24` allows
  `.trycloudflare.com` hosts, so "reachable from a phone" can mean "reachable
  from the internet". Secure default: only the machine running the app can
  browse; a phone gets 403 with a message naming the exact variable to set.
  `MEDIA_BROWSE=0` kills the feature outright.
- **"Local" for the system dialog is judged in the browser**
  (`window.location.hostname`), while the remote *browse* gate is judged on the
  server from the `Host` header (§6.2). Two different questions: the server can
  answer "may this client enumerate folders", but only the client knows which
  screen a native dialog would appear on. In dev the Vite proxy makes every
  request originate from `127.0.0.1`, so a server-side IP check cannot tell a
  phone from the desktop — but it does not need to, because `Host` survives the
  proxy unchanged.
- **Capability probe cached per process.** Re-probing spawns `python3`/`gdbus`;
  doing that per page load is waste. `?refresh=1` for the odd case where the user
  installs zenity while the server runs.
- **No new dependencies.** Everything is `node:child_process`, `node:fs`,
  existing Express.

## 8. Verification plan

No test framework exists in this repo; `pnpm lint` is `tsc --noEmit`. Plan:

1. **Unit/route tests, no new deps.** `node --import tsx --test tests/*.test.ts`,
   new npm script `test`. Requires one small change to `server.ts`: export `app`
   and skip `app.listen` when `MEDIA_NO_LISTEN=1` (`server.ts:1947`), so a test
   can mount it on an ephemeral port.
   Cases: dirs-only listing; dotfile hidden; numeric sort; path outside browse
   roots → 403; `../../etc` traversal → 403; missing → 404; file → 400; NUL → 400;
   `MEDIA_BROWSE=0` → 403; `truncated` with `FS_LIST_LIMIT=3`; `places` always
   present; probe returns a stable shape; **remote gate**: request with
   `Host: example.com` and `MEDIA_BROWSE_REMOTE=0` → 403, same request with
   `MEDIA_BROWSE_REMOTE=1` → 200, and `Host: localhost` → 200 either way;
   `MEDIA_BROWSE_ROOTS=""` yields home + volumes, not the cwd
   (`process.cwd()` never appears in `places`).
2. **Runtime, this machine** (`pnpm dev:server`):
   ```
   curl -s localhost:8787/api/fs/dirs | jq '.path, (.entries|length), (.places|length)'
   curl -s 'localhost:8787/api/fs/dirs?path=/etc' | jq      # expect 403 (outside roots)
   curl -s -H 'Host: example.com' localhost:8787/api/fs/dirs # expect 403 (remote gate)
   curl -s localhost:8787/api/fs/folder-picker | jq          # expect backend "gtk4"
   ```
3. **Manual click-through**: Browse… → `/run/media/data/salmonpro` → `cal` → Use
   this folder → root appears, tree expands, media lists.
4. **Phone flow**: start the dev server, set `MEDIA_BROWSE_REMOTE=1` in `.env`,
   restart the backend, open the LAN address on the phone, browse
   `/run/media/data/salmonpro`, add it. Confirm `Use system dialog` is *not*
   shown on the phone and *is* shown on the desktop. Then set
   `MEDIA_BROWSE_REMOTE=0` again and confirm the phone gets the "other devices"
   message and can still add a root by pasting the path.
5. **Native path**: click "Use system dialog" on this machine, cancel it once and
   confirm the UI returns to idle (no stuck 409), then pick a folder and confirm
   the root registers.
6. `pnpm lint` clean; `pnpm build` succeeds.

## 9. Risks

1. **Enumeration over an unauthenticated port** — §6.2. Mitigated by browse roots,
   the remote gate (default off), and `MEDIA_BROWSE=0`; documented in known gaps
   rather than silently. Residual risk: header forgery, and the app still has no
   auth anywhere.
2. **Portal adapter complexity** — the only piece with a real chance of needing
   iteration. It is last in the chain, so a broken portal means "fall through",
   never "picker broken".
3. **GTK4 script on non-GTK systems** — guarded by the probe; a failed spawn falls
   through like any other backend.
4. **Windows drive enumeration cost** — 26 `existsSync` calls, cached with the
   roots for the process lifetime.

## 10. Docs to update

- `docs/knowledge-base/01-architecture.md` — the two new endpoints and the browse-root model.
- `docs/knowledge-base/06-known-gaps-and-recipes.md` — add the browse-roots
  security note next to gap #22; add a recipe "choosing a media folder".
- `docs/knowledge-base/05-development.md` — the new env vars and `pnpm test`.
- `.env.example`, `README.md` if it documents adding a library folder.

## 11. Production deployment shapes

Decided 2026-11-04. "Browsing the local file manager" means the file manager of the
machine running the Express server — the browser is only a client, so it can never
hand the server a path on the user's disk. What is possible therefore depends on
where the backend runs.

| Deployment | Server-side browser | Native OS dialog | Reaches the user's own media |
|---|---|---|---|
| Backend on the user's machine (local install, Tauri/Electron shell) | browses the real filesystem | works — zenity / GTK4 / osascript / PowerShell | yes, indexed in place, nothing copied |
| Backend hosted (AI Studio / Cloud Run / VPS) | would browse the **container's** filesystem — no user media, and in a shared instance it can expose neighbouring tenants' files | impossible — no display, no session bus | no, unreachable |

Rules that follow:

1. **Hosted deployments set `MEDIA_BROWSE=0`.** The endpoint enumerates a filesystem
   the user does not own, and that filesystem may be shared with other tenants.
2. **Hosted product needs a second, different feature — import, not index.** The
   browser selects a folder *on the user's device* and the files are copied up to
   the existing store (`POST /api/storage/media` → `MEDIA_DIR/YYYY-MM-DD/`).
   Mechanics, for the next plan:
   - `<input type="file" webkitdirectory multiple>` — Baseline since Aug 2025.
     Desktop: Chrome/Edge/Firefox/Safari 11.1+. Mobile: Chrome Android 132+,
     Safari iOS 18.4+, Firefox Android 142+. `File.webkitRelativePath` preserves the
     folder tree across the upload.
   - `showDirectoryPicker()` (File System Access API) — Chromium desktop only.
   - Mobile fallback and the behaviour phone users actually want: the OS photo
     picker, `<input type="file" accept="image/*,video/*" multiple>`, which the
     existing bulk upload path already implements.
   - Result: a library root in hosted mode is an **imported collection**, not a host
     path. Two data models behind one library surface.
3. **Consumers edit on a desktop and their footage lives there.** A multi-gigabyte
   project folder cannot be uploaded to a hosted backend, so the index-in-place
   path (this spec) is the one that unlocks real use — but only for a local
   backend. Both features ship; the local one is implemented first.
4. **Media durability is a separate prod-readiness gate.** `DATA_DIR` resolves to
   `%LOCALAPPDATA%\RelateSocial` or `~/.local/share/RelateSocial` (`server.ts:684`),
   which is ephemeral in a container. Hosted production needs a mounted volume or
   object storage before uploaded media can be relied on. Independent of the picker.

## 12. Deferred

- **Import from the picking device — PROMOTED to a planned second phase
  (decided 2026-11-04), sequenced after this plan lands.** The device's own
  native picker is a real capability and is the *only* way to reach the user's
  media when the backend is hosted, but the browser never exposes an absolute
  path, so it yields file contents that must be uploaded, not paths that can be
  indexed in place. It therefore needs its own design, covering:
  - the two actions side by side in the Add-folder UI — "Add folder from this
    computer" (server-side, in place, no copy) and "Import folder from this
    device" (device picker, uploaded, copied) — because they are different data
    models behind one library surface;
  - the picker choice per device: `showDirectoryPicker()` (Chromium desktop),
    `<input type="file" webkitdirectory>` (all current browsers — Chrome Android
    132+, Safari iOS 18.4+, Firefox Android 142+), and the OS photo picker
    `<input type="file" accept="image/*,video/*">`, which is what phones want;
  - the storage model: today's server-managed media is flat per date folder
    (`MEDIA_DIR/YYYY-MM-DD/<file>`). Preserving an imported folder's tree needs
    a collection concept — `MEDIA_DIR/imports/<name>/<relative path>` — with a
    new listing route and a library-root type that points at a collection
    rather than a host path. Flattening into one date folder is the cheap
    alternative and loses the tree;
  - the upload path already exists (`POST /api/storage/media?date=&name=`), and
    `BulkUpload` already drives single-file uploads.
- Network shares / UNC paths as first-class places (`\\server\share` on Windows,
  `/Volumes` entries that need mounting first).
- Remembering the last browsed folder per user.
- Search / type-ahead inside the browser.
