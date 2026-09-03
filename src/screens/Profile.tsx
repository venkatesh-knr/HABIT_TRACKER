import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { daysAgoISO, todayISO } from '../lib/dates';
import {
  GUIDELINE_DISCLAIMER,
  computeMetric,
  getGuidelines,
  matchHabits,
} from '../lib/wellness';
import type { GuidelineMetric } from '../lib/wellness';
import type { AgeRange, Gender, Habit, Profile as ProfileRow } from '../types';

interface Props {
  habits: Habit[];
  onAddSuggestedHabit: (habitName: string) => void;
  onSignOut: () => void;
}

const AVATARS = ['🌱', '⭐', '🔥', '🌿', '💪', '📘', '☀️', '🌙', '🎯', '🧘'];

const AGE_RANGES: { value: AgeRange; label: string }[] = [
  { value: '18-29', label: '18–29' },
  { value: '30-44', label: '30–44' },
  { value: '45-59', label: '45–59' },
  { value: '60+', label: '60+' },
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const WINDOW_DAYS = 30;

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function timezoneOptions(current: string): string[] {
  try {
    const withValues = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
    const all = withValues.supportedValuesOf?.('timeZone');
    if (all && all.length > 0) {
      return all.includes(current) ? all : [current, ...all];
    }
  } catch {
    /* falls through to the short list below */
  }
  const fallback = ['UTC', detectTimezone(), current];
  return Array.from(new Set(fallback));
}

export function Profile({ habits, onAddSuggestedHabit, onSignOut }: Props) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Record<string, GuidelineMetric | null>>({});

  const today = todayISO();

  // Load the profile, creating it if this account predates the profiles table.
  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    if (data) {
      setProfile(data as ProfileRow);
      setLoading(false);
      return;
    }

    const seed = {
      id: userId,
      display_name: userData.user?.email?.split('@')[0] ?? 'Friend',
      avatar_emoji: '🌱',
      timezone: detectTimezone(),
    };
    const { data: created, error: insertError } = await supabase
      .from('profiles')
      .insert(seed)
      .select()
      .single();

    if (insertError) {
      setError(
        insertError.message.includes('does not exist')
          ? 'The profiles table is missing — run supabase/schema.sql in the Supabase SQL editor.'
          : insertError.message
      );
    } else if (created) {
      setProfile(created as ProfileRow);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const guidelines = useMemo(
    () => getGuidelines(profile?.age_range ?? null, profile?.gender ?? null),
    [profile?.age_range, profile?.gender]
  );

  // Pull the logs behind the "how you're actually doing" figures.
  useEffect(() => {
    let cancelled = false;
    async function loadMetrics() {
      const tracked = guidelines
        .map((g) => ({ key: g.key, habit: matchHabits(habits, g.key)[0] ?? null }))
        .filter((entry): entry is { key: typeof entry.key; habit: Habit } => entry.habit !== null);

      if (tracked.length === 0) {
        if (!cancelled) setMetrics({});
        return;
      }

      const { data } = await supabase
        .from('habit_logs')
        .select('habit_id, log_date, completed')
        .in('habit_id', tracked.map((t) => t.habit.id))
        .gte('log_date', daysAgoISO(WINDOW_DAYS - 1))
        .eq('completed', true);

      if (cancelled) return;

      const next: Record<string, GuidelineMetric | null> = {};
      for (const { key, habit } of tracked) {
        const dates = (data ?? []).filter((row) => row.habit_id === habit.id).map((row) => row.log_date);
        next[key] = computeMetric(habit, dates, WINDOW_DAYS, today);
      }
      setMetrics(next);
    }
    loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [guidelines, habits, today]);

  function update<K extends keyof ProfileRow>(key: K, value: ProfileRow[K]) {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSavedAt(null);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        display_name: profile.display_name.trim() || 'Friend',
        avatar_emoji: profile.avatar_emoji,
        timezone: profile.timezone,
        age_range: profile.age_range,
        gender: profile.gender,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSavedAt(Date.now());
  }

  if (loading) {
    return (
      <div className="screen">
        <header className="top-bar">
          <h1>Profile</h1>
        </header>
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="screen">
        <header className="top-bar">
          <h1>Profile</h1>
        </header>
        {error && <p className="error">{error}</p>}
        <button type="button" className="btn-link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <h1>Profile</h1>
      </header>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>Display name</span>
          <input
            type="text"
            value={profile.display_name}
            onChange={(e) => update('display_name', e.target.value)}
            maxLength={40}
          />
        </label>

        <fieldset className="field">
          <legend>Avatar</legend>
          <div className="avatar-row">
            {AVATARS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`avatar-option ${profile.avatar_emoji === emoji ? 'selected' : ''}`}
                onClick={() => update('avatar_emoji', emoji)}
                aria-label={`Avatar ${emoji}`}
                aria-pressed={profile.avatar_emoji === emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>Timezone — keeps “today” correct for streaks</span>
          <select value={profile.timezone} onChange={(e) => update('timezone', e.target.value)}>
            {timezoneOptions(profile.timezone).map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Age range — optional</span>
          <select
            value={profile.age_range ?? ''}
            onChange={(e) => update('age_range', (e.target.value || null) as AgeRange | null)}
          >
            <option value="">Not set</option>
            {AGE_RANGES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Gender — optional</span>
          <select
            value={profile.gender ?? ''}
            onChange={(e) => update('gender', (e.target.value || null) as Gender | null)}
          >
            <option value="">Not set</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <p className="field-note">
          Age range and gender are only used to pick which general guidelines to show below. Leave
          them blank and you’ll see the general adult figures instead.
        </p>

        {error && <p className="error">{error}</p>}

        <div className="save-row">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          {savedAt && !saving && <span className="saved-note">Saved</span>}
        </div>
      </form>

      <section className="guide-section">
        <h2 className="section-title">Your general guidelines</h2>

        {guidelines.map((g) => {
          const metric = metrics[g.key] ?? null;
          return (
            <article key={g.key} className="guide-card">
              <div className="guide-head">
                <span className="guide-icon" aria-hidden="true">
                  {g.icon}
                </span>
                <div className="guide-heading-text">
                  <h3>{g.label}</h3>
                  <p className="guide-basis">{g.basis}</p>
                </div>
                <span className="guide-figure">{g.figure}</span>
              </div>

              {metric ? (
                <div className="guide-metric">
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${Math.min(100, metric.ratePercent)}%` }}
                    />
                  </div>
                  <p className="guide-metric-text">
                    <strong>{metric.habitName}</strong> — done {metric.completedDays} of the last{' '}
                    {metric.windowDays} days ({metric.ratePercent}%)
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-link guide-add"
                  onClick={() => onAddSuggestedHabit(g.suggestedHabit)}
                >
                  + Track this — add “{g.suggestedHabit}”
                </button>
              )}
            </article>
          );
        })}

        <p className="disclaimer">{GUIDELINE_DISCLAIMER}</p>
      </section>

      <button type="button" className="btn-link sign-out" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
