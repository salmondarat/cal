# Relate Social — Design System

Status: implemented
Scope: application shell, calendar views, event cards, dialogs
Source of truth: `preview/redesign-v2.html`, translated into React in `src/`

---

## 1. Decision

The app uses the **redesign v2** direction: a full-bleed workspace rail, a
status-first toolbar, and a calendar where every event is tinted by its
primary channel. The editorial v1 direction (serif display type, warm paper,
single red accent) was not adopted: it hides channel identity behind 6px dots
and clashes with the authentic platform chrome rendered by the device
simulator.

### The frame is intentionally not implemented

`redesign-v2.html` renders the app as an inset, rounded "window" on a grey
canvas (`padding: 18px`, `max-width: 1440px`, `border-radius: 24px`, floating
shadow). That is a presentation device for a design preview, not application
chrome. In the real app it costs ~36px of width and height, makes a desktop
tool read as a demo, and competes with the depth of real overlays
(composer, media library, device preview).

The app is **full-bleed**: rail on the left, main column on the right, each
edge-to-edge. Depth is reserved for things that actually float: popovers,
dialogs, toasts.

---

## 2. Principles

1. **One question per row.** A week cell answers *what, when, where* —
   time, title, channels — without opening anything.
2. **Channel identity is ambient, status identity is explicit.** Background
   tint and the left border come from the primary channel; state lives in a
   small badge, never in the card colour.
3. **Density with a floor.** This is an operations calendar, so rows are
   compact, but body copy never drops below 11.5px and badges never below
   9.5px (see §5).
4. **The filter is a facet, not a mode.** Tabs, outlets, format and search
   compose; counts stay scoped so toggling one facet never zeroes itself.
5. **Calm chrome, loud data.** White surfaces, hairline borders, no gradients
   in the shell. Colour is spent on channel tints and attention states.
6. **Every overlay fits one screen.** Dialogs are capped and scroll
   internally; no action may be pushed outside the viewport.

---

## 3. Colour

All values live as CSS variables in `src/index.css`. Channel colours are not
tokens — they are mapping data in `src/constants/platforms.ts`.

### Surfaces and ink

| Token | Value | Use |
| --- | --- | --- |
| `--surface` | `#ffffff` | main column, dialogs, cards |
| `--surface-2` | `#fafbfd` | rail, sidebars inside dialogs |
| `--surface-3` | `#f4f6f9` | hover rows, segmented control track |
| `--bg` | `#eef0f4` | scrim base, disabled wells |
| `--ink` | `#0f172a` | headings, primary buttons, event titles |
| `--ink-2` | `#334155` | body copy, secondary buttons |
| `--ink-3` | `#5b6a80` | labels, metadata, captions |
| `--ink-4` | `#94a3b8` | icon-only buttons at rest |
| `--line` | `#e8ecf2` | row and column borders |
| `--line-2` | `#dde3ec` | control borders, dialog outline |

### Accent and semantics

| Token | Value | Use |
| --- | --- | --- |
| `--violet` | `#6d28d9` | selection, focus ring, links, active tab text/icons |
| `--violet-strong` | `#5b21b6` | pressed/hover text on violet-weak |
| `--violet-weak` | `#f5f3ff` | selected row background, today column |
| `--violet-line` | `#ddd6fe` | selected control border, focus glow |
| `--ok` | `#047857` | published |
| `--warn` | `#b45309` | publishing, partial |
| `--danger` | `#b91c1c` | failed, needs attention |
| `--focus` | `#7c3aed` | `:focus-visible` outline |

### Channel palette

Channel colour is used only as a tint, a dot, or a 2px event edge. Never as a
button fill or a text colour for long copy.

| Channel | Edge / dot | Card tint | Text accent |
| --- | --- | --- | --- |
| Instagram | `#E1306C` | `rgba(225,48,108,.08)` | `#C13584` |
| Facebook | `#1877F2` | `rgba(24,119,242,.08)` | `#1877F2` |
| Threads | `#000000` | `rgba(0,0,0,.06)` | `#111111` |
| TikTok | `#FE2C55` | `rgba(254,44,85,.08)` | `#FE2C55` |
| YouTube | `#FF0000` | `rgba(255,0,0,.08)` | `#CC0000` |

