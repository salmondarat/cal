# Task 5 Report: GTK4 backend

**Status:** DONE_WITH_CONCERNS (one accidental side-effect during manual verification — Zed window closed and relaunched; see Issues)
**Commit:** `f3b163e` feat: add GTK4 folder picker backend (files: `server.ts`, `tests/picker-chain.test.ts`)

## What I implemented

1. **`gtk4PickerBackend` (replaces the ENOENT stub in `server.ts`)**
   - `GTK4_SCRIPT`: the brief's inline Python script driving `Gtk.Application` + `Gtk.FileDialog`, printing the chosen absolute path or the `__CANCELED__` sentinel, run via `execFileAsync('python3', ['-c', …], { timeout: PICKER_TIMEOUT })`.
   - **One deviation from the brief (necessary):** added `application.hold()` inside `on_activate`, with an explanatory comment. Without it the script is broken on this machine — see "Deviation: hold()" below. Everything else is verbatim from the brief.
   - No `isCancellation` predicate (Ruling 3).
2. **`export const __pickerBackends = { gtk4: gtk4PickerBackend, portal: portalPickerBackend }`** next to `pickFolderNative` (brief Step 3).
3. **Ruling 1 — probe now runs the spec's real import check:** the `gtk4` branch of `resolvePickerBackend` calls `gtk4Importable(force)`, which runs `python3 -c 'import gi; gi.require_version("Gtk","4.0"); from gi.repository import Gtk; Gtk.FileDialog'` with `timeout: 5000` (via `execFileSync`), only when `python3` is on `PATH`. Result is cached in the module-level `cachedGtk4Import: boolean | null`:
   - cached `false` stays `false` for the process lifetime (no respawn on ordinary probe requests),
   - `?refresh=1` → `probeFolderPicker(force)` → `resolvePickerBackend(force)` → `gtk4Importable(true)` re-checks,
   - a failed check logs via `logDetail('gtk4 import check failed', …)`.
   Chosen sync (`execFileSync`) to keep `resolvePickerBackend`/`probeFolderPicker` signatures unchanged (they are sync today; `hasCommand` already does sync fs access in the same path). Worst case 5 s of blocking happens at most once per process; deliberate tradeoff, noted below.
4. **Tests appended to `tests/picker-chain.test.ts`:**
   - `gtk4 backend reports the sentinel when the dialog is dismissed` — brief's test, gated per Ruling 2: `skip` is `'set MEDIA_TEST_PICKER=1 to run a test that opens a real dialog'` when `MEDIA_TEST_PICKER !== '1'`, else `'no display'` when both `DISPLAY` and `WAYLAND_DISPLAY` are unset, else runs. The default suite never opens a dialog.
   - `gtk4 has no cancellation predicate: a python failure falls through, never cancels` — Ruling 3 verification: asserts `backend.isCancellation === undefined`, and that a `code: 1` python failure logged as `gtk4 … code=1` falls through to the next backend instead of reading as cancel.

## TDD Evidence

**RED** (tests written first, backend still the stub, `__pickerBackends` not yet exported):

```
$ pnpm test
…
﹣ gtk4 backend reports the sentinel when the dialog is dismissed (0.370588ms) # set MEDIA_TEST_PICKER=1 to run a test that opens a real dialog
✖ gtk4 has no cancellation predicate: a python failure falls through, never cancels (1.212827ms)
  TypeError: Cannot read properties of undefined (reading 'gtk4')
      at TestContext.<anonymous> (tests/picker-chain.test.ts:205:67)
ℹ tests 35  ℹ pass 33  ℹ fail 1  ℹ skipped 1
```

**GREEN** (after implementing backend + export):

```
$ pnpm test
…
﹣ gtk4 backend reports the sentinel when the dialog is dismissed (0.12ms) # set MEDIA_TEST_PICKER=1 to run a test that opens a real dialog
✔ gtk4 has no cancellation predicate: a python failure falls through, never cancels
ℹ tests 35  ℹ pass 34  ℹ fail 0  ℹ skipped 1  ℹ duration_ms 1010
$ pnpm lint        # tsc --noEmit
$ echo $?
0
```

Also verified the opt-in path end-to-end (opens a real dialog):

```
$ MEDIA_TEST_PICKER=1 pnpm test
✔ gtk4 backend reports the sentinel when the dialog is dismissed (1295.144844ms)
ℹ tests 35  ℹ pass 35  ℹ fail 0  ℹ skipped 0   (dialog opened; I closed it; assertion {canceled:true} passed)
```

Default suite: 35 tests, 34 pass, 1 skipped (with reason), 0 fail, ~1.0 s, output pristine (no `[relate-oauth]` warn lines). Suite terminates promptly — no open handles, no dialog blocking.

## Files changed

