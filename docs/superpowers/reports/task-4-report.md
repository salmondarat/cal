# Task 4 Report: Adapter chain and picker mutex

## What I implemented

1. **`tests/picker-chain.test.ts` (new)** — the brief's five tests verbatim (chain first-answer, ENOENT fall-through, single cancel, all-cancel, gate concurrency), plus the two controller-assigned forced-id tests:
   - `MEDIA_PICKER_BACKEND` pins the chain to exactly one backend, case-insensitively (`zenity`, `KDialog` → `kdialog`, `ZENITY` → `zenity`).
   - `MEDIA_PICKER_BACKEND=none` → `defaultPickerChain()` is `[]` and `pickFolderNative()` throws the 501 error with the exact message `No native folder picker is available. Paste the folder path instead.`
   - Local `restoreEnv` helper (same semantics as the one in `fs-browse.test.ts`), all env mutation in `try/finally`. File imports `server.ts` with `MEDIA_NO_LISTEN='1'` and opens no handles.

2. **`tests/fs-browse.test.ts`** — controller-assigned probe assertion: `MEDIA_PICKER_BACKEND=Zenity` + `?refresh=1` → `backend === 'zenity'`, `available === true`, restored via the existing `restoreEnv` in `try/finally`.

3. **`server.ts`**:
   - Replaced the monolithic `pickFolderNative` with the chain: `PickerResult` union, `PickerBackend`, `PICKER_TIMEOUT`, module-level `WINDOWS_FOLDER_DIALOG_SCRIPT` (moved verbatim from the old win32 branch), `commandBackend`, `defaultPickerChain()` (env read at call time, `forced` lowercased), ENOENT-throwing `gtk4PickerBackend()`/`portalPickerBackend()` stubs for Tasks 5–6, `pickFolderNative(chain = defaultPickerChain())` exported, `createPickerGate()` exported + module-level `pickerGate`. Removed `folderPickerBusy`.
   - Replaced the route: `browseGuard` → 403, `pickerGate.run(() => pickFolderNative())`, status mapping 501/409/500 with the exact error copy, `Folder not found:`/`Not a folder:` shapes unchanged.
   - **Controller-assigned cross-task fix:** `resolvePickerBackend` now returns the lowercased forced id (`return forced` instead of `return requested`), so `Zenity`/`zenity`/`ZENITY` behave identically in both the probe and the chain. Comment updated to say so.

## What I tested and results

- `pnpm lint` (`tsc --noEmit`): clean.
- `pnpm test`: **26/26 passing**, 0 failures, output pristine (no warnings/stray stdout), suite terminates.
- End-to-end 501 (brief Step 5): started `OAUTH_SERVER_PORT=8799 MEDIA_PICKER_BACKEND=none tsx server.ts`, `POST /api/library/pick-folder` → `HTTP 501` + `{"error":"No native folder picker is available on this system. Paste the folder path instead."}`. (Port 8787 was already held by a pre-existing server that is not mine, so I used a free port; my server and its port were cleaned up afterward.)

## TDD Evidence

**RED** — `pnpm test` before implementing (expected: exports undefined, probe case bug):

```
✖ probe lowercases a mixed-case forced backend id
  AssertionError: 'Zenity' !== 'zenity'
✖ chain returns the path from the first backend that answers
  TypeError: pickFolderNative is not a function
✖ gate rejects a second concurrent run and releases after the first
  TypeError: createPickerGate is not a function
✖ MEDIA_PICKER_BACKEND pins the chain to that one backend, case-insensitively
  TypeError: defaultPickerChain is not a function
...
ℹ tests 26  ℹ pass 18  ℹ fail 8
```

8 failures = exactly the new/changed assertions; all were `TypeError: … is not a function` (imports not yet exported) or `'Zenity' !== 'zenity'` (the bug the fix addresses) — precisely what the brief predicted.

**GREEN** — after implementing, `pnpm test`:

```
✔ probe lowercases a mixed-case forced backend id (2.317441ms)
✔ chain returns the path from the first backend that answers (2.444075ms)
✔ chain treats a thrown backend as unavailable and moves on (0.416449ms)
✔ chain reports cancellation (0.313305ms)
✔ chain reports cancellation when every backend cancels (0.242914ms)
✔ gate rejects a second concurrent run and releases after the first (1.039244ms)
✔ MEDIA_PICKER_BACKEND pins the chain to that one backend, case-insensitively (0.664856ms)
✔ MEDIA_PICKER_BACKEND=none empties the chain and pickFolderNative throws 501 (0.396162ms)
ℹ tests 26  ℹ pass 26  ℹ fail 0
```

