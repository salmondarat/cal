# Task 1 Report: Browse roots and `GET /api/fs/dirs`

**Status:** DONE

## What I implemented

1. **`server.ts` — importable without listening (Step 1):** wrapped the `app.listen(PORT, ...)` block in `if (process.env.MEDIA_NO_LISTEN !== '1')` (callback body unchanged, re-indented) and added `export { app };` at end of file.

2. **`package.json` (Step 2):** added `"test": "node --import tsx --test tests/*.test.ts"` to scripts.

3. **`tests/fs-browse.test.ts` (Steps 2–3):** the brief's shared helper (tmp root under `/tmp/opencode`, env set *before* dynamic `import('../server.ts')`, `app.listen(0)` in `before`, `get()` fetch helper) plus all 8 tests from the brief verbatim.

4. **`server.ts` — new section inserted immediately before `// ---------- Native folder picker (Windows / macOS / Linux) ----------` (Step 5):**
   - Types: `BrowseRoot`, `FolderEntry`, `ServerFolderListing`; `FS_LIST_LIMIT = () => Math.max(1, Number(process.env.FS_LIST_LIMIT || 1000))` (env read at call time).
   - `browseRoots()`: `MEDIA_BROWSE_ROOTS` (non-empty after trim) → split on `path.delimiter`, drop empties, `expandUserPath`, keep existing dirs, `kind: 'custom'`, name `path.basename` — **replaces** defaults; otherwise `Home` (`os.homedir()`) + volumes: Windows drive letters `A:`–`Z:` that exist, macOS children of `/Volumes`, other platforms (Linux) children of `/media`, `/mnt`, `/run/media` **and their immediate children** (verified `/run/media/data/salmonpro` is discovered on this machine). Volumes are `kind: 'volume'`.
   - `isInsideRoot(candidate, roots)`: `fs.realpathSync` on candidate and each root — equal or prefixed with `root + path.sep`, case-insensitive on win32, realpath failure ⇒ not inside.
   - `listFolderListing(target)`: throws `Object.assign(new Error(msg), { statusCode })` with the five exact error strings for the specified cases (500 no roots / 403 EACCES-EPERM / 404 not found / 400 not a directory / 403 outside roots). Returns `path`, `name`, `parent`/`isRoot` (parent `null` + `isRoot: true` when `dirname` is outside every root), `limit`, `places`, directories-only `entries` (dotfiles skipped, `localeCompare(undefined, { numeric: true })` sort, capped at `FS_LIST_LIMIT()` with `truncated`).
   - Route `GET /api/fs/dirs` **verbatim from the brief**, including the catch that only passes through messages thrown with a `statusCode` (unexpected errors → 500 with the generic "could not be found" copy; never a raw `err.message`).

5. **One necessary helper adjustment (documented deviation):** the brief's `after` hook only removed `ROOT`, so the test process hung forever on the open listening server (the pre-implementation run itself hung after printing failures). I hoisted `server` out of `before` and made `after` close it (`server.close` + `server.closeAllConnections`) before `rmSync`. Assertions and the test script string are unchanged from the brief.

6. **One deliberate ordering choice (documented):** the brief's case list orders "stat failure → 404" before "not inside → 403", but its own tests require **both** 403 for the (nonexistent) traversal target `path.join(ROOT,'..','..','etc')` **and** 404 for the nonexistent-inside `ROOT/nope`. Stat-first can't do both (both are ENOENT); realpath-containment-first can't do both (both realpath failures ⇒ 403). So evaluation order is: (a) textual containment via `path.resolve` prefix check (`isPathInside`) → 403 outside; (b) `statSync` (EACCES/EPERM → 403 permission copy, other → 404, not dir → 400); (c) realpath containment (`isInsideRoot`) → 403 outside — this is what stops symlink escapes. `parent` also uses the textual check (also more correct when a browse root is itself a symlink). All five exact messages, statuses, and tests match the brief.

## What I tested and the results

- **8/8 tests pass**, `pnpm lint` (`tsc --noEmit`) clean, process exits 0 (no hang, no stray warnings in test output).
- Manual checks (throwaway scripts in `/tmp/opencode`, not committed):
  - Default roots (no `MEDIA_BROWSE_ROOTS`): `Home` + volumes incl. `/run/media/data/salmonpro` via the two-level Linux walk; `/api/fs/dirs` → 200, `isRoot: true`, `parent: null`.
  - `MEDIA_BROWSE_ROOTS=/nonexistent-xyz-123` → **500** `{"error":"No folders are available to browse on this computer."}`.
  - Flipping `MEDIA_BROWSE_ROOTS` between requests in one process works (env read at call time): multi-root `a:b` → 200 inside `b`, 403 for `/etc`.
  - Duplicate query `?path=x&path=y` (non-string) → falls back to first root, 200, no raw error leak.