**Rule:** an event with several channels is tinted by `platforms[0]`; the
stacked dots and channel names in the card footer show the full set.

### Attention

Failed and partial posts are the only red surfaces in the calendar. They use
`#fef2f2` / `#b91c1c` / `#fecaca` for badges, error strips and the count
inside “Needs attention”. Do not use red for destructive hover fills beyond
the delete affordance.

---

## 4. Typography

Font: **Inter** (400/500/600/700), loaded in `index.html`. System sans is the
fallback. No serif, no mono except tabular time/number readouts where weight
carries more than the face (times use `font-variant-numeric: tabular-nums`).

| Role | Size / weight / tracking |
| --- | --- |
| Page title (date range) | 24px / 700 / `-0.02em` (21px below 640px) |
| Section title | 15px / 700 / `-0.01em` |
| Dialog title | 14px / 600 (compact dialogs) |
| Body | 11.5–12px / 400–500 |
| Metadata, captions | 10.5–11.5px / 400–500 |
| Event title | 11.5px / 600, 10.5px in dense week cells, 2-line clamp |
| Event time / counts | 9.5–11px / 600–700, tabular |
| Status badge | 8–9px / 700, uppercase, `0.04em` |
| Micro label (rail sections) | 10px / 700, uppercase, `0.1em` |

**Floor:** nothing informational below 9.5px. 8px is allowed only for the
status badge and the “draft” marker inside a month chip. The v2 preview’s
9.5px event titles were raised because the app is used at high zoom.

Line height: 1.25 for event titles, 1.45 for body, 1.02–1.2 for headings.

---

## 5. Space, shape, depth

- Base unit: 4px. Common steps: 6, 8, 10, 12, 16, 20, 24, 28.
- Shell padding: `28px` horizontal on desktop (`px-7`), `16px` below 640px.
- Rail width: `256px`. Rail padding: `16px`; nav row height: 34px.
- Calendar columns: week gutter `76px`; hour height `76px`;
  month row minimum `112px`; day row minimum `56px`.
- Radii: chip 7px, control 10px, card 12px, dialog 16px, pills 999px.
- Borders: 1px hairline everywhere. Grid lines are `#f1f4f8`; structural
  borders are `--line`.
- Elevation: none in the shell. Cards lift 1px and gain
  `0 3px 10px rgba(15,23,42,.10)` on hover. Popovers use
  `0 16px 40px -12px rgba(15,23,42,.22)`. Dialogs use
  `0 24px 64px -16px rgba(15,23,42,.34)`.
- Scrim: `rgba(15,23,42,.34)` with a 2px backdrop blur.

---

## 6. Layout

```
┌────────────┬──────────────────────────────────────────────┐
│ rail 256px │ head: date range · summary · New post        │
│            ├──────────────────────────────────────────────┤
│ workspace  │ toolbar: status tabs · search · filter       │
│ nav        ├──────────────────────────────────────────────┤
│ outlets    │ datebar: stepper · Today · Month|Week|Day    │
│ API        ├──────────────────────────────────────────────┤
│ week card  │ calendar (scrolls internally)                │
└────────────┴──────────────────────────────────────────────┘
```

Three chrome rows, no breadcrumb bar. The date range is the `h1`; the view
name is supporting text. The summary pill (`N in view`) is redundant on
purpose: it survives when the title is long on narrow desktops.

### Responsive

| Breakpoint | Behaviour |
| --- | --- |
| ≥1280px | full rail, search 190px, summary pill visible |
| 1024–1279px | rail stays; summary pill hidden below 640 only |
| <1024px | rail becomes a fixed drawer (264px) with scrim; mobile bar appears (Menu · brand · New post) |
| <640px | header actions hidden (mobile bar owns New post); toolbar splits into tabs row + search/filter row; month becomes a day list; timezone hint hidden |
| any | week/day grids scroll horizontally when below their min width (900px / 860px) |

