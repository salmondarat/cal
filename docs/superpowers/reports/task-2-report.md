# Task 2 Report: Remote gate and feature kill switch

**Status:** DONE
**Commit:** `bf8b784` feat: gate folder browsing by scope and client locality (2 files changed, 69 insertions, 1 deletion)

## What I implemented

In `server.ts`, inside the existing server-side folder-browsing section (just above the
`app.get('/api/fs/dirs', ...)` route):

- `browseEnabled(): boolean` — `process.env.MEDIA_BROWSE !== '0'` (read at call time).
- `browseRemoteAllowed(): boolean` — `process.env.MEDIA_BROWSE_REMOTE === '1'` (only `"1"` enables remote browsing; read at call time).
- `isLocalRequest(req)` — strips the port and brackets from `Host`, accepts only
  `localhost` / `127.0.0.1` / `::1`, rejects requests carrying proxy IP headers
  (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`), and rejects non-loopback
  `Origin` headers (invalid URL → not local).
- `browseGuard(req)` — returns the kill-switch message first, then the remote-gate
  message; `null` means allowed. Error strings are verbatim from the brief; no codes,
  paths, or raw `err.message` are exposed.
- The first statement of the `/api/fs/dirs` handler is now:
  `const blocked = browseGuard(req); if (blocked) return res.status(403).json({ error: blocked });`

In `tests/fs-browse.test.ts`:

- Added `import http from 'node:http';` and the `getWithHost(path, host)` helper
  (node:http, because `fetch` drops custom `Host` headers) — verbatim from the brief.
- Appended 3 tests: `MEDIA_BROWSE=0` → 403 kill-switch message; remote `Host:
  example.com` with `MEDIA_BROWSE_REMOTE=0` → 403 remote-gate message; loopback
  `Host: localhost` with `MEDIA_BROWSE_REMOTE=0` → 200. Each test restores the env
  flag it flips.
- **Carry-forward fix:** replaced `require('node:os').tmpdir()` (ReferenceError in ESM)
  with a proper `import os from 'node:os';` at the top and `os.tmpdir()` in the
  `/tmp/opencode` fallback.

Not touched: `browseRoots`, `listFolderListing`, route copy, Task 1's existing tests,
`pnpm-workspace.yaml` (pre-existing change left unstaged and uncommitted).

## What I tested and the results

- `pnpm test` → **11/11 passing**, 0 fail/skip/cancel, suite terminates cleanly
  (~540 ms), output pristine (no warnings or stray output).
- `pnpm lint` (`tsc --noEmit`) → **exit 0, clean**.

## TDD Evidence

**RED** — ran `pnpm test` after writing the tests and before implementing:

```
✖ refuses to browse when MEDIA_BROWSE is off
  AssertionError: 200 !== 403   (actual 200, expected 403)
✖ refuses a remote host when MEDIA_BROWSE_REMOTE is off
  AssertionError: 200 !== 403   (actual 200, expected 403)
[ELIFECYCLE] Test failed.
```

Expected failure: the gates did not exist yet, so both requests (kill-switch off and
remote Host) returned 200. The third new test (loopback allowed) passed even in RED
because the ungated route already returns 200 to any host — that test is a regression
guard for the gate, not a gate probe.

**GREEN** — ran `pnpm test` after implementing:

```
✔ refuses to browse when MEDIA_BROWSE is off (4.37ms)
✔ refuses a remote host when MEDIA_BROWSE_REMOTE is off (14.03ms)
✔ allows a loopback host even when remote browsing is off (4.20ms)
ℹ tests 11
ℹ pass 11
ℹ fail 0
```

Full suite before commit: 11/11 pass, lint clean.

## Files changed

- `server.ts`: added `browseEnabled`, `browseRemoteAllowed`, `isLocalRequest`,
  `browseGuard` helpers; guard as first statement of the `/api/fs/dirs` handler.
- `tests/fs-browse.test.ts`: added `http` + `os` imports, `getWithHost` helper, 3 gate
  tests; fixed ESM `require('node:os')` carry-forward.

## Self-review findings

- Brief implemented in step order; helper code and error strings verbatim; env read at
  call time (no module constants); no new dependencies; only the two allowed files
  committed; pre-existing `pnpm-workspace.yaml` change left untouched.
- Guard is literally the first statement of the route handler, before `try`, so a
  guard rejection can't be re-wrapped by the catch.
- Test suite terminates (the `after` server-close helper was preserved).
- Shadowing note: `getWithHost`'s `path` parameter shadows the `node:path` import —
  that is the brief's verbatim code and passes `tsc`; left as-is.

## Issues / concerns

- The brief's behaviour line mentions `/api/fs/folder-picker` should also refuse when
  `MEDIA_BROWSE=0`, but that route does not exist yet (added by a later task) and
  Step 3 only requires guarding `/api/fs/dirs`. I implemented `browseGuard` as a
  reusable function so the later task can apply it to the picker route; nothing to
  guard exists today.

---

# Fix Report (Review round 1): MEDIA_BROWSE kill switch failed open

**Status:** DONE
**Commit:** `cee2806` fix: stop MEDIA_BROWSE kill switch failing open on off spellings
(2 files changed, 63 insertions, 12 deletions)

## Open finding

`browseEnabled()` was `process.env.MEDIA_BROWSE !== '0'` — only the literal string
`"0"` disabled browsing, so `off`, `false`, `no` (and any other spelling) left the
unauthenticated, all-interfaces `/api/fs/dirs` endpoint enabled: a kill switch that
fails open.

## What I changed

- **`server.ts`** — replaced only `browseEnabled()` with the controller-mandated
  implementation: trim + lowercase the value, empty (unset) → on, off only for
  `0` / `off` / `false` / `no`. Still reads `process.env` at call time. Nothing else
  in `server.ts` changed; `browseRemoteAllowed()` stays `=== '1'` (opt-in,
  fail-closed), per the ruling's deliberate asymmetry.
- **`tests/fs-browse.test.ts`** —
  - New test `MEDIA_BROWSE off spellings (trimmed, case-insensitive) refuse browsing`:
    loops `['off', 'false', 'no', ' OFF ']`, asserting 403 and the exact body
    `Folder browsing is turned off on this computer. Paste the folder path instead.`
    for each (per-assertion message names the value that failed).
  - New test `MEDIA_BROWSE unset or any other value leaves browsing on`: deletes
    `MEDIA_BROWSE`, expects 200 (default-on is the easy-to-break part), then sets
    `'2'`, expects 200 — pinning the ruling's "anything else, including unset, leaves
    browsing on".
  - Test hygiene (controller-assigned): added a `restoreEnv(key, previous)` helper
    that re-assigns or deletes appropriately, and wrapped the env-mutating body of
    all three existing gate tests (`MEDIA_BROWSE=0`, remote-host off, loopback
    allowed) plus both new tests in `try/finally`, so a failing assertion can never
    leave `MEDIA_BROWSE` / `MEDIA_BROWSE_REMOTE` flipped for the next test.

## Coverage / tests run

- Focused RED run (`pnpm test`) with the new tests but the old `browseEnabled`.
- Full suite after the fix: `pnpm test` — 13/13 pass, 0 fail/skip/cancel, output
  pristine (no warnings), suite terminates (~536 ms, no hanging handle).
- `pnpm lint` (`tsc --noEmit`) — exit 0, clean.

## TDD evidence

**RED** — `pnpm test` after adding the tests, before touching `server.ts`:

```
✖ MEDIA_BROWSE off spellings (trimmed, case-insensitive) refuse browsing (7.21ms)
  AssertionError [ERR_ASSERTION]: MEDIA_BROWSE="off"
  200 !== 403
  ℹ tests 13  ℹ pass 12  ℹ fail 1
[ELIFECYCLE] Test failed.
```

Expected: with `!== '0'`, `MEDIA_BROWSE='off'` left the endpoint enabled → 200 instead
of the required 403. The unset/default-on test passed in RED (it pins behaviour that
already held) — the failure isolates exactly the reported defect.

**GREEN** — `pnpm test` after applying the mandated `browseEnabled()`:

```
✔ refuses to browse when MEDIA_BROWSE is off (4.32ms)
✔ refuses a remote host when MEDIA_BROWSE_REMOTE is off (14.83ms)
✔ allows a loopback host even when remote browsing is off (4.53ms)
✔ MEDIA_BROWSE off spellings (trimmed, case-insensitive) refuse browsing (11.62ms)
✔ MEDIA_BROWSE unset or any other value leaves browsing on (6.87ms)
ℹ tests 13  ℹ pass 13  ℹ fail 0  ℹ duration_ms 536.26
```

`pnpm lint` → clean (exit 0).

## Files changed (this fix)

- `server.ts`: `browseEnabled()` only.
- `tests/fs-browse.test.ts`: `restoreEnv` helper, try/finally in 3 existing gate
  tests, 2 new semantics tests.

## Self-review findings

- Diff is exactly the controller's mandated code; no re-litigation of the ruling;
  `MEDIA_BROWSE_REMOTE` untouched; env still read per request; exact error copy
  asserted; no new dependencies; commit contains only the two allowed files
  (`pnpm-workspace.yaml` left unstaged).
- Note: the original review also flagged `MEDIA_BROWSE=2` as failing open; the
  controller ruling explicitly keeps `2` → on, and that is now pinned by test so a
  future "fix" can't silently invert it.

## Issues / concerns

- None.