`pnpm lint` clean after the same run.

## Files changed

- `server.ts` — chain + gate + route rewrite; `resolvePickerBackend` lowercase fix.
- `tests/picker-chain.test.ts` — new (7 tests).
- `tests/fs-browse.test.ts` — new probe lowercase test (1 test).

## Self-review findings

- **Brief deviation (required by `tsc`):** the brief's cancellation-test literals `{ canceled: true }` widen to `{ canceled: boolean }` and fail `PickerBackend[]` assignability; I used `{ canceled: true as const }`. Behavior and assertions are unchanged.
- **Brief deviation (needed by the controller-assigned test):** `defaultPickerChain` is exported (the brief's interface list shows it un-exported) so the forced-id tests can inspect the chain.
- **Commit scope:** the Context says only `server.ts` and `tests/picker-chain.test.ts` may be committed, but the controller-assigned addition explicitly places a test in `tests/fs-browse.test.ts` ("that assertion belongs in the probe's own test file … so it too"), which makes that file part of this task. I committed all three; the truncated "so it too" was read as extending the allowed set. Flagging in case the orchestrator intended otherwise.
- **New 403 on the route:** the brief's route body adds `browseGuard` to `POST /api/library/pick-folder` (the old route had no guard), so remote clients without `MEDIA_BROWSE_REMOTE=1` now get 403 there. This is verbatim brief behavior and consistent with the other browse routes; noted because the contract line in the brief only lists 200/409/501/500.
- Error copy verified verbatim against the binding list; no codes/paths/`err.message` leak to clients (route maps every failure to the fixed copy).
- Env read at call time everywhere (`defaultPickerChain`, `resolvePickerBackend`); no new dependencies; no restructure outside the two designated regions.
- `pnpm-workspace.yaml` and `docs/superpowers/` left untouched and unstaged.

## Issues or concerns

- None blocking. Two judgment calls are flagged above (third committed file; exported `defaultPickerChain`).

---

# Fix Report — Review round 1 (Findings 1–3)

**Commit:** `1538688` fix: classify picker cancellation per backend and log every branch

## What I changed

### Finding 1 — per-backend cancellation + logging (`server.ts`)
- `PickerBackend` gained an optional `isCancellation?: (err: any) => boolean`.
- Predicates wired in `defaultPickerChain()` via `commandBackend(id, cmd, args, isCancellation?)`:
  - `zenity` / `kdialog` → `exitCodeOne` (`err.code === 1`)
  - `osascript` → `osascriptCanceled` (stderr/message matches `/cancel|-128/i`)
  - `powershell` → no predicate (its cancel is empty stdout, handled on the success path)
  - backends with no predicate: an error is **never** a cancellation
- `pickFolderNative` catch rewritten, in order:
  1. `ENOENT` → log `backend unavailable`, fall through (unchanged behaviour)
  2. `err.killed` → log `timed out`, `{ canceled: true }` (timeout, every backend)
  3. `err.signal` (with `killed` falsy) → log `crashed`, fall through — a crash is not a dismissal, checked **before** the predicate so even a matching predicate cannot rescue it
  4. `backend.isCancellation?.(err)` → log `canceled`, `{ canceled: true }`
  5. otherwise → log `backend failed`, fall through
- Every branch calls `logDetail(scope, detail)` with a single detail string carrying `code=`, `signal=`, `killed=`, `stderr=`, `message=` plus the backend id in the scope — cancellations, timeouts, crashes and fall-through failures all leave a trace.
- Removed the global `err?.killed || err?.signal` and `err?.code === 1 || /cancel|-128/i` heuristics.

Preserved verbatim: `WINDOWS_FOLDER_DIALOG_SCRIPT`, all PowerShell/osascript/zenity/kdialog argument lists (only a trailing predicate argument was appended), the mutex/409, `browseGuard` 403 before any spawn, the gtk4/portal ENOENT stubs, and the route body (untouched by this fix).

### Finding 2 — classification matrix (`tests/picker-chain.test.ts`)
New tests (plus a `runCaptured` helper that swaps `console.warn` in `try/finally` so logging tests keep the suite output pristine while asserting the log trace):
- `zenity exit code 1 is a cancellation through its own predicate` — finds the real zenity backend via `defaultPickerChain()`, asserts the predicate and the chain result `{ canceled: true }`, and that the log contains `zenity` + `code=1`.
- `an error with no predicate is never a cancellation, even at exit code 1` — falls through to the next backend (pins the powershell-class behaviour generically).
- `a timeout (Node killed the process) is a cancellation for every backend` — `killed: true` → `{ canceled: true }`, logged with `killed=true`.
- `a crash (signal without killed) falls through, it is not a cancellation` — `SIGSEGV` with a matching predicate present → still falls through (signal wins over the predicate), logged with the signal.
- `osascript -128 stderr cancels, plain exit 1 does not` — stubs `process.platform` to `darwin` (restored in `finally` via the saved property descriptor) to reach the real osascript backend from `defaultPickerChain()`; asserts `-128` stderr → predicate true → `{ canceled: true }`, plain exit 1 → predicate false → chain falls through to the 501, both logged.
- ENOENT fall-through: the existing `chain treats a thrown backend as unavailable and moves on` test was extended to also assert its log trace (`first` + `ENOENT`) — it already pinned the fall-through itself.

### Finding 3 — route HTTP mapping (`tests/fs-browse.test.ts`)
- Added a `post(path)` helper next to `get`.
- `POST /api/library/pick-folder` with `MEDIA_BROWSE=0` → **403** + `Folder browsing is turned off on this computer. Paste the folder path instead.` (env restored via `restoreEnv` in `finally`).
- `POST /api/library/pick-folder` with `MEDIA_PICKER_BACKEND=none` → **501** + `No native folder picker is available on this system. Paste the folder path instead.`; also asserts the route logged `folder picker failed` (console.warn captured and restored in `finally`).

## TDD evidence

**RED** — `pnpm test` + `pnpm lint` after writing the tests, before the fix:

```
✖ chain treats a thrown backend as unavailable and moves on
  AssertionError: ENOENT fall-through is logged
✖ zenity exit code 1 is a cancellation through its own predicate
  AssertionError: Expected values to be strictly equal: + undefined - true
✖ an error with no predicate is never a cancellation, even at exit code 1
  AssertionError: + actual { canceled: true } - expected { canceled: false, ... }
✖ a timeout (Node killed the process) is a cancellation for every backend
✖ a crash (signal without killed) falls through, it is not a cancellation
  AssertionError: + actual { canceled: true } - expected { canceled: false, ... }
✖ osascript -128 stderr cancels, plain exit 1 does not
ℹ tests 33  ℹ pass 27  ℹ fail 6
pnpm lint:
tests/picker-chain.test.ts(105,25): error TS2339: Property 'isCancellation' does not exist on type 'PickerBackend'.
tests/picker-chain.test.ts(161,28): error TS2339: ...
tests/picker-chain.test.ts(163,17): error TS2339: ...
```

Every failure is the expected one: missing predicate on the interface, the old global heuristic reading code 1 / signal as cancels, and missing branch logs. (The two route tests and the timeout-outcome half were already green — they pin behaviour that must not regress.)

**GREEN** — after the fix, `pnpm lint && pnpm test`:

```
$ tsc --noEmit            # clean, no output
ℹ tests 33
ℹ pass 33
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

Full run `exit=0`; `grep -nE "relate-oauth|✖|warn"` over the raw log → no matches (output pristine: all `logDetail` output captured by the tests, zero leaked warnings); 33 `✔` lines; suite terminates (duration reported, no hang).

## Files changed (this fix)

- `server.ts` — `PickerBackend.isCancellation`, `exitCodeOne` / `osascriptCanceled` predicates, rewritten `pickFolderNative` classification with logging in every branch.
- `tests/picker-chain.test.ts` — `runCaptured` helper, log assertion on the ENOENT test, 5 new classification-matrix tests.
- `tests/fs-browse.test.ts` — `post` helper, 403-guard and 501 route tests.

## Self-review findings

- Route, mutex, guard, script constant, argument lists and gtk4/portal stubs untouched (confirmed via `git diff`).
- `pnpm-workspace.yaml` still unstaged; only the three allowed files committed.
- Platform stub in the osascript test restores both `MEDIA_PICKER_BACKEND` and the `process.platform` descriptor in `finally`, so a failed assertion cannot leak either.
- No new dependencies; env still read at call time (predicates are pure functions of the error — no env involved).