The drawer closes on scrim click and `Escape`; `aria-expanded` and
`aria-controls` are set on the trigger.

---

## 7. Components

### 7.1 Rail

- **Workspace card:** 34px dark `R` mark, product name, service status line
  with a 6px dot (green online, red offline, grey connecting). This is the
  only place the app name appears.
- **Navigation:** Social calendar is the only "page" and carries
  `aria-current="page"` (white card, violet icon). Manage posts, Media
  library, Device preview and Bulk campaign are actions that open dialogs;
  they never carry the active style.
- **Attention badge:** Manage posts shows the failed + partial count in
  `#fef2f2`; “N sending” replaces it only when there is nothing failing.
- **Outlets:** the five channels, in brand order, with a count. They are
  multi-select filters (`aria-pressed`); selected rows use violet-weak with a
  violet count. The same state is shared with the toolbar filter popover.
- **API connections:** separated by a hairline, always last, never a filter.
- **Week card:** Scheduled / Drafts / Needs attention for the current Monday
  week, then local media usage against 1 GB. The bar is violet; at 0 bytes it
  renders no fill.

### 7.2 Header

`h1` is the range: “October 2026”, “26 Oct – 1 Nov 2026”, “Wed, Oct 28, 2026”.
Meta below: `Social calendar · N posts · M channels · X needs attention` with
3px separators. Right: `N in view` pill (hidden <640px) and the dark New post
button (`#0f172a`, 10px radius, 36px tall).

The offline service warning is a slim amber strip under the header, not a
floating banner.

### 7.3 Toolbar and filters

- **Status tabs:** All posts / Scheduled / Drafts / Needs attention. Active =
  `#f4f6f9` background, hairline border, `600` weight. Counts are 10px
  tabular; the attention count turns red only when > 0.
- **Facet rules:** tab counts respect channel + format + search; outlet counts
  respect tab + format + search. Toggling a facet never clears its own count.
- **Scheduled** includes `publishing`; **attention** is `failed` + `partial`.
- **Search:** 32px, `#fafbfd` background, violet focus border plus
  `0 0 0 3px rgba(124,58,237,.12)`; a clear button appears only with text.
- **Filter popover:** 248px, channels as multi-select checkboxes with counts,
  format as a radio list, `Clear` / `Done` in the footer, close on outside
  click and `Escape`. A 6px violet pip marks an active filter.
- **Empty filter result:** centered “No posts match” card over the calendar
  with a single **Clear filters** action; it resets tab, outlets, format and
  search.

### 7.4 Date bar

Hairline row on `#fdfdfe`: previous/next chevrons, Today, then the local
timezone (hidden <768px). On the right, a three-way segmented control
Month | Week | Day: white active pill with a soft shadow, ink label, 600/700
weight.

### 7.5 Week grid

- Hours 08:00–21:00, 76px per hour, 76px gutter.
- Sticky day header: weekday (10px uppercase) + date; today is violet-weak
  with a violet date pill and a violet top border on the column.
- Weekend columns are `#fcfcfd`; today wins over weekend.
- Events are absolutely positioned at `(minutes − 480) / 60 × 76`, 66px tall,
  assigned to lanes when they overlap; each lane is `100 / lanes` wide with
  a 3px inset. Fixed 60-minute blocks are a display convention (posts carry a
  time, not a duration).
- Primary-channel 2px left edge + tinted card. Dense variant: no caption,
  no error strip, 2-line title, time + badge + channels only.
- Now line: 1px `#ef4444` with a 7px dot, and a red time chip in the gutter.
- **Drag to reschedule:** dragging within a column snaps to 30 minutes; a
  violet hairline + pill shows the target time; media files dropped from the
  OS create a post at that time. Dropping on a column does not require
  hitting a specific hour row.
- Each day header reveals a `+` on hover/focus for quick add.

### 7.6 Month grid

- Monday-first, 7 columns, rows stretch to fill the viewport
  (`minmax(112px,1fr)`), with a sticky weekday header.
- Day number top-right; today is a violet pill. Days outside the month are
  muted (`#fcfcfd` background, `#94a3b8` number).