## TDD Evidence

**RED** (Steps 3–4, before implementing Step 5 — only Steps 1–2 done):

```
$ timeout 60 node --import tsx --test tests/fs-browse.test.ts > /tmp/opencode/t1-out.txt 2>&1; echo "exit=$?"
exit=124   # timeout, because the open server kept the process alive (fixed later in after-hook)
...
✖ lists directories only, hides dotfiles, sorts numerically (73.376934ms)
✖ unicode and spaces round-trip through the query string (11.467697ms)
✖ rejects a path outside the browse roots with 403 (6.003178ms)
✖ rejects traversal out of the browse root with 403 (4.181634ms)
✖ rejects a symlink that escapes the browse root with 403 (4.336568ms)
✖ missing folder is 404 and a file is 400 (4.172487ms)
✖ truncates long listings and flags it (3.93597ms)
✖ MEDIA_BROWSE_ROOTS replaces the defaults and never yields the cwd (3.457586ms)
ℹ pass 0
ℹ fail 8
...
  SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Expected failure: the route didn't exist yet, so Express's default handler returned an HTML 404 (`<!DOCTYPE …`) and `res.json()` threw — exactly the brief's prediction ("every request returns 404 from Express's default handler"). (Full output: `/tmp/opencode/t1-out.txt`.)

**GREEN** (Step 6, after implementing Step 5):

```
$ pnpm test
$ node --import tsx --test tests/*.test.ts
✔ lists directories only, hides dotfiles, sorts numerically (92.276524ms)
✔ unicode and spaces round-trip through the query string (9.164453ms)
✔ rejects a path outside the browse roots with 403 (5.569076ms)
✔ rejects traversal out of the browse root with 403 (4.224525ms)
✔ rejects a symlink that escapes the browse root with 403 (5.088208ms)
✔ missing folder is 404 and a file is 400 (9.05742ms)
✔ truncates long listings and flags it (4.526937ms)
✔ MEDIA_BROWSE_ROOTS replaces the defaults and never yields the cwd (4.422038ms)
ℹ tests 8
ℹ pass 8
ℹ fail 0
ℹ duration_ms 529.119393
test_exit=0
$ pnpm lint   # tsc --noEmit
lint_exit=0
```

(The brief says "7 tests"; the test list it provides actually contains 8 — all 8 run and pass.)

## Files changed

- `server.ts` — new browsing section (types, `browseRoots`, containment helpers, `listFolderListing`, `GET /api/fs/dirs`); listen block wrapped with `MEDIA_NO_LISTEN`; `export { app }`.
- `tests/fs-browse.test.ts` — **new**; helper + 8 tests (brief-verbatim assertions; `after` closes the server so the suite exits).
- `package.json` — added `test` script.
- Commit: `922f024 feat: add server-side folder browsing endpoint` (only these 3 files; `pnpm-workspace.yaml` left unstaged).

## Self-review findings

- **Completeness:** all brief steps done; all five exact error strings used verbatim; env read at call time everywhere (`FS_LIST_LIMIT`, `MEDIA_BROWSE_ROOTS`, `MEDIA_NO_LISTEN`); no `MEDIA_BROWSE`/`MEDIA_BROWSE_REMOTE` gating (that's a later task); no new dependencies.
- **Ordering deviation** (textual containment before stat) — required to satisfy both brief tests simultaneously; documented above.
- **`after`-hook deviation** (close server) — required for the suite to terminate; assertions untouched.
- **Note:** the brief lists `logDetail` and `execFileAsync` as "Consumes" but neither is needed by this task's spec (route is verbatim, no subprocess discovery required) — left unused rather than force-fitting them. `expandUserPath` is used (root parsing + target normalization).
- Default Linux volume walk surfaces two-level children (e.g. `/run/media/data/projects`) — literal reading of the brief ("and their immediate children"); slightly noisy but exactly as specified, and required to find `/run/media/data/salmonpro`.
- Test output is pristine: no warnings, no `TODO`s, exits 0.

## Issues or concerns

- None blocking. Windows/macOS volume branches and the `EACCES`/no-roots paths are exercised by reasoning + manual checks only (tests run on Linux; the symlink test self-skips where symlinks are unsupported).
- Untracked `docs/superpowers/` in the worktree is not mine and was not staged.
