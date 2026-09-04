import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/dates';
import { computeMetric } from '../lib/wellness';
import type { GuidelineMetric } from '../lib/wellness';
import type { Habit, StreakSummary } from '../types';

interface Props {
  habits: Habit[];
}

interface HabitStat {
  streak: StreakSummary;
  metric: GuidelineMetric;
  totalCompleted: number;
}

const WINDOW_DAYS = 30;

export function Stats({ habits }: Props) {
  const [stats, setStats] = useState<Record<string, HabitStat>>({});
  const [loading, setLoading] = useState(true);
  const today = todayISO();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (habits.length === 0) {
        setStats({});
        setLoading(false);
        return;
      }
      setLoading(true);
      const ids = habits.map((h) => h.id);

      const [{ data: allLogs }, streakEntries] = await Promise.all([
        supabase.from('habit_logs').select('habit_id, log_date, completed').in('habit_id', ids),
        Promise.all(
          habits.map(async (h) => {
            const { data } = await supabase.rpc('get_streak_summary', { p_habit_id: h.id });
            const row = Array.isArray(data) ? data[0] : data;
            return [h.id, row ?? { current_streak: 0, longest_streak: 0 }] as const;
          })
        ),
      ]);

      if (cancelled) return;

      const streakMap = Object.fromEntries(streakEntries);
      const next: Record<string, HabitStat> = {};
      for (const h of habits) {
        const logsForHabit = (allLogs ?? []).filter((l) => l.habit_id === h.id && l.completed);
        const dates = logsForHabit.map((l) => l.log_date);
        next[h.id] = {
          streak: streakMap[h.id],
          metric: computeMetric(h, dates, WINDOW_DAYS, today),
          totalCompleted: logsForHabit.length,
        };
      }
      setStats(next);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [habits, today]);

  if (loading) {
    return (
      <div className="screen">
        <header className="top-bar">
          <h1>Stats</h1>
        </header>
        <p className="subtitle">Loading…</p>
      </div>
    );
  }

  const totalCompletions = Object.values(stats).reduce((sum, s) => sum + s.totalCompleted, 0);
  const avgCompletionRate =
    habits.length === 0
      ? 0
      : Math.round(Object.values(stats).reduce((sum, s) => sum + s.metric.ratePercent, 0) / habits.length);

  return (
    <div className="screen">
      <header className="top-bar">
        <h1>Stats</h1>
      </header>

      {habits.length === 0 ? (
        <p className="subtitle">Add a habit to start seeing stats.</p>
      ) : (
        <>
          <div className="stats-summary">
            <div className="stats-summary-item">
              <span className="stats-summary-value">{habits.length}</span>
              <span className="stats-summary-label">habits</span>
            </div>
            <div className="stats-summary-item">
              <span className="stats-summary-value">{totalCompletions}</span>
              <span className="stats-summary-label">total check-ins</span>
            </div>
            <div className="stats-summary-item">
              <span className="stats-summary-value">{avgCompletionRate}%</span>
              <span className="stats-summary-label">avg completion</span>
            </div>
          </div>

          <ul className="stats-list">
            {habits.map((h) => {
              const s = stats[h.id];
              const rate = s?.metric.ratePercent ?? 0;
              const windowDays = s?.metric.windowDays ?? WINDOW_DAYS;
              return (
                <li key={h.id} className="stats-card">
                  <div className="stats-card-header">
                    <span className="chip-dot" style={{ background: h.color }} />
                    <span className="stats-card-name">{h.name}</span>
                    <span className="streak">🔥 {s?.streak.current_streak ?? 0}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${rate}%`, background: h.color }} />
                  </div>
                  <div className="stats-card-meta">
                    <span>
                      {rate}% last {windowDays} day{windowDays === 1 ? '' : 's'}
                    </span>
                    <span>best streak {s?.streak.longest_streak ?? 0}</span>
                    <span>{s?.totalCompleted ?? 0} total</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
