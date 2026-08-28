import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { todayISO } from '../lib/dates';
import type { Habit, StreakSummary } from '../types';

interface Props {
  habits: Habit[];
  onAddHabit: () => void;
  onEditHabit: (habitId: string) => void;
  onViewHistory: (habitId: string) => void;
  onSignOut: () => void;
}

export function Today({ habits, onAddHabit, onEditHabit, onViewHistory, onSignOut }: Props) {
  const [doneToday, setDoneToday] = useState<Record<string, boolean>>({});
  const [streaks, setStreaks] = useState<Record<string, StreakSummary>>({});
  const [toggling, setToggling] = useState<string | null>(null);
  const today = todayISO();

  const loadTodayLogs = useCallback(async () => {
    const { data } = await supabase.from('habit_logs').select('habit_id, completed').eq('log_date', today);
    const map: Record<string, boolean> = {};
    for (const row of data ?? []) {
      map[row.habit_id] = row.completed;
    }
    setDoneToday(map);
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

  async function toggle(habitId: string) {
    const currentlyDone = doneToday[habitId] ?? false;
    setToggling(habitId);
    const { error } = await supabase
      .from('habit_logs')
      .upsert({ habit_id: habitId, log_date: today, completed: !currentlyDone }, { onConflict: 'habit_id,log_date' });
    setToggling(null);
    if (error) {
      alert(error.message);
      return;
    }
    setDoneToday((prev) => ({ ...prev, [habitId]: !currentlyDone }));
    const { data } = await supabase.rpc('get_streak_summary', { p_habit_id: habitId });
    const row = Array.isArray(data) ? data[0] : data;
    setStreaks((prev) => ({ ...prev, [habitId]: row ?? { current_streak: 0, longest_streak: 0 } }));
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
          const done = doneToday[h.id] ?? false;
          const streak = streaks[h.id];
          return (
            <li key={h.id} className="habit-row">
              <button
                type="button"
                className={`check ${done ? 'checked' : ''}`}
                style={{ borderColor: h.color, background: done ? h.color : 'transparent' }}
                disabled={toggling === h.id}
                onClick={() => toggle(h.id)}
                aria-label={done ? `Mark ${h.name} not done` : `Mark ${h.name} done`}
              >
                {done ? '✓' : ''}
              </button>

              <button type="button" className="habit-name" onClick={() => onViewHistory(h.id)}>
                <span>{h.name}</span>
                <span className="streak">
                  {streak ? `🔥 ${streak.current_streak}` : '…'}
                </span>
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
