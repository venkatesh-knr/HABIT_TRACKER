import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useToast } from './feedback';
import type { Habit } from '../types';

export interface DayLogEntry {
  completed: boolean;
  value: number | null;
}

const EMPTY_ENTRY: DayLogEntry = { completed: false, value: null };

/**
 * Loads and optimistically mutates one day's habit_logs for every habit.
 * Shared by Today (always "today") and Calendar's day view (any date) —
 * they only differ in what happens after a change (streak refresh, the
 * 7-day strip), which callers layer on via onSettled/the resolved boolean.
 */
export function useHabitDayLogs(dateISO: string) {
  const [logs, setLogs] = useState<Record<string, DayLogEntry>>({});
  const lastConfirmed = useRef<Record<string, DayLogEntry>>({});
  const showToast = useToast();

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from('habit_logs').select('habit_id, completed, value').eq('log_date', dateISO);
    const map: Record<string, DayLogEntry> = {};
    for (const row of data ?? []) {
      map[row.habit_id] = { completed: row.completed, value: row.value };
    }
    lastConfirmed.current = map;
    setLogs(map);
  }, [dateISO]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  async function toggleBoolean(habitId: string, onSettled?: (entry: DayLogEntry) => void): Promise<boolean> {
    const nextDone = !(logs[habitId]?.completed ?? false);
    const optimistic: DayLogEntry = { completed: nextDone, value: null };
    setLogs((prev) => ({ ...prev, [habitId]: optimistic }));
    onSettled?.(optimistic);

    const { error } = await supabase
      .from('habit_logs')
      .upsert({ habit_id: habitId, log_date: dateISO, completed: nextDone }, { onConflict: 'habit_id,log_date' });

    if (error) {
      const confirmed = lastConfirmed.current[habitId] ?? EMPTY_ENTRY;
      setLogs((prev) => ({ ...prev, [habitId]: confirmed }));
      onSettled?.(confirmed);
      showToast(error.message);
      return false;
    }
    lastConfirmed.current[habitId] = optimistic;
    return true;
  }

  async function adjustCount(habit: Habit, delta: number, onSettled?: (entry: DayLogEntry) => void): Promise<boolean> {
    const target = habit.target_value ?? 1;
    const currentValue = Math.max(0, logs[habit.id]?.value ?? 0);
    const nextValue = Math.max(0, currentValue + delta);
    const optimistic: DayLogEntry = { completed: nextValue >= target, value: nextValue };
    setLogs((prev) => ({ ...prev, [habit.id]: optimistic }));
    onSettled?.(optimistic);

    const { error } = await supabase.from('habit_logs').upsert(
      { habit_id: habit.id, log_date: dateISO, value: nextValue, completed: optimistic.completed },
      { onConflict: 'habit_id,log_date' }
    );

    if (error) {
      const confirmed = lastConfirmed.current[habit.id] ?? { completed: false, value: 0 };
      setLogs((prev) => ({ ...prev, [habit.id]: confirmed }));
      onSettled?.(confirmed);
      showToast(error.message);
      return false;
    }
    lastConfirmed.current[habit.id] = optimistic;
    return true;
  }

  return { logs, toggleBoolean, adjustCount };
}
