import type { AgeRange, Gender, Habit } from '../types';

export type GuidelineKey = 'sleep' | 'activity' | 'hydration';

export interface Guideline {
  key: GuidelineKey;
  icon: string;
  label: string;
  /** The general reference figure for this person's age range / gender. */
  figure: string;
  /** Why this figure and not another — shown small, under the figure. */
  basis: string;
  /** Library habit name to offer if they aren't tracking anything related. */
  suggestedHabit: string;
}

const SLEEP_BY_AGE: Record<AgeRange, string> = {
  '18-29': '7–9 hrs / night',
  '30-44': '7–9 hrs / night',
  '45-59': '7–9 hrs / night',
  '60+': '7–8 hrs / night',
};

const HYDRATION_BY_GENDER: Record<Gender, string> = {
  male: '~3.0–3.7 L / day',
  female: '~2.2–2.7 L / day',
  prefer_not_to_say: '~2.5–3.5 L / day',
};

/**
 * General, non-diagnostic reference ranges of the kind published by public
 * health bodies. Deliberately NOT personalised beyond the bracket someone
 * picked: no BMI, no calorie targets, nothing that reads as medical advice.
 */
export function getGuidelines(ageRange: AgeRange | null, gender: Gender | null): Guideline[] {
  return [
    {
      key: 'sleep',
      icon: '🌙',
      label: 'Sleep',
      figure: ageRange ? SLEEP_BY_AGE[ageRange] : '7–9 hrs / night',
      basis: ageRange ? `general guidance for ages ${ageRange}` : 'general adult guidance',
      suggestedHabit: 'Sleep 8 hours',
    },
    {
      key: 'activity',
      icon: '🏃',
      label: 'Activity',
      figure: '≥150 min / week',
      basis:
        ageRange === '60+'
          ? 'moderate activity, plus balance work'
          : 'moderate activity, spread across the week',
      suggestedHabit: 'Exercise',
    },
    {
      key: 'hydration',
      icon: '💧',
      label: 'Hydration',
      figure: HYDRATION_BY_GENDER[gender ?? 'prefer_not_to_say'],
      basis:
        gender && gender !== 'prefer_not_to_say'
          ? 'total fluids from all sources'
          : 'total fluids, general adult range',
      suggestedHabit: 'Drink water',
    },
  ];
}

export const GUIDELINE_DISCLAIMER =
  'General wellness guidance, not medical advice. Consult a professional for anything personalised.';

const MATCHERS: Record<GuidelineKey, RegExp> = {
  sleep: /sleep|bedtime|rest|nap/i,
  activity: /exercise|walk|run|gym|workout|yoga|stretch|push-?up|steps|cycl|swim|train/i,
  hydration: /water|hydrat/i,
};

/** The habits this person is already tracking that relate to a guideline. */
export function matchHabits(habits: Habit[], key: GuidelineKey): Habit[] {
  return habits.filter((h) => MATCHERS[key].test(h.name));
}

export interface GuidelineMetric {
  /** Completed days in the window, over days the habit has actually existed. */
  ratePercent: number;
  completedDays: number;
  windowDays: number;
  habitName: string;
}

/**
 * How this person is actually doing against a guideline, using their own logs.
 * The denominator is days since the habit was created (capped at the window),
 * so a habit added three days ago isn't scored out of thirty.
 */
export function computeMetric(
  habit: Habit,
  completedDates: string[],
  windowDays: number,
  todayISO: string
): GuidelineMetric {
  const created = habit.created_at.slice(0, 10);
  const windowStart = new Date(`${todayISO}T00:00:00`);
  windowStart.setDate(windowStart.getDate() - (windowDays - 1));
  const startISO = windowStart.toISOString().slice(0, 10);
  const effectiveStart = created > startISO ? created : startISO;

  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsed =
    Math.round(
      (new Date(`${todayISO}T00:00:00`).getTime() - new Date(`${effectiveStart}T00:00:00`).getTime()) / msPerDay
    ) + 1;
  const denominator = Math.max(1, Math.min(windowDays, elapsed));

  const completedDays = completedDates.filter((d) => d >= effectiveStart && d <= todayISO).length;

  return {
    ratePercent: Math.round((completedDays / denominator) * 100),
    completedDays,
    windowDays: denominator,
    habitName: habit.name,
  };
}
