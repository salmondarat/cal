# Task 8 report — `FolderBrowserModal`

## Provenance

**Implemented by the CONTROLLER**, not an implementer subagent. The dispatch died with
`Free usage limit reached` before touching the tree (verified: tree untouched, `HEAD` still
`65d2285`). Under the fallback ruling recorded in the ledger, the controller implemented it
inline. The task review was still required, and the reviewer was told the diff was
controller-written. This report was written after the fact, by the controller, from the committed
diff — it is not an implementer's own account.

## What changed (commit `88634e9 feat: add folder browser modal`)

New file `src/components/MediaLibrary/FolderBrowserModal.tsx`.

- **Shell** copied from the repo's modal convention (`MediaPreviewModal.tsx:196-206`): outer
  `fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex flex-col`, `role="dialog"`,
  `aria-modal="true"`, `aria-label="Browse folders"`, backdrop click closes, inner panel stops
  propagation. A centred panel (max-w-2xl, max-h-85vh) holds the content.
- **Data flow** through `listServerFolders` (Task 7): `open(path)` loads a folder; a failure of
  the *hinted* path silently falls back to the server's first browse root — a stale or
  out-of-scope hint never produces an error banner. A request id guards against a slow response
  overwriting a newer navigation.
- **Layout**: a Places rail (home + volumes), a breadcrumb row with a parent button, one row per
  subfolder (click to highlight, double-click to open), a footer with "Use this folder" and
  "Cancel". Empty state, truncation notice ("Showing the first {limit} folders."), and an error
  banner with Retry that shows the server's own message verbatim.
- **Keyboard**: Escape closes; ↑/↓ move the highlight (clamped); Enter opens the highlighted
  row; Backspace and ← go up (with `preventDefault`, so the page does not navigate); Tab is
  trapped inside the dialog. Focus moves into the dialog on open and is restored to the opener
  on close.

Two defects were found by review and fixed in `0e1f02f`:
- the modal was mounted conditionally by `MediaLibraryModal`, so it unmounted on close and the
  focus-restore effect could never run — focus was dropped to `<body>` on every close. It is now
  rendered unconditionally with `isOpen` as a prop;
- `Enter` was not `preventDefault`ed, so a focused button was *also* activated by the browser's
  default key handling.

And one by the final whole-branch review, fixed in `2b3f11a`: the chrome-button `Enter`
exemption fired for **all** keys, so Tab never reached the focus trap, and the modal never moved
focus on open — the loading and error states were unreachable by keyboard. Tab is now handled
first, the exemption is scoped to Enter alone, and focus moves into the dialog when it opens.

## Verification

- `pnpm lint` → clean. `pnpm build` → succeeds.
- `pnpm test` → the modal has no unit test: the repo has no frontend test harness and adding
  one is out of scope for this plan. Its rendering, keyboard handling and focus restoration are
  verified by code review only, and the final whole-branch review's verdict on this file was
  "Approved with fixes" with the focus-trap items since addressed. **A human click-through is
  still required** — the dev servers run on `:3000` and `:8787`.

## Files changed

- Create: `src/components/MediaLibrary/FolderBrowserModal.tsx`
- (Later commits touched the same file: `0e1f02f`, `2b3f11a`.)
