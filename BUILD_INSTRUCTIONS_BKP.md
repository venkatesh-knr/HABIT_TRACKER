> ## ⚠️ HISTORICAL — the original build brief the app was actually built from.
> Do not follow. Current schema: `supabase/schema.sql`. Current work list: `REVIEW.md`.

# Ritual — Build Instructions for Claude Code

**Project folder:** `D:\Project\CLAUDE\HABIT_TRACKER`
**Reference:** this implements the design at the "Ritual Habit Tracker" spec artifact (GitHub Pages + Supabase, PWA, synced across devices, opt-in starter habits).

This file is written to be handed directly to Claude Code as its working brief. Open a terminal in `D:\Project\CLAUDE\HABIT_TRACKER` (create the folder first if it doesn't exist) and run `claude`, then point it at this file — e.g. *"Read BUILD_INSTRUCTIONS.md in this folder and work through it phase by phase, checking in with me after each one."*

Two things only a human can do are called out explicitly below (creating the Supabase project, creating the GitHub repo) — everything else is written so Claude Code can execute it directly.

---

## 0. Prerequisites (do this before starting Claude Code)

1. Node.js 20+ and Git installed on this machine.
2. A GitHub account (you already have one — this will use it).
3. A free Supabase account, signed up at [supabase.com](https://supabase.com) using "Continue with GitHub" — takes a minute.
4. Inside Supabase: **New project** → name it `ritual` (or anything) → pick a region close to you → set a database password (save it somewhere; you won't need it day-to-day since the app uses the anon key, not this password) → wait ~2 minutes for it to finish provisioning.
5. Once it's ready, go to **Project Settings → API** and copy two values — you'll paste them into `.env` in Phase 2:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **anon / public key** (a long string — this one is *meant* to be public, see the design doc's security section)

---

## Phase 1 — Scaffold the project

```bash
cd "D:\Project\CLAUDE\HABIT_TRACKER"
npm create vite@latest . -- --template react-ts
npm install
npm install @supabase/supabase-js
npm install -D vite-plugin-pwa
```

Create `.gitignore` (if Vite's default doesn't already cover these):

```
node_modules
dist
.env
```

---

## Phase 2 — Environment variables

Create `.env.example` (committed to git, no real values):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Copy it to `.env` (never committed) and fill in the two values from Prerequisites step 5:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## Phase 3 — Database schema + Row-Level Security

In the Supabase dashboard, open **SQL Editor → New query**, paste the following, and click **Run**. This is the entire backend — no server code needed.

```sql
-- habits: each row belongs to exactly one user
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  schedule text not null default 'daily' check (schedule in ('daily', 'weekdays', 'custom')),
  color text not null default '#3F6C51',
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- habit_logs: one row per habit per day it was checked off
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date date not null,
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (habit_id, log_date)
);

-- turn on Row-Level Security (locked down by default until policies say otherwise)
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

-- a user can only ever see or touch their own rows
create policy "habits_select_own" on public.habits for select using (auth.uid() = user_id);
create policy "habits_insert_own" on public.habits for insert with check (auth.uid() = user_id);
create policy "habits_update_own" on public.habits for update using (auth.uid() = user_id);
create policy "habits_delete_own" on public.habits for delete using (auth.uid() = user_id);

create policy "logs_select_own" on public.habit_logs for select using (auth.uid() = user_id);
create policy "logs_insert_own" on public.habit_logs for insert with check (auth.uid() = user_id);
create policy "logs_update_own" on public.habit_logs for update using (auth.uid() = user_id);
create policy "logs_delete_own" on public.habit_logs for delete using (auth.uid() = user_id);

-- streak calculation, done once server-side instead of in the browser
create or replace function public.get_streak_summary(p_habit_id uuid)
returns table(current_streak integer, longest_streak integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  return query
  with completed_days as (
    select log_date
    from habit_logs
    where habit_id = p_habit_id
      and user_id = v_user_id
      and completed = true
  ),
  grouped as (
    select
      log_date,
      log_date - (row_number() over (order by log_date))::int * interval '1 day' as grp
    from completed_days
  ),
  streaks as (
    select min(log_date) as streak_start, max(log_date) as streak_end, count(*) as streak_length
    from grouped
    group by grp
  )
  select
    coalesce((select streak_length::int from streaks
              where streak_end >= current_date - interval '1 day'
              order by streak_end desc limit 1), 0),
    coalesce((select max(streak_length)::int from streaks), 0);
end;
$$;

grant execute on function public.get_streak_summary(uuid) to authenticated;
```

**Claude Code: after running this, write a short test — sign up two dummy users and confirm user A can never see or modify user B's habits or logs, even by guessing an id.** This is the isolation guarantee the whole design rests on; don't skip verifying it.

---

## Phase 4 — Supabase client

`src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## Phase 5 — Screens

Build these five screens (all one column, responsive, no separate mobile layout needed):

1. **Sign in / Register** — email + password, one form that toggles between the two modes. Uses `supabase.auth.signInWithPassword()` / `supabase.auth.signUp()`.
2. **Get started** *(first sign-in only)* — a strip of tap-to-add suggestion chips from a static list (below); tapping one calls the same insert as creating a habit manually. Hide this screen permanently once the user has at least one habit.
3. **Today** — lists active (non-archived) habits with a tap-to-toggle checkbox for today, and each habit's current streak shown inline (from `get_streak_summary`).
4. **Habit history** — a small grid of recent days for one habit (last ~4 weeks), filled cells = completed.
5. **Add / Edit habit** — name, color, schedule. "Delete" archives (`is_archived = true`) rather than deleting, so history is preserved.

`src/lib/starterHabits.ts`:

```ts
export const STARTER_HABITS = [
  { name: 'Drink water', color: '#3F6C51' },
  { name: 'Exercise', color: '#9C6B26' },
  { name: 'Read', color: '#3F6C51' },
  { name: 'Sleep 8 hours', color: '#4C5A4F' },
  { name: 'Meditate', color: '#3F6C51' },
  { name: 'Stretch', color: '#9C6B26' },
];
```

Reference data calls (all through the `supabase` client from Phase 4):

```ts
// list habits
supabase.from('habits').select('*').eq('is_archived', false).order('created_at');

// add habit (user_id fills in automatically via the column default)
supabase.from('habits').insert({ name, schedule, color });

// edit / archive
supabase.from('habits').update({ name, color, is_archived }).eq('id', habitId);

// toggle today done/not done (idempotent thanks to the unique constraint)
supabase.from('habit_logs').upsert({ habit_id: habitId, log_date: today, completed: true });

// history for the grid
supabase.from('habit_logs').select('log_date, completed').eq('habit_id', habitId).gte('log_date', fourWeeksAgo);

// streak numbers
supabase.rpc('get_streak_summary', { p_habit_id: habitId });
```

---

## Phase 6 — Make it installable (PWA)

In `vite.config.ts`, add the plugin (this generates the manifest and service worker for you — no hand-written service worker file needed):

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/HABIT_TRACKER/', // must match the GitHub repo name from Phase 8
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ritual',
        short_name: 'Ritual',
        description: 'A simple daily habit tracker',
        start_url: '.',
        display: 'standalone',
        background_color: '#F5F6F2',
        theme_color: '#3F6C51',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
```

Add two icon files (`icon-192.png`, `icon-512.png`) to `public/` — any simple square logo works; this can be a placeholder for now and swapped later.

---

## Phase 7 — Test locally

```bash
npm run dev
```

Open `http://localhost:5173`, register an account, add a habit, check it off, confirm the streak updates. Confirm the "Get started" suggestions disappear after the first habit is added.

---

## Phase 8 — GitHub repo + deploy to GitHub Pages

**Human step:** create a new empty repository on GitHub named `HABIT_TRACKER` (matching the `base` path set in Phase 6) — don't initialize it with a README.

Then, from `D:\Project\CLAUDE\HABIT_TRACKER`:

```bash
git init
git add .
git commit -m "Initial commit: Ritual habit tracker"
git branch -M main
git remote add origin https://github.com/<your-username>/HABIT_TRACKER.git
git push -u origin main
```

**Human step:** in the GitHub repo → **Settings → Secrets and variables → Actions**, add two repository secrets so the build has them without committing `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

(same two values from Prerequisites step 5)

**Human step:** in **Settings → Pages**, set **Source** to "GitHub Actions".

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Pages deploy workflow"
git push
```

Watch the **Actions** tab in GitHub — once it's green, the app is live at:

```
https://<your-username>.github.io/HABIT_TRACKER/
```

---

## Phase 9 — Install on your phone

Open that URL once on your phone, then:
- **iOS Safari:** Share → Add to Home Screen
- **Android Chrome:** tap the install prompt, or ⋮ menu → Install app

From then on it opens from its own icon, full-screen, and stays in sync with the same URL on your laptop.

---

## Known operational note (not a bug)

If the Supabase project sits untouched for 7+ days, it pauses automatically — the app will show a connection error rather than silently failing. Your data is untouched; go to the Supabase dashboard and click **Resume project**, and everything comes back exactly as it was. Nothing to fix in the code for this.

---

## Final checklist

- [ ] Register two separate test accounts and confirm neither can see the other's habits (Phase 3's isolation test)
- [ ] Add, check off, edit, and archive a habit
- [ ] Confirm current streak and longest streak are both correct after a few days of test data
- [ ] Confirm the app installs on a phone and opens full-screen with no address bar
- [ ] Confirm the same account shows the same habits on both phone and laptop
- [ ] Confirm `.env` is in `.gitignore` and was never committed
