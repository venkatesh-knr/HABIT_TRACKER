# Ritual — Code & UX Review

Review of the app as built (commit `cf8c9af`). Grouped by severity. Each item says what's
wrong, why it matters, and what to change.

The app is in good shape: the habit library, count targets, four calendar periods, bulk
archive/restore, and the RLS isolation script all go beyond the original spec. What follows
is what I'd fix next, roughly in priority order.

---

## Status — what the profile change already fixed

Since this review was written, the profile feature landed and resolved several items:

| Item | Status |
|---|---|
| 1.4 Timezone mismatch | **Fixed** — needs `supabase/schema.sql` run once |
| 1.2 Future-dated logs | **Half fixed** — DB trigger now rejects them (with one day of slack for timezone edges); the calendar still lets you *navigate* forward, so clamp the UI too |
| 1.5 Completion rate denominator | **Half fixed** — the new Profile metrics divide by days-since-created; `Stats.tsx` still divides by a flat 30 |
| 2.6 Sign out in the top bar / no Profile | **Fixed** — Profile is now a tab; sign out moved into it |
| 3.6 Inconsistent nav glyphs | **Fixed** — replaced with a consistent inline-SVG icon set |
| 4.3 Schema missing from the repo | **Fixed** — `supabase/schema.sql`, idempotent and safe to re-run |
| 4.6 Dead `.count-value` colour / `.nav-tab-icon` | Partly — the superseded `.nav-tab-icon` block is gone |

Still open and worth doing next: **1.1** (month navigation), **1.3** (unused `schedule`),
**2.1** (optimistic UI), **2.2** (`alert()`/`confirm()`), **2.3/2.4** (daily progress, 7-day
strip), **3.1** (dark mode), **3.2** (focus styles), **3.3** (tap targets), **3.4/3.5**
(calendar a11y), **4.1** (N+1 streak queries), **4.2** (duplicated log logic), **4.4**
(calendar denominator), **4.5** (README).

---

## 1. Correctness bugs (fix first)

### 1.1 Month navigation skips and repeats months
`src/screens/Calendar.tsx` — the calendar nav buttons shift the anchor by a fixed `±30` days
for the month period. From `2026-03-31`, going back 30 days lands on `2026-03-01` — still
March, so "previous month" appears to do nothing. Going forward 30 days from `2026-01-31`
lands on `2026-03-02`, skipping February entirely.

**Fix:** add month-aware helpers to `src/lib/dates.ts` (e.g. `addMonthsISO(dateISO, n)` that
clamps the day-of-month), and use them for the month period instead of day arithmetic.

### 1.2 Future dates can be checked off, inflating streaks
`src/screens/Calendar.tsx` — `shiftAnchor` has no upper bound, so you can navigate day view to
tomorrow (or 2030) and toggle habits complete. `get_streak_summary` counts those future logs,
so a streak can be fabricated by tapping forward a few days.

**Fix:** clamp forward navigation at today, and reject writes where `log_date > today` — ideally
in both places: disable the UI, and add a `check (log_date <= current_date)` style guard or a
trigger server-side so the rule holds regardless of client.

### 1.3 The `schedule` field is stored but never used
`schedule` ('daily' | 'weekdays' | 'custom') is editable in `AddEditHabit.tsx` and saved to the
DB, but nothing reads it. `get_streak_summary` counts consecutive *calendar* days, so a
weekdays-only habit has its streak reset every Saturday, and Today lists every habit regardless
of schedule.

**Fix:** either (a) remove the field from the UI for now so it stops making a promise the app
doesn't keep, or (b) make it real — filter Today by whether the habit is due, and make the
streak function skip non-due days. (b) is the better product, (a) is the honest quick fix.
Do not leave it as-is.

### 1.4 Server "today" is UTC, client "today" is local  — FIXED, pending migration
*Correction to an earlier draft of this review: the live database has no `profiles` table at
all. The schema actually applied came from `BUILD_INSTRUCTIONS_BKP.md`, whose
`get_streak_summary` uses bare `current_date` — i.e. UTC.*

