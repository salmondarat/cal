# Task 6 report — portal backend

## Status of this report

**The original implementer (session `ses_e5a65e4f3ffejCJUQsl318mC1W`) died mid-task on a
provider usage limit**, before it verified, committed, or wrote a report. The
working tree it left behind was recovered by the controller, verified, and
committed as the implementer's work. This report was written by the controller
from the recovered diff — it is not the implementer's own account, and it does
not claim any manual verification the implementer never performed.

## What the recovered diff implements

`server.ts`:
- `portalPickerBackend()` replaces the Task 4 `ENOENT` stub with a real
  xdg-desktop-portal backend: `gdbus call ... FileChooser.OpenFile` with
  `{'handle_token': <token>, 'directory': <true>, 'multiple': <false>}`, then a
  `gdbus monitor` child whose output is scanned for the
  `org.freedesktop.portal.Request.Response` line anchored to the request handle
  that `OpenFile` returned.
- Two behaviours the implementer discovered by spiking `gdbus` on this machine,
  recorded in comments: `gdbus monitor` filters object paths EXACTLY, but the
  portal answers on the request sub-path, so the monitor runs with only a sender
  filter; and `xdg-desktop-portal` is one bus name serving every app, so its bus
  also carries other apps' portal responses — hence the anchor to the request
  handle rather than a global match.
- A `monitor.on('error')` listener, so a missing `gdbus` does not become an
  uncaught exception that kills the server.
- The monitor is reaped in a `finally` on every exit path.
- Non-`file://` results (GVFS/network schemes) are refused with the message
  `That folder is a network or device location this app cannot read. Choose a
  folder on this computer.` and `statusCode: 400`.
- `file://` URIs are percent-decoded by hand (the URI is captured from gdbus
  output, not parsed with `new URL()`).

Controller-assigned additions, both applied:
- the probe's `execFileSync` catch now logs `err.status ?? err.code`,
  `err.signal` and `err.error.message` instead of the always-empty
  `err.code`/`err.killed`;
- the GTK4 script's `application.quit()` moved into a `finally`, so a
  non-`GLib.Error` exception from `select_folder_finish` cannot leave the held
  application alive until the 5-minute timeout (which the chain would classify
  as a cancel).

`tests/picker-chain.test.ts`: one new test — `portal backend is a runnable
backend` — skipped unless `WAYLAND_DISPLAY` is set.

## Verification performed by the controller (after the implementer died)

- `pnpm lint` → clean (`tsc --noEmit`, exit 0).
- `pnpm test` → 36 tests, 35 pass, 1 skipped (the opt-in GTK4 dialog test),
  0 fail, ~0.98s, output pristine.

## NOT verified

- **No real portal dialog was opened.** The implementer died before the manual
  step; the controller did not open one either, because a portal dialog on this
  machine is a window on the user's in-use desktop, and the one automated
  attempt at dismissing such a dialog closed the user's Zed editor window
  during Task 5. The portal path is therefore verified by construction and by
  unit test only.
- The implementer's own self-review was never performed.
- Whether `gdbus monitor` output is matched reliably in practice is asserted
  from the implementer's spike notes in the code comments, not from a
  controller-run observation.

---

# Fix round 1 — written by the CONTROLLER (not a subagent)

**Provenance — read this first.** Three dispatch attempts for this fix round
(`ses_e5a11741cffeWv3uhczX2KND1T`, `ses_e5a111220ffehpybqEfsmfulFx`,
`ses_e5a0f7b03ffeeZ1Qc0v9t6Z2jP`) all died with `Free usage limit reached`
before touching the tree — verified: the working tree was untouched and `HEAD`
was still `4746fcd`. The controller therefore implemented this fix inline, under
the fallback ruling recorded in the ledger before the pause. **This code was
written by the controller, not by an implementer subagent.** It still goes
through the scoped re-review before Task 6 is closed — the review is not
skipped, and the reviewer is told that the diff is controller-written.

## What changed (commit `822eb48 fix: surface folder picker refusals to the client`)

1. **Chain** (`server.ts`, `pickFolderNative`): an error carrying a `statusCode`
   is now re-thrown instead of being swallowed by the catch-all fall-through.
   The check sits before the cancellation rules, so a refusal can never be
   misread as a dismissal. The chain's own 501 is thrown after the loop and is
   unaffected.
2. **Route** (`POST /api/library/pick-folder`): a status that is neither 501 nor
   409, whose error carries its own `statusCode`, is returned with that status
   and that message. The 501/409 copy and the generic 500 copy are byte-identical
   to before. Only an error that explicitly carries a `statusCode` may pass its
   message through — an arbitrary backend exception still cannot leak.
3. **Portal URI parsing**: the match is now backslash-aware
   (`/'file:\/\/(?:[^'\\]|\\.)*'/`), because `g_file_get_uri` leaves `'` unencoded
   while `g_variant_print` escapes it as `\'`; a plain `[^']+` truncated the URI
   at the raw quote, mangling a folder named e.g. `Mom's photos`. The GVariant
   escaping is now unescaped **before** the percent-decoding — order is
   load-bearing.
4. **Portal timeout**: on deadline expiry the request is closed best-effort
   (`org.freedesktop.portal.Request.Close`), so the portal does not leave its
   dialog on the user's screen after the API already reported a cancel. A
   failure to close is logged and does not change the returned result.
5. **New test helper** `tests/fake-gdbus.ts` — writes a fake `gdbus` executable
   that reproduces the real tool's output shape (including `g_variant_print`'s
   `\'` escaping), so the portal path can be driven headlessly.

## Tests added

- `tests/picker-chain.test.ts`: the chain re-throws a `statusCode`-carrying
  refusal instead of falling through to the next backend.
- `tests/picker-chain.test.ts`: the portal backend's real handshake, parsing and
  decoding, driven by the fake `gdbus` — asserts
  `/tmp/Picked Folder/Mom's Photos` from a percent-encoded URI containing an
  escaped apostrophe.
- `tests/fs-browse.test.ts`: **route level** — `POST /api/library/pick-folder`
  with a `smb://` result returns **400** with exactly
  `That folder is a network or device location this app cannot read. Choose a
  folder on this computer.` This is the test that pins the finding: the copy now
  demonstrably reaches the client, not only the server log.

Note on the fake's first draft: it initially emitted a raw `'` (the backslash
was consumed by the generated script's double-quoted string), and the portal
test caught it — the server correctly truncated at the raw quote. The fake was
corrected to emit `\'`, which is what `g_variant_print` produces.

## Verification

- `pnpm test` → 39 tests, 38 pass, 1 skipped (the opt-in GTK4 dialog test),
  0 fail, ~1.1s, output pristine. The suite stays headless and never opens a
  dialog.
- `pnpm lint` → clean (`tsc --noEmit`, exit 0).
- Files committed: `server.ts`, `tests/picker-chain.test.ts`,
  `tests/fs-browse.test.ts`, `tests/fake-gdbus.ts`. `pnpm-workspace.yaml` left
  unstaged.

## Still unverified

- **No real portal dialog was ever opened**, by the implementer or the
  controller. The portal path is verified headlessly against a fake `gdbus`
  that reproduces the tool's output format, which is stronger than nothing but
  is not the same as the real thing.
- The `Close` call on timeout has not been exercised against a live portal.