- Up to three compact chips per day; overflow shows `+N more`.
- Compact chip: 9.5px, time + truncated title, channel tint, red `!` for
  attention, lowercase “draft” marker for drafts.
- Hover/focus reveals `+`; on mobile the grid becomes a single-column day
  list, hides empty out-of-month days, and moves `+` to the row's right edge.

### 7.7 Day timeline

Centered `max-width: 860px` column. Header row: long date, Today pill,
count/status sentence, dark **Add post** button. Rows start at 08:00 with a
68px gutter and 56px minimum content height; empty hours read “Open” and
reveal `+`. Events use the non-dense card (caption + error strip). Drop
target = the whole hour row, with a violet outline and a floating time pill.

### 7.8 Event card

Anatomy (top to bottom): time + status badge; title (2 lines); caption
(optional); error strip (attention only); footer with stacked channel dots,
channel names, format icon and asset count.

- Background/border: primary-channel tint and `badgeBorder`.
- Left edge: 2px primary-channel colour (applied by the grid wrapper).
- Hover: −1px lift + soft shadow. No layout shift.
- Actions (`Preview`, `Details`, `Send/Retry`, copy trail, edit, delete) live
  in a bottom overlay that is invisible at rest, revealed on hover **and**
  on `:focus-within`, so keyboard users can reach them. The overlay is never
  `display:none`, which keeps the buttons tabbable.
- Whole card opens the post detail; the card is not a `<button>` because it
  contains buttons.

Status matrix:

| Status | Badge | Visual |
| --- | --- | --- |
| draft | grey outline, white fill | card tint unchanged, dashed feel via badge and “draft” mark in month |
| scheduled | violet-weak / `#5b21b6` | normal |
| publishing | amber, spinner | normal |
| published | emerald | normal |
| partial | amber | error strip, attention count |
| failed | red | error strip + red `!` in month, attention count |

### 7.9 Dialogs

All modals share the shell: scrim `rgba(15,23,42,.34)`, 16px radius, hairline
`#dde3ec`, white header with a hairline divider, icon tile in violet-weak,
14px title, 11px subtitle, icon-only close at the top right, grey footer.

- Composer: 896px wide, channel selector, media drop zone, shared caption and
  hashtags, per-channel overrides, footer with Cancel / Save draft /
  Publish now / Schedule. Footer stays visible while the body scrolls.
- Media library: 1152px, storage meter, tabs (Stored / Local folders), grid
  of assets, footer Close.
- Manage posts / Post detail: delivery state, per-channel results, error
  detail and the activity log. Retry, remove-from-platforms and edit are
  inline actions.
- Device preview: split panel; left = specs + platform list + publish action
  (sticky to the bottom of the scrolling panel), right = authentic simulator.
  The publish action must never be clipped by the panel edge.
- Bulk campaign and API connections follow the same header/body/footer
  rhythm.

The application still uses styled `div` overlays rather than native
`<dialog>`; focus trapping is therefore a known gap (§10).

### 7.10 Toast and warnings

Toast: bottom-center, ink background, 10px radius, 11.5px text, green check
or lavender info icon, auto-dismiss 4s. Offline service warning: amber strip
directly below the header. Both are informational; never use a toast as the
only place an error is recorded.

---

## 8. Interaction rules

- **Selection vocabulary:** violet = “selected / current”; channel colour =
  “belongs to channel”; red = “needs attention”; dark ink = primary action.
- **Drag:** cards are draggable; the drag payload is
  `application/x-relate-post` plus `text/plain`. Drop targets are month cells,
  week columns (snapped to 30 min) and day hours. External files can be
  dropped on the same targets.
- **Keyboard:** all filter tabs, outlets, segmented views, quick-add and card
  actions are focusable; `:focus-visible` uses a 2px violet outline. The
  drawer closes on `Escape`; the filter popover closes on `Escape` and
  restores focus to its trigger.
- **Counts:** always tabular numbers. Singular/plural copy is handled in the
  header (`1 post`, `2 posts`).

---

## 9. Motion

