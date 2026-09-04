import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useHabitDayLogs } from '../lib/useHabitDayLogs';
import { daysAgoISO, todayISO } from '../lib/dates';
import type { Habit, StreakSummary } from '../types';

interface Props {
  habits: Habit[];
  onAddHabit: () => void;
  onEditHabit: (habitId: string) => void;
  onViewHistory: (habitId: string) => void;
}

const STRIP_DAYS = 7;

export function Today({ habits, onAddHabit, onEditHabit, onViewHistory }: Props) {
  const [streaks, setStreaks] = useState<Record<string, StreakSummary>>({});
  const [strip, setStrip] = useState<Record<string, Set<string>>>({});
  const today = todayISO();
  const stripDates = Array.from({ length: STRIP_DAYS }, (_, i) => daysAgoISO(STRIP_DAYS - 1 - i));

  const { logs, toggleBoolean: rawToggle, adjustCount: rawAdjust } = useHabitDayLogs(today);

  const loadStreaks = useCallback(async () => {
    const { data } = await supabase.rpc('get_all_streak_summaries');
    const map: Record<string, StreakSummary> = {};
    for (const row of data ?? []) {
      map[row.habit_id] = { current_streak: row.current_streak, longest_streak: row.longest_streak };
    }
    setStreaks(map);
  }, []);

  const loadStrip = useCallback(async () => {
    const ids = habits.map((h) => h.id);
    if (ids.length === 0) {
      setStrip({});
      return;
    }
    const { data } = await supabase
      .from('habit_logs')
      .select('habit_id, log_date, completed')
      .in('habit_id', ids)
      .gte('log_date', stripDates[0])
      .lte('log_date', today);
    const map: Record<string, Set<string>> = {};
    for (const row of data ?? []) {
      if (!row.completed) continue;
      if (!map[row.habit_id]) map[row.habit_id] = new Set();
      map[row.habit_id].add(row.log_date);
    }
    setStrip(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, today]);

  useEffect(() => {
    loadStreaks();
  }, [loadStreaks]);

  useEffect(() => {
    loadStrip();
  }, [loadStrip]);

  async function refreshStreak(habitId: string) {
    const { data } = await supabase.rpc('get_streak_summary', { p_habit_id: habitId });
    const row = Array.isArray(data) ? data[0] : data;
    setStreaks((prev) => ({ ...prev, [habitId]: row ?? { current_streak: 0, longest_streak: 0 } }));
  }

  function setStripToday(habitId: string, done: boolean) {
    setStrip((prev) => {
      const next = new Set(prev[habitId] ?? []);
      if (done) next.add(today);
      else next.delete(today);
      return { ...prev, [habitId]: next };
    });
  }

  async function toggleBoolean(habitId: string) {
    const ok = await rawToggle(habitId, (entry) => setStripToday(habitId, entry.completed));
    if (ok) refreshStreak(habitId);
  }

  async function adjustCount(habit: Habit, delta: number) {
    const ok = await rawAdjust(habit, delta, (entry) => setStripToday(habit.id, entry.completed));
    if (ok) refreshStreak(habit.id);
  }

  const doneCount = habits.filter((h) => logs[h.id]?.completed).length;
  const progressPercent = habits.length === 0 ? 0 : Math.round((doneCount / habits.length) * 100);

  return (
    <div className="screen">
      <header className="top-bar">
        <h1>Today</h1>
      </header>

      {habits.length === 0 ? (
        <p className="subtitle">No habits yet — add one to get started.</p>
      ) : (
        <div className="today-progress">
          <span className="today-progress-text">
            {doneCount} of {habits.length} done today
          </span>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <ul className="habit-list">
        {habits.map((h) => {
          const log = logs[h.id];
          const done = log?.completed ?? false;
          const streak = streaks[h.id];
          const isCount = h.target_type === 'count';
          const value = Math.max(0, log?.value ?? 0);
          const completedDates = strip[h.id] ?? new Set<string>();

          return (
            <li key={h.id} className="habit-row-wrap">
              <div className="habit-row-controls">
                {isCount ? (
                  <div className="count-control">
                    <button
                      type="button"
                      className="count-btn"
                      disabled={value === 0}
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
              </div>

              <div className="mini-strip">
                {stripDates.map((date) => (
                  <span
                    key={date}
                    className={`mini-strip-dot ${completedDates.has(date) ? 'filled' : ''}`}
                    style={completedDates.has(date) ? { background: h.color } : undefined}
                    title={date}
                  />
                ))}
              </div>
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