`src/lib/dates.ts` computes `todayISO()` from the **browser's** local timezone, while the
streak function used the database server's UTC date. In UTC+5:30 that's a 5.5-hour
disagreement: a habit checked off just after local midnight falls on a different day
depending on which side you ask.

**Fixed by:** `supabase/schema.sql` — creates `profiles` (with `timezone`), and replaces
`get_streak_summary` with a version that resolves "today" in the caller's own timezone. The
Profile screen detects and stores the timezone on first load. **Requires running
`supabase/schema.sql` in the Supabase SQL editor.**

### 1.5 Completion rate punishes new habits
`src/screens/Stats.tsx` — `completedLast30 / WINDOW_DAYS` always divides by 30, so a habit
created three days ago maxes out at 10% even with a perfect record. The headline
"avg last 30d" number is therefore misleading and, for a new user, demoralising.

**Fix:** divide by `min(30, days since habit created)`.

---

## 2. Usability (highest impact on daily use)

### 2.1 Every tap waits for the network
Both `Today.tsx` and `Calendar.tsx` set `busy` and disable the control until Supabase responds.
On a phone with a weak signal, checking off a habit feels broken.

**Fix:** optimistic UI — update local state immediately, fire the request in the background,
revert with a toast if it fails. This is the single biggest perceived-quality change available.

### 2.2 `alert()` and `confirm()` for errors and confirmation
Used in `Today.tsx`, `Calendar.tsx`, `ManageHabits.tsx` (and `confirm()` in `AddEditHabit.tsx`).
Blocking browser dialogs look out of place in an installed PWA, and raw Supabase error strings
aren't user-facing language.

**Fix:** a small toast/inline error component, and an in-app confirm sheet for archiving.

### 2.3 No sense of progress for the day
Today lists habits but never says "3 of 5 done". The daily close-the-loop moment is the whole
emotional point of a habit tracker.

**Fix:** a compact progress row at the top of Today — count plus a thin bar or ring.

### 2.4 No 7-day strip on the Today rows
The streak number is there, but the chain itself — the thing that makes you not want to break it —
is one screen away in Calendar. A seven-cell strip per habit row on Today would surface it where
it does the most work, with one extra query for the whole screen.

### 2.5 An empty day looks identical to a day that didn't exist
`cellStyle()` returns `{}` for zero completions, so a genuinely missed day, a day before the
habit existed, and a future day all render the same. The calendar can't distinguish "you missed
this" from "nothing was expected here."

**Fix:** three visual states — completed (filled), missed (faint outline/dot), and out of range
(blank).

### 2.6 Sign out occupies the only top-bar slot on Today
A rare, mildly destructive action has prime real estate, while there's no home for profile,
timezone, or preferences. The spec's Profile screen (display name, avatar, timezone, optional
age range/gender + wellness guidelines) is designed but not built.

**Fix:** build Profile as a fifth tab or an avatar button in the top bar; move sign out inside it.

---

## 3. Design & accessibility

### 3.1 No dark mode at all
`src/index.css` hard-codes a light palette and declares `color-scheme: light`. There are no
`@media (prefers-color-scheme: dark)` rules anywhere. A habit tracker gets opened last thing at
night — a full-white screen in a dark room is the most common complaint this class of app gets.

**Fix:** the palette is already fully tokenised, so this is one media block redefining the six
variables, plus `color-scheme: light dark`.

### 3.2 No focus styles anywhere
There is not a single `:focus` or `:focus-visible` rule in the stylesheet. The app is entirely
keyboard-navigable in structure (everything is a real `<button>`) but gives no visual feedback,
which fails WCAG 2.4.7 and makes desktop use awkward.

**Fix:** one `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }` rule.

### 3.3 Tap targets below the 44px minimum
`.check` is 30×30, `.count-btn` 26×26, `.count-value` 30×30, `.btn-icon` roughly 28px tall.
Guidance (Apple HIG and WCAG 2.5.5) is 44×44. These are the *most tapped* controls in the app.

**Fix:** keep the visual circle its current size but pad the hit area out to 44px.