- Durations: 120–160ms for colour/hover, 200ms for the drawer, 180ms for the
  toast.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Motion is limited to hover lift, drawer slide, popover/toast entrance and
  the now line. No looping animation except the publishing spinner.
- `prefers-reduced-motion: reduce` collapses all durations to 0.01ms.

---

## 10. Accessibility

Implemented:

- Semantic landmarks: `aside` rail, `header`, `section[aria-label]` toolbar
  and date bar, `main`.
- Toggle state exposed with `aria-pressed` on tabs/outlets/segments; drawer
  trigger uses `aria-expanded` + `aria-controls`.
- Search has a label, clear button has a name, icon-only buttons have
  `title`/`aria-label`.
- Focus-visible outline on every interactive element; card actions reachable
  by keyboard through `:focus-within`.
- Text contrast: ink-3 `#5b6a80` on white ≈ 5.9:1; ink-2 ≈ 9:1; violet
  `#6d28d9` on white ≈ 6.5:1. Channel text accents are decorative and paired
  with neutral labels.
- Colour is never the only signal: attention also has a `!`, a badge and a
  text strip.
- Motion respects reduced-motion.

Known gaps:

- Custom modal overlays do not trap focus or restore it to the opener; a
  future pass should either use `<dialog>`/`showModal()` or add a trap.
- Cards open details on click but have no keyboard activation of their own;
  keyboard users reach the same outcome through the focus-revealed actions.
- Week/day horizontal scrolling on small screens is acceptable but an agenda
  list would be friendlier (see §11).

---

## 11. Known gaps / next steps

1. Add an agenda view for `<640px` so Week does not require horizontal pan.
2. Introduce post duration (or “block length”) if the week grid should show
   real end times instead of the fixed 60-minute convention.
3. Add a focus trap + restore to dialog overlays.
4. Self-host Inter for offline installs; currently Google Fonts.
5. Consider persisting the selected view (month/week/day) per workspace.
6. Post manager and API settings keep their compact internal layout; if they
   grow, adopt the same left-label field rhythm used by the composer.

---

## 12. Implementation map

| Concern | File |
| --- | --- |
| Tokens, base typography, scrollbars, reduced motion | `src/index.css` |
| App shell, head, mobile bar, toast, empty-filter state | `src/App.tsx` |
| Rail, outlets, week card, storage meter | `src/components/Sidebar.tsx` |
| Status tabs, search, filter popover | `src/components/CalendarToolbar.tsx` |
| Date stepper and view switcher | `src/components/DateBar.tsx` |
| Week grid, lane layout, drop-to-time | `src/components/Calendar/WeekView.tsx` |
| Month grid + mobile day list | `src/components/Calendar/MonthView.tsx` |
| Day timeline | `src/components/Calendar/DayView.tsx` |
| Event card (dense / compact / default) | `src/components/Calendar/PostCard.tsx` |
| Dialog shells, forms, manager, simulator, settings | `src/components/**/*Modal.tsx` |
| Channel palette and copy limits | `src/constants/platforms.ts` |
| Body classes, Inter font | `index.html` |

Retired in this redesign: `src/components/Header.tsx`,
`src/components/PlatformFilterBar.tsx`,
`src/components/Calendar/CalendarHeader.tsx`. Their roles moved to the rail,
toolbar and date bar. Legacy blue accents (`#0000ee`, `#1890ff`,
`rgba(24,144,255,…)`) were replaced with the violet accent across `src/`.

---

## 13. Do / Don’t

- **Do** tint events by the primary channel and repeat all channels as dots.
  **Don’t** colour events by status.
- **Do** keep exactly three chrome rows above the calendar.
  **Don’t** add a breadcrumb bar.
- **Do** use violet for selection and focus only.
  **Don’t** use violet as a stand-in for a channel.
- **Do** keep body text ≥ 11.5px and informational labels ≥ 9.5px.
  **Don’t** shrink event titles to fit more text — clamp instead.
- **Do** keep dialogs inside the viewport and scroll their bodies.
  **Don’t** let a footer action sit below the fold.
- **Do** keep the shell full-bleed. **Don’t** reintroduce the inset preview
  window frame.
