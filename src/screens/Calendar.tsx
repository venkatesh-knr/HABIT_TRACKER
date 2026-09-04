import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/feedback';
import {
  addDaysISO,
  addMonthsISO,
  daysInMonth,
  formatDayLabel,
  formatMonthLabel,
  startOfMonthISO,
  startOfWeekISO,
  todayISO,
  weekdayIndex,
  WEEKDAY_LABELS,
} from '../lib/dates';
import type { Habit } from '../types';

type Period = 'day' | 'week' | 'month' | 'year';

interface Props {
  habits: Habit[];
  initialHabitId?: string | null;
}

interface DayEntry {
  completed: boolean;
  value: number | null;
}

const YEAR_WEEKS = 52;

export function Calendar({ habits, initialHabitId }: Props) {
  const [period, setPeriod] = useState<Period>('month');
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(initialHabitId ?? null);
  const [anchor, setAnchor] = useState(todayISO());
  const [dayLogs, setDayLogs] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const showToast = useToast();

  // day-view editable state (always covers all habits for the anchor date)
  const [dayEntries, setDayEntries] = useState<Record<string, DayEntry>>({});
  const lastConfirmed = useRef<Record<string, DayEntry>>({});

  useEffect(() => {
    if (initialHabitId) {
      setSelectedHabitId(initialHabitId);
      setPeriod('month');
    }
  }, [initialHabitId]);

  const selectedHabit = habits.find((h) => h.id === selectedHabitId) ?? null;

  const range = useMemo(() => {
    if (period === 'day') return { start: anchor, end: anchor };
    if (period === 'week') {
      const start = startOfWeekISO(anchor);
      return { start, end: addDaysISO(start, 6) };
    }
    if (period === 'month') {
      const d = new Date(anchor + 'T00:00:00');
      const start = startOfMonthISO(d.getFullYear(), d.getMonth());
      return { start, end: addDaysISO(start, daysInMonth(d.getFullYear(), d.getMonth()) - 1) };
    }
    // year: rolling 52 weeks ending at the end of anchor's week
    const weekEnd = addDaysISO(startOfWeekISO(anchor), 6);
    return { start: addDaysISO(weekEnd, -(YEAR_WEEKS * 7 - 1)), end: weekEnd };
  }, [period, anchor]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const habitIds = selectedHabitId ? [selectedHabitId] : habits.map((h) => h.id);
      if (habitIds.length === 0) {
        setDayLogs({});
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('habit_logs')
        .select('habit_id, log_date, completed')
        .in('habit_id', habitIds)
        .gte('log_date', range.start)
        .lte('log_date', range.end);

      if (cancelled) return;

      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        if (!row.completed) continue;
        map[row.log_date] = (map[row.log_date] ?? 0) + 1;
      }
      setDayLogs(map);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, selectedHabitId, habits]);

  useEffect(() => {
    if (period !== 'day') return;
    let cancelled = false;
    async function loadDay() {
      const { data } = await supabase.from('habit_logs').select('habit_id, completed, value').eq('log_date', anchor);
      if (cancelled) return;
      const map: Record<string, DayEntry> = {};
      for (const row of data ?? []) {
        map[row.habit_id] = { completed: row.completed, value: row.value };
      }
      lastConfirmed.current = map;
      setDayEntries(map);
    }
    loadDay();
    return () => {
      cancelled = true;
    };
  }, [period, anchor]);

  async function toggleBoolean(habitId: string) {
    const nextDone = !(dayEntries[habitId]?.completed ?? false);
    setDayEntries((prev) => ({ ...prev, [habitId]: { completed: nextDone, value: null } }));

    const { error } = await supabase
      .from('habit_logs')
      .upsert({ habit_id: habitId, log_date: anchor, completed: nextDone }, { onConflict: 'habit_id,log_date' });

    if (error) {
      const confirmed = lastConfirmed.current[habitId] ?? { completed: false, value: null };
      setDayEntries((prev) => ({ ...prev, [habitId]: confirmed }));
      showToast(error.message);
      return;
    }
    lastConfirmed.current[habitId] = { completed: nextDone, value: null };
  }

  async function adjustCount(habit: Habit, delta: number) {
    const target = habit.target_value ?? 1;
    const currentValue = Math.max(0, dayEntries[habit.id]?.value ?? 0);
    const nextValue = Math.max(0, currentValue + delta);
    const nextDone = nextValue >= target;
    setDayEntries((prev) => ({ ...prev, [habit.id]: { completed: nextDone, value: nextValue } }));

    const { error } = await supabase.from('habit_logs').upsert(
      { habit_id: habit.id, log_date: anchor, value: nextValue, completed: nextDone },
      { onConflict: 'habit_id,log_date' }
    );

    if (error) {
      const confirmed = lastConfirmed.current[habit.id] ?? { completed: false, value: 0 };
      setDayEntries((prev) => ({ ...prev, [habit.id]: confirmed }));
      showToast(error.message);
      return;
    }
    lastConfirmed.current[habit.id] = { completed: nextDone, value: nextValue };
  }

  function shiftAnchor(direction: 1 | -1) {
    setAnchor((prev) => {
      if (period === 'month') return addMonthsISO(prev, direction);
      const days = period === 'day' ? direction : period === 'week' ? direction * 7 : direction * 364;
      return addDaysISO(prev, days);
    });
  }

  const today = todayISO();
  const canGoNext = range.end < today;

  function existedCountForDate(dateISO: string): number {
    const relevant = selectedHabit ? [selectedHabit] : habits;
    return relevant.filter((h) => h.created_at.slice(0, 10) <= dateISO).length;
  }

  function cellState(dateISO: string): 'completed' | 'missed' | 'out-of-range' {
    if (dateISO > today) return 'out-of-range';
    if ((dayLogs[dateISO] ?? 0) > 0) return 'completed';
    return existedCountForDate(dateISO) > 0 ? 'missed' : 'out-of-range';
  }

  function cellStyle(dateISO: string): React.CSSProperties {
    const completed = dayLogs[dateISO] ?? 0;
    if (completed === 0) return {};
    const existed = Math.max(1, existedCountForDate(dateISO));
    const intensity = Math.min(1, completed / existed);
    const color = selectedHabit?.color ?? '#3F6C51';
    return { background: color, opacity: 0.35 + intensity * 0.65 };
  }

  function cellAriaLabel(dateISO: string): string {
    const state = cellState(dateISO);
    const dayText = new Date(dateISO + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    if (state === 'out-of-range') {
      return dateISO > today ? `${dayText}, upcoming` : `${dayText}, before tracking started`;
    }
    if (selectedHabit) {
      return `${dayText}, ${state === 'completed' ? 'completed' : 'not completed'}`;
    }
    const completed = dayLogs[dateISO] ?? 0;
    const existed = existedCountForDate(dateISO);
    return `${dayText}, ${completed} of ${existed} habit${existed === 1 ? '' : 's'} completed`;
  }

  const headerLabel =
    period === 'day'
      ? formatDayLabel(anchor)
      : period === 'week'
        ? `Week of ${range.start}`
        : period === 'month'
          ? formatMonthLabel(new Date(anchor + 'T00:00:00').getFullYear(), new Date(anchor + 'T00:00:00').getMonth())
          : `${range.start} – ${range.end}`;

  return (
    <div className="screen">
      <header className="top-bar">
        <h1>Calendar</h1>
      </header>

      <select
        className="habit-picker"
        value={selectedHabitId ?? ''}
        onChange={(e) => setSelectedHabitId(e.target.value || null)}
        disabled={period === 'day'}
      >
        <option value="">All habits</option>
        {habits.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>

      <div className="segmented">
        {(['day', 'week', 'month', 'year'] as Period[]).map((p) => (
          <button key={p} type="button" className={period === p ? 'selected' : ''} onClick={() => setPeriod(p)}>
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="calendar-nav">
        <button type="button" className="btn-icon" onClick={() => shiftAnchor(-1)} aria-label="Previous">
          ‹
        </button>
        <span className="calendar-label">{headerLabel}</span>
        <button type="button" className="btn-icon" onClick={() => shiftAnchor(1)} disabled={!canGoNext} aria-label="Next">
          ›
        </button>
      </div>

      {period === 'day' && (
        <ul className="habit-list">
          {habits.length === 0 && <p className="subtitle">No habits yet.</p>}
          {habits.map((h) => {
            const entry = dayEntries[h.id];
            const done = entry?.completed ?? false;
            const isCount = h.target_type === 'count';
            const value = Math.max(0, entry?.value ?? 0);
            return (
              <li key={h.id} className="habit-row">
                {isCount ? (
                  <div className="count-control">
                    <button type="button" className="count-btn" disabled={value === 0} onClick={() => adjustCount(h, -1)}>
                      −
                    </button>
                    <span
                      className={`count-value ${done ? 'checked' : ''}`}
                      style={done ? { background: h.color, borderColor: h.color } : { borderColor: h.color }}
                    >
                      {done ? '✓' : value}
                    </span>
                    <button type="button" className="count-btn" onClick={() => adjustCount(h, 1)}>
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`check ${done ? 'checked' : ''}`}
                    style={{ borderColor: h.color, background: done ? h.color : 'transparent' }}
                    onClick={() => toggleBoolean(h.id)}
                  >
                    {done ? '✓' : ''}
                  </button>
                )}
                <span className="habit-name" style={{ cursor: 'default' }}>
                  <span>
                    {h.name}
                    {isCount && (
                      <span className="goal-sub">
                        {value}/{h.target_value} {h.target_unit ?? ''}
                      </span>
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {period === 'week' && !loading && (
        <div className="week-grid">
          {Array.from({ length: 7 }, (_, i) => addDaysISO(range.start, i)).map((date) => (
            <button
              key={date}
              type="button"
              className={`week-cell day-${cellState(date)}`}
              style={cellStyle(date)}
              disabled={date > today}
              aria-label={cellAriaLabel(date)}
              onClick={() => {
                setAnchor(date);
                setPeriod('day');
              }}
            >
              <span className="week-cell-label">{WEEKDAY_LABELS[weekdayIndex(date)]}</span>
              <span className="week-cell-date">{date.slice(8, 10)}</span>
            </button>
          ))}
        </div>
      )}

      {period === 'month' && !loading && (
        <MonthGrid
          anchor={anchor}
          today={today}
          cellStyle={cellStyle}
          cellState={cellState}
          cellAriaLabel={cellAriaLabel}
          onPickDay={(date) => { setAnchor(date); setPeriod('day'); }}
        />
      )}

      {period === 'year' && !loading && (
        <YearHeatmap
          start={range.start}
          end={range.end}
          cellStyle={cellStyle}
          cellState={cellState}
          selectedHabitName={selectedHabit?.name ?? null}
        />
      )}

      {loading && period !== 'day' && <p className="subtitle">Loading…</p>}
    </div>
  );
}

function MonthGrid({
  anchor,
  today,
  cellStyle,
  cellState,
  cellAriaLabel,
  onPickDay,
}: {
  anchor: string;
  today: string;
  cellStyle: (date: string) => React.CSSProperties;
  cellState: (date: string) => 'completed' | 'missed' | 'out-of-range';
  cellAriaLabel: (date: string) => string;
  onPickDay: (date: string) => void;
}) {
  const d = new Date(anchor + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = startOfMonthISO(year, month);
  const leading = weekdayIndex(firstDay);
  const totalDays = daysInMonth(year, month);
  const cells: (string | null)[] = [...Array(leading).fill(null), ...Array.from({ length: totalDays }, (_, i) => addDaysISO(firstDay, i))];

  return (
    <div className="month-grid">
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className="month-weekday">
          {label}
        </div>
      ))}
      {cells.map((date, i) =>
        date ? (
          <button
            key={date}
            type="button"
            className={`month-cell day-${cellState(date)} ${date === today ? 'today' : ''}`}
            style={cellStyle(date)}
            disabled={date > today}
            aria-label={cellAriaLabel(date)}
            onClick={() => onPickDay(date)}
          >
            {Number(date.slice(8, 10))}
          </button>
        ) : (
          <div key={`blank-${i}`} className="month-cell blank" />
        )
      )}
    </div>
  );
}

function YearHeatmap({
  start,
  end,
  cellStyle,
  cellState,
  selectedHabitName,
}: {
  start: string;
  end: string;
  cellStyle: (date: string) => React.CSSProperties;
  cellState: (date: string) => 'completed' | 'missed' | 'out-of-range';
  selectedHabitName: string | null;
}) {
  const columns: string[][] = [];
  let cursor = start;
  let completedCount = 0;
  while (cursor <= end) {
    const week = Array.from({ length: 7 }, (_, i) => addDaysISO(cursor, i)).filter((d) => d <= end);
    for (const date of week) {
      if (cellState(date) === 'completed') completedCount++;
    }
    columns.push(week);
    cursor = addDaysISO(cursor, 7);
  }

  const summary = `Completion heatmap for ${selectedHabitName ?? 'all habits'} over the last 52 weeks: ${completedCount} day${completedCount === 1 ? '' : 's'} completed.`;

  return (
    <div className="year-heatmap" role="img" aria-label={summary}>
      {columns.map((week, wi) => (
        <div key={wi} className="year-heatmap-col">
          {week.map((date) => (
            <div
              key={date}
              className={`year-heatmap-cell day-${cellState(date)}`}
              style={cellStyle(date)}
              title={date}
              aria-hidden="true"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