- `server.ts` (+83/−8): `execFileSync` import; `GTK4_IMPORT_CHECK` + `cachedGtk4Import` + `gtk4Importable(force)`; `resolvePickerBackend(force)` gtk4 branch; `probeFolderPicker` passes `force`; `GTK4_SCRIPT` (brief's script + `hold()`) and real `gtk4PickerBackend`; portal stub comment updated to "Task 6"; `__pickerBackends` export.
- `tests/picker-chain.test.ts` (+34): the two tests above.

Not touched: `pnpm-workspace.yaml` (pre-existing, unstaged), everything else.

## Manual verification result (observed, with caveats)

Server: pre-existing `tsx watch server.ts` on :8787 restarted with my final `server.ts` (child started after last edit). `GET /api/fs/folder-picker` → `{"available":true,"backend":"gtk4","detail":null}` (and stable under `?refresh=1`).

**Cancel — OBSERVED `{"canceled":true}`:**
- `curl -s -X POST localhost:8787/api/library/pick-folder` opens a real GTK4/XDG-portal folder chooser titled "Select a media folder" (screenshot saved at `/tmp/opencode/srv_dialog_open.png`; hyprctl client class `xdg-desktop-portal-gtk`).
- **Caveat:** the Escape key does **not** dismiss this portal dialog on this machine (verified: 10 Escape presses with focus confirmed on the dialog — it stayed open), and this Hyprland's Lua `hyprctl dispatch closewindow` syntax initially failed. Final dismissal was done by closing the dialog window (`hyprctl dispatch 'hl.dsp.window.close({ address = "0x…" })'` — validated first on a sacrificial window), which is the portal's "dismissed" path → python printed `__CANCELED__` → response captured: `{"canceled":true}`.

**Pick — OBSERVED `{"canceled":false,"path":"/run/media/data/test-folder-picker"}`:**
- Absolute path, from the same POST endpoint through the fixed backend. **Caveat honestly:** I have no pointer/click tooling, so the folder was chosen by the person at this machine (they had created `test-folder-picker` at 14:24 and clicked **Select** in the dialog my backend opened); my Escape attempt had closed a dropdown instead. The server/backend/HTTP path is mine; the click was theirs. A direct-run of the fixed script also returned `finish path='/run/media/data/test-folder-picker'` through `select_folder_finish`, confirming the script's success path.

**Ruling 3 explicit verification:** `gtk4PickerBackend()` returns `{ id, run }` only — no `isCancellation` (asserted in test). A python failure exits non-zero with `killed` falsy and no `signal`; `pickFolderNative` therefore reaches the no-predicate branch → logs `folder picker backend failed: gtk4 code=1 …` → falls through (test asserts both the fall-through and the log line). It can never be read as a cancel; only empty stdout or `__CANCELED__` (exit 0) cancels.

## Deviation: `application.hold()` (why the brief's exact script was unusable)

The brief's script, verbatim, **does not work on this machine** — deterministic across runs:

```
$ python3 gtk4_script.py   # brief's script verbatim
exit=0 in 0.74s, stdout EMPTY, stderr EMPTY, dialog never stays open
```

Instrumented copy showed: `activate fired → select_folder called → run returned rc=0` — `on_done` **never fires**. Root cause: `Gtk.Application` with no window of its own drops its GApplication use-count to zero as soon as `on_activate` returns, so `app.run()` exits ~0.7 s in, the process dies, and the portal aborts the in-flight request (portal journal shows the request arriving, then the requester vanishing). Consequence: every server response would be `{"canceled":true}` from empty stdout, and no folder could ever be picked — Step 5 of the brief would fail.

Fix (one line, commented in code): `application.hold()` at the top of `on_activate`. Verified: dialog opens and stays, `on_done` fires with a real path, dismissals produce the sentinel.

## Self-review findings

- Completeness: brief Steps 1–4, 6–7 ✓; Ruling 1 (real import check, 5 s timeout, cached, refresh re-checks) ✓; Ruling 2 (opt-in `MEDIA_TEST_PICKER=1` with clear skip reason; test not removed) ✓; Ruling 3 (no predicate + explicit verification) ✓.
- Discipline: only the two allowed files committed; no new npm dependencies; env read at call time (no new frozen env constants); error copy untouched; no restructure outside the picker region.
- Testing: RED→GREEN evidence above; default suite fast/pristine; opt-in test proven working once.
- Cleaned stray debug files (`diag_*.txt`) from the repo root before committing.

## Issues / concerns

1. **Accidental: the user's Zed window was closed during manual verification.** My fallback dismissal `hl.dsp.window.close()` (focused-window form) ran while focus was on the user's Zed (the try1 address-targeted close needed >0.5 s to unmap and had already worked). **Remediation:** relaunched `zeditor /run/media/data/salmonpro/cal`; the window came back on its previous workspace with the same file open (`cal — 2026-11-04-cross-platform-folder-picker.md`, Zed session restore). Disclosing fully so the controller/user can double-check unsaved state.
2. An active person/agent at this machine interacted with the dialogs during testing (created `test-folder-picker`, clicked Select, opened a Location dropdown, closed one dialog). This is why cancel/pick observations include caveats; the code paths themselves are verified.
3. Escape does not dismiss the xdg-desktop-portal-gtk dialog here (environment quirk, not our code; real users click Cancel — a pointer works, as the human demonstrated).
4. `execFileSync` in the probe blocks the event loop up to 5 s in the worst case — deliberate: result is cached for the process lifetime, so it runs at most once (plus explicit `?refresh=1`), and it keeps the probe synchronous like the surrounding `hasCommand` checks.
5. The running dev server (`tsx watch server.ts`, port 8787) was left running with the final code.
