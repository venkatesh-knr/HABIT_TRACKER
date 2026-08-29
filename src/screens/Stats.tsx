import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { daysAgoISO } from '../lib/dates';
import type { Habit, StreakSummary } from '../types';

interface Props {
  habits: Habit[];
}

interface HabitStat {
  streak: StreakSummary;
  completedLast30: number;
  totalCompleted: number;
}

const WINDOW_DAYS = 30;

export function Stats({ habits }: Props) {
  const [stats, setStats] = useState<Record<string, HabitStat>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (habits.length === 0) {
        setStats({});
        setLoading(false);
        return;
      }
      setLoading(true);
      const since = daysAgoISO(WINDOW_DAYS - 1);
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
        const completedLast30 = logsForHabit.filter((l) => l.log_date >= since).length;
        next[h.id] = {
          streak: streakMap[h.id],
          completedLast30,
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
  }, [habits]);

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
      : Math.round(
          (Object.values(stats).reduce((sum, s) => sum + s.completedLast30 / WINDOW_DAYS, 0) / habits.length) * 100
        );

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
              <span className="stats-summary-label">avg last 30d</span>
            </div>
          </div>

          <ul className="stats-list">
            {habits.map((h) => {
              const s = stats[h.id];
              const rate = s ? Math.round((s.completedLast30 / WINDOW_DAYS) * 100) : 0;
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
                    <span>{rate}% last 30 days</span>
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
