import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { daysAgoISO, todayISO } from '../lib/dates';
import type { Habit, StreakSummary } from '../types';

interface Props {
  habit: Habit;
  onBack: () => void;
}

const WEEKS = 4;
const DAYS = WEEKS * 7;

export function HabitHistory({ habit, onBack }: Props) {
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState<StreakSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = daysAgoISO(DAYS - 1);
      const [{ data: logs }, { data: streakData }] = await Promise.all([
        supabase.from('habit_logs').select('log_date, completed').eq('habit_id', habit.id).gte('log_date', since),
        supabase.rpc('get_streak_summary', { p_habit_id: habit.id }),
      ]);
      if (cancelled) return;
      const set = new Set((logs ?? []).filter((l) => l.completed).map((l) => l.log_date));
      setCompletedDates(set);
      const row = Array.isArray(streakData) ? streakData[0] : streakData;
      setStreak(row ?? { current_streak: 0, longest_streak: 0 });
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [habit.id]);

  const today = todayISO();
  const cells: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    cells.push(daysAgoISO(i));
  }

  return (
    <div className="screen">
      <header className="top-bar">
        <button type="button" className="btn-link" onClick={onBack}>
          ← Back
        </button>
        <h1>{habit.name}</h1>
      </header>

      {streak && (
        <p className="subtitle">
          🔥 {streak.current_streak} day streak · best {streak.longest_streak}
        </p>
      )}

      {loading ? (
        <p className="subtitle">Loading…</p>
      ) : (
        <div className="history-grid">
          {cells.map((date) => {
            const done = completedDates.has(date);
            const isToday = date === today;
            return (
              <div
                key={date}
                className={`history-cell ${isToday ? 'today' : ''}`}
                style={{ background: done ? habit.color : undefined }}
                title={date}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