### 3.4 Calendar cells are invisible to screen readers
Month cells announce only a bare number ("14"), week cells a weekday and number, and the year
heatmap is `<div>`s with a `title` attribute — not announced at all, and not reachable by keyboard.

**Fix:** `aria-label` per cell ("Tuesday 14 March, 2 of 3 habits complete"), and make the
heatmap cells real buttons or mark the grid `role="img"` with a summary label.

### 3.5 Completion is encoded by colour and fill alone
Both the check state and the calendar intensity rely on colour. With the palette's five habit
colours, two of them (green `#3F6C51` and slate `#4C5A4F`) are close enough to be hard to tell
apart at 10px, and colour-blind users lose the distinction entirely.

**Fix:** the check already shows a ✓ — keep that as the primary signal; add a subtle border or
pattern to the filled calendar cells rather than relying on the colour alone. Consider an emoji
per habit (you already use emoji elsewhere) as a stronger identifier than a colour dot.

### 3.6 Nav bar glyphs are inconsistent
`✓ ▦ ▲ ☰` are four different visual weights from three different Unicode families; `▲` in
particular doesn't read as "Stats". They'll also render differently across Android and iOS.

**Fix:** a small consistent inline-SVG icon set (four icons, ~20 lines total), or emoji if you'd
rather stay dependency-free.

---

## 4. Code health

### 4.1 N+1 queries for streaks
`Today.tsx` and `Stats.tsx` both call `get_streak_summary` once **per habit**. Ten habits means
ten round trips on every screen load, and Today refetches them all whenever the habit list
changes.

**Fix:** add a `get_all_streak_summaries()` RPC returning one row per habit, and call it once.

### 4.2 The toggle/count logic is duplicated
`Today.tsx` and the day view in `Calendar.tsx` contain near-identical `toggleBoolean` and
`adjustCount` implementations (~40 lines each). They will drift.

**Fix:** extract a `useHabitLog(dateISO)` hook, or a shared `<HabitRow>` component — both screens
render the same row anyway.

### 4.3 The database schema exists nowhere in the repo
There are no `.sql` files and no migrations. The live schema has already drifted from
`BUILD_INSTRUCTIONS.md` — the app relies on `target_type`, `target_value`, `target_unit` on
`habits` and `value` on `habit_logs`, none of which appear in the documented SQL. If the Supabase
project were lost or recreated, the schema could not be reconstructed.

**Fix:** add `supabase/schema.sql` capturing the *current* state (dump it from the dashboard),
and commit every future change as a numbered migration file. This is the highest-risk item in
the whole review, because the failure mode is silent until the day it isn't — and the free tier
has no automatic backups.

### 4.4 Calendar intensity uses the wrong denominator
`Calendar.tsx` sets `total: habitIds.length` — today's habit count — for every historical day,
so a day from before three of your habits existed is shaded as though they were missed.

**Fix:** compute the denominator per day from habits whose `created_at` is on or before that day.

### 4.5 README is still the Vite template
`README.md` is the stock scaffold text. Anyone opening the repo — including future-you or a
future Claude Code session — learns nothing about the app.

**Fix:** short README: what it is, the two env vars, `npm run dev`, where the schema lives, and
the Supabase pause caveat.

### 4.6 Minor
- `src/App.css` `.count-value` sets `color` twice in a row; the first declaration is dead.
- `BUILD_INSTRUCTIONS_BKP.md` is untracked clutter — delete it or commit it deliberately.
- `index.html` has no `<meta name="description">` or `theme-color`.

---

## Suggested order

1. **1.1–1.5** — real bugs, small diffs.
2. **3.1, 3.2, 3.3** — dark mode, focus rings, tap targets. Cheap, and they change how the app *feels*.
3. **2.1, 2.3, 2.4** — optimistic UI, daily progress, 7-day strip. The biggest UX wins.
4. **4.3** — get the schema into the repo before anything else touches the database.
5. **2.6** — build the Profile screen (also fixes 1.4 properly).
6. The rest as cleanup.
