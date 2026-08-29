import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/dates';
import type { Habit, StreakSummary } from '../types';

interface TodayLog {
  completed: boolean;
  value: number | null;
}

interface Props {
  habits: Habit[];
  onAddHabit: () => void;
  onEditHabit: (habitId: string) => void;
  onViewHistory: (habitId: string) => void;
  onSignOut: () => void;
}

export function Today({ habits, onAddHabit, onEditHabit, onViewHistory, onSignOut }: Props) {
  const [logs, setLogs] = useState<Record<string, TodayLog>>({});
  const [streaks, setStreaks] = useState<Record<string, StreakSummary>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayISO();

  const loadTodayLogs = useCallback(async () => {
    const { data } = await supabase.from('habit_logs').select('habit_id, completed, value').eq('log_date', today);
    const map: Record<string, TodayLog> = {};
    for (const row of data ?? []) {
      map[row.habit_id] = { completed: row.completed, value: row.value };
    }
    setLogs(map);
  }, [today]);

  const loadStreaks = useCallback(async () => {
    const entries = await Promise.all(
      habits.map(async (h) => {
        const { data } = await supabase.rpc('get_streak_summary', { p_habit_id: h.id });
        const row = Array.isArray(data) ? data[0] : data;
        return [h.id, row ?? { current_streak: 0, longest_streak: 0 }] as const;
      })
    );
    setStreaks(Object.fromEntries(entries));
  }, [habits]);

  useEffect(() => {
    loadTodayLogs();
  }, [loadTodayLogs]);

  useEffect(() => {
    loadStreaks();
  }, [loadStreaks]);

  async function refreshStreak(habitId: string) {
    const { data } = await supabase.rpc('get_streak_summary', { p_habit_id: habitId });
    const row = Array.isArray(data) ? data[0] : data;
    setStreaks((prev) => ({ ...prev, [habitId]: row ?? { current_streak: 0, longest_streak: 0 } }));
  }

  async function toggleBoolean(habitId: string) {
    const currentlyDone = logs[habitId]?.completed ?? false;
    setBusy(habitId);
    const { error } = await supabase
      .from('habit_logs')
      .upsert({ habit_id: habitId, log_date: today, completed: !currentlyDone }, { onConflict: 'habit_id,log_date' });
    setBusy(null);
    if (error) {
      alert(error.message);
      return;
    }
    setLogs((prev) => ({ ...prev, [habitId]: { completed: !currentlyDone, value: null } }));
    refreshStreak(habitId);
  }

  async function adjustCount(habit: Habit, delta: number) {
    const target = habit.target_value ?? 1;
    const currentValue = Math.max(0, logs[habit.id]?.value ?? 0);
    const nextValue = Math.max(0, currentValue + delta);
    setBusy(habit.id);
    const { error } = await supabase.from('habit_logs').upsert(
      { habit_id: habit.id, log_date: today, value: nextValue, completed: nextValue >= target },
      { onConflict: 'habit_id,log_date' }
    );
    setBusy(null);
    if (error) {
      alert(error.message);
      return;
    }
    setLogs((prev) => ({ ...prev, [habit.id]: { completed: nextValue >= target, value: nextValue } }));
    refreshStreak(habit.id);
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <h1>Today</h1>
        <button type="button" className="btn-link" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      {habits.length === 0 && <p className="subtitle">No habits yet — add one to get started.</p>}

      <ul className="habit-list">
        {habits.map((h) => {
          const log = logs[h.id];
          const done = log?.completed ?? false;
          const streak = streaks[h.id];
          const isCount = h.target_type === 'count';
          const value = Math.max(0, log?.value ?? 0);

          return (
            <li key={h.id} className="habit-row">
              {isCount ? (
                <div className="count-control">
                  <button
                    type="button"
                    className="count-btn"
                    disabled={busy === h.id || value === 0}
                    onClick={() => adjustCount(h, -1)}
                    aria-label={`Decrease ${h.name}`}
                  >
                    −
                  </button>
                  <span
                    className={`count-value ${done ? 'checked' : ''}`}
                    style={done ? { background: h.color, borderColor: h.color } : { borderColor: h.color }}
                  >
                    {done ? '✓' : value}
                  </span>
                  <button
                    type="button"
                    className="count-btn"
                    disabled={busy === h.id}
                    onClick={() => adjustCount(h, 1)}
                    aria-label={`Increase ${h.name}`}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`check ${done ? 'checked' : ''}`}
                  style={{ borderColor: h.color, background: done ? h.color : 'transparent' }}
                  disabled={busy === h.id}
                  onClick={() => toggleBoolean(h.id)}
                  aria-label={done ? `Mark ${h.name} not done` : `Mark ${h.name} done`}
                >
                  {done ? '✓' : ''}
                </button>
              )}

              <button type="button" className="habit-name" onClick={() => onViewHistory(h.id)}>
                <span>
                  {h.name}
                  {isCount && (
                    <span className="goal-sub">
                      {value}/{h.target_value} {h.target_unit ?? ''}
                    </span>
                  )}
                </span>
                <span className="streak">{streak ? `🔥 ${streak.current_streak}` : '…'}</span>
              </button>

              <button type="button" className="btn-icon" onClick={() => onEditHabit(h.id)} aria-label={`Edit ${h.name}`}>
                ⋯
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" className="btn-primary fixed-add" onClick={onAddHabit}>
        + Add habit
      </button>
    </div>
  );
}
