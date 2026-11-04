# Task 7 report — frontend types and data layer

## Provenance — read this first

**This task was implemented by the CONTROLLER, not by an implementer subagent.** The dispatch
(`ses_e5a06da99ffeCIxRfEvMQFxP1p`) died with `Free usage limit reached` before touching the tree
— verified: the working tree was untouched and `HEAD` was still `bbae42a`. Under the fallback
ruling recorded in the ledger, the controller implemented it inline. This is the second task
implemented this way (Task 6's fix round was the first).

The controller-written status does **not** skip the review gate: the task review below is still
required before Task 7 is closed, and the reviewer is told that this diff is controller-written,
so it is the only independent check on it.

## What changed (commit `65d2285 feat: add client bindings for folder browsing`)

### `src/types/index.ts`

Four interfaces added directly after `LibraryListing`:

- `BrowsePlace { name: string; path: string; kind: 'home' | 'volume' | 'custom' }`
- `FolderEntry { name: string; path: string }`
- `ServerFolderListing { path; name; parent: string | null; isRoot: boolean; limit: number; places: BrowsePlace[]; entries: FolderEntry[]; truncated: boolean }`
- `FolderPickerCapability { platform: string; available: boolean; backend: string | null; detail: string | null }`

### `src/utils/localLibrary.ts`

Two functions added next to `listLibraryFolder`, both going through the file's existing
`request<T>()` helper — which already parses the body and throws `new Error(body.error)` for
non-2xx responses, so the server's exact message reaches the caller and `toUserMessage` can
present it:

- `listServerFolders(path?: string): Promise<ServerFolderListing>` → `GET /api/fs/dirs`, with the
  path omitted when empty so the server picks its first browse root.
- `getFolderPickerCapability(refresh = false): Promise<FolderPickerCapability>` →
  `GET /api/fs/folder-picker`, adding `?refresh=1` when a re-probe is wanted.

### `tests/fs-browse.test.ts`

- **Controller-assigned hygiene item applied:** the two probe tests restored their env only after a
  passing assertion, so a failed assertion would have left `MEDIA_BROWSE` / `MEDIA_PICKER_BACKEND`
  flipped and cascade-failed the tests after them. Both now capture the previous value and restore
  it in a `finally` through the file's existing `restoreEnv` helper, matching every other test in
  the file. The assertions are unchanged.
- **New contract test** — `the browse payloads match the frontend client types`: pins the exact
  key set of `/api/fs/dirs` (`entries, isRoot, limit, name, parent, path, places, truncated`), of
  an entry (`name, path`), of a place (`kind, name, path`), and of `/api/fs/folder-picker`
  (`available, backend, detail, platform`). A renamed field would otherwise surface only as
  `undefined` at runtime, inside the modal, in Task 8.

## Verification

- `pnpm test` → 40 tests, 39 pass, 1 skipped (the opt-in GTK4 dialog test), 0 fail, ~1.1s, output
  pristine; the suite stays headless.
- `pnpm lint` (`tsc --noEmit`) → clean, exit 0.
- `pnpm build` → succeeds (`dist/assets/index-BTaLS2Et.js`, 385.83 kB, built in 706ms).
- Files committed: `src/types/index.ts`, `src/utils/localLibrary.ts`, `tests/fs-browse.test.ts`.
  `pnpm-workspace.yaml` left unstaged.

## On TDD evidence — stated honestly

**There is no meaningful RED for this task.** The client bindings are additive and nothing uses
them until Task 8, so the "failing test first" cycle has no observable failure to point at: the
contract test would have passed before this change too, because the server side was already
correct — its value is regression protection for the client/server contract going forward, not
proof that the change was needed. The types are verified by `tsc --noEmit`, which is the real
check for a TypeScript-only task: a mismatch between the client types and the server's JSON would
surface there and in the contract test.

## Open items carried into this task

- The Task 3 hygiene minor (two probe tests restoring env after a passing assertion) is **closed**
  by this change.
- No new minors.

## Not verified here

- The bindings are not yet exercised by the UI — nothing calls them until Task 8 wires the modal.
  Their runtime behaviour (query-string construction, error propagation) is therefore only covered
  by the server-side contract test, not by an end-to-end client test; the repo has no frontend test
  harness, and adding one is out of scope for this plan.
