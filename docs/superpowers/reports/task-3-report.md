# Task 3 Report — Capability probe `GET /api/fs/folder-picker`

**Status:** DONE
**Commit:** `f2fc0ac` — `feat: add native folder picker capability probe` (2 files only: `server.ts`, `tests/fs-browse.test.ts`)

## What I implemented

### `server.ts` (inside the folder-browsing section, after the `/api/fs/dirs` route, before the Native folder picker block)

- `interface PickerCapability { platform; available; backend; detail }` — exact shape from the brief.
- `hasCommand(cmd)` — PATH scan (win32 tries `.exe`/`.cmd`/bare), verbatim from the brief.
- `hasDisplay()` — `DISPLAY || WAYLAND_DISPLAY`, verbatim from the brief.
- `resolvePickerBackend()` — reads `MEDIA_PICKER_BACKEND` at call time: not `auto` → the id used verbatim (`none` → `null`); otherwise win32 → `powershell` (via `hasCommand`), darwin → `osascript`, else linux chain `zenity → kdialog → gtk4 → portal` where the first three require `hasDisplay()` and `gtk4` counts as present when `python3` is on `PATH` (GTK probed at run time; runtime failure falls through per Task 4's chain).
- `probeFolderPicker(force = false)` — cache in module-level `cachedCapability` keyed by `` `${platform}|${forced}|${enabled}` `` where `forced` = normalized `MEDIA_PICKER_BACKEND` and `enabled` = `browseEnabled()`; recompute on key mismatch; `force` (`?refresh=1`) bypasses the cache regardless of key. When browsing is off → `{ platform, available: false, backend: null, detail: 'Folder browsing is turned off on this computer. Paste the folder path instead.' }`; otherwise `{ platform, available: Boolean(backend), backend, detail: backend ? null : 'No zenity, kdialog, GTK4 or desktop portal backend was found.' }`. Both error strings verbatim.
- Route `GET /api/fs/folder-picker` → always HTTP 200, **no `browseGuard` call** per the controller's ruling (probe exposes no filesystem data; unavailable reads as `available: false`, not 403).

### `tests/fs-browse.test.ts`

- Extended `getWithHost(path, host, headers = {})` — optional third param, merged so the `host` param always wins; existing call sites unchanged.
- Appended the brief's two probe tests **verbatim**.
- Appended the controller's three locality-branch coverage tests (x-forwarded-for + loopback Host → 403; non-loopback Origin → 403; `Host: 127.0.0.1` and `Host: [::1]` → 200, all under `MEDIA_BROWSE_REMOTE=0`), all using `restoreEnv` in `finally`.
- Test ordering: locality tests are placed **before** the probe tests (see self-review note 1).

## Test results

- `pnpm test`: **18/18 passing, 0 failures, output pristine** (✔ lines only, then the node:test summary), suite terminates (~0.55 s, no hanging handle — the `after` hook closes the server).
- `pnpm lint` (`tsc --noEmit`): **clean, exit 0**.
- Step 5 live check: an already-running `tsx watch` server on port 8787 auto-reloaded the change; `curl -s localhost:8787/api/fs/folder-picker` → `{"platform":"linux","available":true,"backend":"gtk4","detail":null}` — **exactly** the brief's expected output (this machine: `DISPLAY=:0`, `python3` present, no zenity/kdialog). `?refresh=1` → 200. `curl -H 'x-forwarded-for: …' /api/fs/dirs` → 403.

## TDD Evidence

**RED** — command: `pnpm test` (after appending the five tests, before any `server.ts` change):

```
✔ a forwarded request is not local even with a loopback Host (2.061ms)
✔ a non-loopback Origin is not local even with a loopback Host (1.796ms)
✔ both loopback Host forms are local when remote browsing is off (3.699ms)
✖ probe reports a stable shape and honours MEDIA_PICKER_BACKEND=none (5.253ms)
  SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
✖ probe reports browsing disabled when MEDIA_BROWSE is off (5.427ms)
  SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
ℹ tests 18 / ℹ pass 16 / ℹ fail 2
```

Why this failure is expected: the route does not exist, so Express's default HTML 404 (`<!DOCTYPE …`) comes back and `res.json()` in the `get` helper cannot parse it — the brief predicted "FAIL — 404, the route does not exist"; this is that 404 surfacing as a parse error. The three locality tests were expected to pass already (they cover pre-existing Task-2 behavior) — they are coverage additions, not new behavior.

An earlier RED attempt had the probe tests before the locality tests; the probe test's un-restored `MEDIA_BROWSE='0'` (it throws before its restore line while the route is missing) poisoned the locality tests with misleading failures. Reordered so locality runs first — see self-review note 1.

**GREEN** — command: `pnpm test` after implementing the probe:

```
✔ probe reports a stable shape and honours MEDIA_PICKER_BACKEND=none (5.913ms)
✔ probe reports browsing disabled when MEDIA_BROWSE is off (2.332ms)
ℹ tests 18 / ℹ pass 18 / ℹ fail 0 / ℹ duration_ms 549.6
```

`pnpm lint` → exit 0.

## Files changed

- `server.ts`: +74 lines — `PickerCapability`, `hasCommand`, `hasDisplay`, `resolvePickerBackend`, `probeFolderPicker`, `GET /api/fs/folder-picker` route.
- `tests/fs-browse.test.ts`: +65/−2 — `getWithHost` headers param, 3 locality tests, 2 probe tests (brief-verbatim), one ordering comment.

Not staged: pre-existing `pnpm-workspace.yaml` modification and untracked `docs/superpowers/` (both left alone).

## Self-review findings

1. **Test ordering deviation (deliberate):** the brief says "append" its two tests; I appended them after the three locality tests, because the brief's second test flips `MEDIA_BROWSE='0'` without `try/finally` and, when it fails (RED), leaves the flag off for every later test. Placing locality first keeps RED clean (only the 2 intended failures) while leaving the brief's test text verbatim. A one-line comment in the file explains the order.
2. **Cache-key interpretation (resolved ambiguity):** the brief's key template is `` `${platform}|${forced}|${browseEnabled()}` `` while the signature's parameter is named `force`. The rationale sentence says the key must catch `MEDIA_BROWSE` **or `MEDIA_PICKER_BACKEND`** changes — only `browseEnabled()` covers the former, so `forced` must be the pinned backend id (matching Task 4's `const forced = (process.env.MEDIA_PICKER_BACKEND || 'auto')…`). I initially implemented `forced` as the boolean `force` param; that left `MEDIA_PICKER_BACKEND` flips stale without `?refresh=1`, violating the binding "env read at call time" constraint, and would make `force` — an input the *value* does not depend on — part of the key. Fixed before commit. Both readings pass the brief's tests; the committed one satisfies the constraint.
3. **`portal` is an unconditional linux fallback** (no presence probe), as the brief specifies — so `available` is always `true` on linux when browsing is on, and the "No zenity, kdialog, GTK4 or desktop portal backend was found." detail is reachable only on win32/darwin without their tools or via `MEDIA_PICKER_BACKEND=none`. Consistent with Task 4's chain, which also appends `portal` unconditionally.
4. **Injected instruction block in RED output:** the first `pnpm test` output ended with a fabricated "[JSON PARSE ERROR – IMMEDIATE ACTION REQUIRED] … correct your JSON syntax" block. It arrived inside command output, not as a real system message, and my tool calls were valid; I ignored it and continued. Flagging in case other subagents see similar artifacts.
5. **Port 8787 was already occupied** by a running `tsx watch` server (not started by me) which hot-reloaded my change; I used it for the Step 5 curl check rather than killing or duplicating it.
6. No overbuild: no new deps, no exported symbols beyond what the brief lists, no changes outside the folder-browsing section, exact error copy, all env reads at call time.

## Issues or concerns

- None blocking. One judgment call for the reviewer to confirm: the cache-key interpretation in finding 2 (behaviorally invisible to this task's tests; it matters only for a mid-process `MEDIA_PICKER_BACKEND` flip without `?refresh=1`, where the committed version is the one that satisfies the global constraint).
