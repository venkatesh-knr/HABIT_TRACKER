import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/feedback';
import { daysAgoISO, todayISO } from '../lib/dates';
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
}

const STRIP_DAYS = 7;

export function Today({ habits, onAddHabit, onEditHabit, onViewHistory }: Props) {
  const [logs, setLogs] = useState<Record<string, TodayLog>>({});
  const [streaks, setStreaks] = useState<Record<string, StreakSummary>>({});
  const [strip, setStrip] = useState<Record<string, Set<string>>>({});
  const lastConfirmed = useRef<Record<string, TodayLog>>({});
  const showToast = useToast();
  const today = todayISO();
  const stripDates = Array.from({ length: STRIP_DAYS }, (_, i) => daysAgoISO(STRIP_DAYS - 1 - i));

  const loadTodayLogs = useCallback(async () => {
    const { data } = await supabase.from('habit_logs').select('habit_id, completed, value').eq('log_date', today);
    const map: Record<string, TodayLog> = {};
    for (const row of data ?? []) {
      map[row.habit_id] = { completed: row.completed, value: row.value };
    }
    lastConfirmed.current = map;
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
    loadTodayLogs();
  }, [loadTodayLogs]);

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
    const nextDone = !(logs[habitId]?.completed ?? false);
    setLogs((prev) => ({ ...prev, [habitId]: { completed: nextDone, value: null } }));
    setStripToday(habitId, nextDone);

    const { error } = await supabase
      .from('habit_logs')
      .upsert({ habit_id: habitId, log_date: today, completed: nextDone }, { onConflict: 'habit_id,log_date' });

    if (error) {
      const confirmed = lastConfirmed.current[habitId] ?? { completed: false, value: null };
      setLogs((prev) => ({ ...prev, [habitId]: confirmed }));
      setStripToday(habitId, confirmed.completed);
      showToast(error.message);
      return;
    }
    lastConfirmed.current[habitId] = { completed: nextDone, value: null };
    refreshStreak(habitId);
  }

  async function adjustCount(habit: Habit, delta: number) {
    const target = habit.target_value ?? 1;
    const currentValue = Math.max(0, logs[habit.id]?.value ?? 0);
    const nextValue = Math.max(0, currentValue + delta);
    const nextDone = nextValue >= target;
    setLogs((prev) => ({ ...prev, [habit.id]: { completed: nextDone, value: nextValue } }));
    setStripToday(habit.id, nextDone);

    const { error } = await supabase.from('habit_logs').upsert(
      { habit_id: habit.id, log_date: today, value: nextValue, completed: nextDone },
      { onConflict: 'habit_id,log_date' }
    );

    if (error) {
      const confirmed = lastConfirmed.current[habit.id] ?? { completed: false, value: 0 };
      setLogs((prev) => ({ ...prev, [habit.id]: confirmed }));
      setStripToday(habit.id, confirmed.completed);
      showToast(error.message);
      return;
    }
    lastConfirmed.current[habit.id] = { completed: nextDone, value: nextValue };
    refreshStreak(habit.id);
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
