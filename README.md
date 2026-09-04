# Ritual

A simple daily habit tracker — a PWA (installable, works offline-ish) synced across
devices via Supabase. Check habits off day by day, set optional count-based goals ("8
glasses", "20 reps"), see streaks, and browse a calendar (day/week/month/year) of what
you've done.

## Stack

React + TypeScript + Vite, [Supabase](https://supabase.com) (Postgres + Auth) for the
backend, deployed as a static site to GitHub Pages.

## Running locally

```bash
npm install
npm run dev
```

Needs two environment variables in a `.env` file at the project root (copy
`.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Both come from your Supabase project's **Settings → API** page. The anon/publishable key
is meant to be public — the app's security comes entirely from Postgres Row-Level Security,
not from keeping this key secret.

## Database schema

The full schema — tables, RLS policies, and the streak/summary SQL functions — lives in
[`supabase/schema.sql`](supabase/schema.sql). It's idempotent: paste the whole file into
the Supabase dashboard's **SQL Editor** and run it, whether you're setting up a fresh
project or picking up schema changes made since your last run.

## Known operational note (not a bug)

If the Supabase project sits untouched for 7+ days, it pauses automatically — the app will
show a connection error rather than silently failing. Your data is untouched; go to the
Supabase dashboard and click **Resume project**, and everything comes back exactly as it
was. Nothing to fix in the code for this.

## Project history

`BUILD_INSTRUCTIONS.md` is the original from-scratch build brief (historical — the schema
it describes is out of date; `supabase/schema.sql` is authoritative). `REVIEW.md` tracks
what's been reviewed and fixed since.
