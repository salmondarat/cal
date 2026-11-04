# Task 9 report — wiring the folder browser into the media library

## Provenance

**Implemented by the CONTROLLER**, not an implementer subagent: the dispatch died with
`Free usage limit reached` before touching the tree (verified: tree untouched, `HEAD` still
`88634e9`). Under the fallback ruling recorded in the ledger, the controller implemented it
inline. The task review is still required, and the reviewer is told the diff is controller-written.

## What changed

- `src/components/MediaLibrary/MediaLibraryModal.tsx` (commit `e92953c`):
  - state `isBrowsingFolders` and `pickerCapability`; the capability is fetched once when the
    library modal opens, and a failed probe simply means no system dialog is offered;
  - `isLocalHost` — the native dialog opens on the machine running the app, so the button is
    shown only when the page *is* that machine;
  - the add-folder form now offers three things: the existing path input + submit (unchanged),
    a **"Browse folders..."** button that opens the server-side browser, and the former
    "Browse folder..." button renamed **"Use system dialog"**, rendered only when
    `pickerCapability?.available && isLocalHost`;
  - `handleFolderSelected(path)` registers the chosen path exactly like a pasted one, then closes
    the browser;
  - `<FolderBrowserModal>` mounted next to `<MediaPreviewModal>`.

- `server.ts` + `tests/fs-browse.test.ts` (commit `17a3c82`, a defect found during verification):
  **the Places list offered filesystem junk.** The live response listed `$RECYCLE.BIN`,
  `.Recycle.bin`, `Program Files`, `Recovery`, `PerfLogs`, `adobeTemp` as browsable "volumes".
  Root cause: the volume discovery treated *any directory* under `/media`, `/mnt` and
  `/run/media` (and their children) as a volume, while a volume is really a **mount point** —
  on this machine `/run/media/data` is the mount and `/run/media/data/salmonpro` is a folder
  inside the NTFS disk. Fixes: volumes are now the mount points listed in `/proc/mounts` under
  those roots (with a one-level directory scan as fallback when `/proc/mounts` is unreadable),
  and hidden folders plus mount artifacts (`$RECYCLE.BIN`, `System Volume Information`,
  `lost+found`) are never offered. The live Places list is now `Home, windows, data, Backup`.

  Two tests were added: one asserts no hidden or artifact name is ever offered, one asserts that
  **every offered volume is a real mount point** (read from `/proc/mounts`).

  The first version of the artifact test asserted "Home is always a place" while the harness had
  `MEDIA_BROWSE_ROOTS` set — configured roots *replace* the defaults, so that path never exercised
  the discovery the filter applies to. The test failed, and was corrected to unset the variable
  (restoring it in a `finally`) so it actually exercises the default discovery.

## Verification

- `pnpm test` → 42 tests, 41 pass, 1 skipped (the opt-in GTK4 dialog test), 0 fail, ~1.1s, pristine.
- `pnpm lint` → clean. `pnpm build` → succeeds.
- Live check against the running dev backend (`localhost:8787`): the capability probe reports
  `{"platform":"linux","available":true,"backend":"gtk4","detail":null}`, and the Places list is
  `Home, windows, data, Backup`.
- The Vite dev server (`:3000`) and the backend (`:8787`) are running, so the flow is clickable.

## Not verified — needs a human

- **No browser was driven.** There is no frontend test harness in this repo and no browser
  automation available, so the modal's rendering, keyboard handling, focus restoration and the
  phone-width layout were not exercised end-to-end. The reviewer's judgement carries the weight
  here, and a human click-through is still required.
- The "Use system dialog" button's real dialog was exercised earlier in Task 5 (the GTK4 backend
  opened a real chooser on this machine and returned both a cancel and a chosen path), but not
  through this button.
