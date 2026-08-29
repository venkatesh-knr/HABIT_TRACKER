import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  addDaysISO,
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

interface DayLog {
  completed: number;
  total: number;
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
  const [dayLogs, setDayLogs] = useState<Record<string, DayLog>>({});
  const [loading, setLoading] = useState(true);

  // day-view editable state (always covers all habits for the anchor date)
  const [dayEntries, setDayEntries] = useState<Record<string, DayEntry>>({});
  const [busyHabitId, setBusyHabitId] = useState<string | null>(null);

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

      const map: Record<string, DayLog> = {};
      for (const row of data ?? []) {
        if (!row.completed) continue;
        const entry = map[row.log_date] ?? { completed: 0, total: habitIds.length };
        entry.completed += 1;
        map[row.log_date] = entry;
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
      setDayEntries(map);
    }
    loadDay();
    return () => {
      cancelled = true;
    };
  }, [period, anchor]);

  async function toggleBoolean(habitId: string) {
    const currentlyDone = dayEntries[habitId]?.completed ?? false;
    setBusyHabitId(habitId);
    const { error } = await supabase
      .from('habit_logs')
      .upsert({ habit_id: habitId, log_date: anchor, completed: !currentlyDone }, { onConflict: 'habit_id,log_date' });
    setBusyHabitId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setDayEntries((prev) => ({ ...prev, [habitId]: { completed: !currentlyDone, value: null } }));
  }

  async function adjustCount(habit: Habit, delta: number) {
    const target = habit.target_value ?? 1;
    const currentValue = Math.max(0, dayEntries[habit.id]?.value ?? 0);
    const nextValue = Math.max(0, currentValue + delta);
    setBusyHabitId(habit.id);
    const { error } = await supabase.from('habit_logs').upsert(
      { habit_id: habit.id, log_date: anchor, value: nextValue, completed: nextValue >= target },
      { onConflict: 'habit_id,log_date' }
    );
    setBusyHabitId(null);
    if (error) {
      alert(error.message);
      return;
    }
    setDayEntries((prev) => ({ ...prev, [habit.id]: { completed: nextValue >= target, value: nextValue } }));
  }

  function shiftAnchor(days: number) {
    setAnchor((prev) => addDaysISO(prev, days));
  }

  function cellStyle(dateISO: string): React.CSSProperties {
    const log = dayLogs[dateISO];
    if (!log || log.completed === 0) return {};
    const intensity = log.completed / log.total;
    const color = selectedHabit?.color ?? '#3F6C51';
    return { background: color, opacity: 0.35 + intensity * 0.65 };
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
        <button
          type="button"
          className="btn-icon"
          onClick={() => shiftAnchor(period === 'day' ? -1 : period === 'week' ? -7 : period === 'month' ? -30 : -364)}
          aria-label="Previous"
        >
          ‹
        </button>
        <span className="calendar-label">{headerLabel}</span>
        <button
          type="button"
          className="btn-icon"
          onClick={() => shiftAnchor(period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 364)}
          aria-label="Next"
        >
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
                    <button
                      type="button"
                      className="count-btn"
                      disabled={busyHabitId === h.id || value === 0}
                      onClick={() => adjustCount(h, -1)}
                    >
                      −
                    </button>
                    <span
                      className={`count-value ${done ? 'checked' : ''}`}
                      style={done ? { background: h.color, borderColor: h.color } : { borderColor: h.color }}
                    >
                      {done ? '✓' : value}
                    </span>
                    <button type="button" className="count-btn" disabled={busyHabitId === h.id} onClick={() => adjustCount(h, 1)}>
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`check ${done ? 'checked' : ''}`}
                    style={{ borderColor: h.color, background: done ? h.color : 'transparent' }}
                    disabled={busyHabitId === h.id}
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
              className="week-cell"
              style={cellStyle(date)}
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
        <MonthGrid anchor={anchor} cellStyle={cellStyle} onPickDay={(date) => { setAnchor(date); setPeriod('day'); }} />
      )}

      {period === 'year' && !loading && <YearHeatmap start={range.start} end={range.end} cellStyle={cellStyle} />}

      {loading && period !== 'day' && <p className="subtitle">Loading…</p>}
    </div>
  );
}

function MonthGrid({
  anchor,
  cellStyle,
  onPickDay,
}: {
  anchor: string;
  cellStyle: (date: string) => React.CSSProperties;
  onPickDay: (date: string) => void;
}) {
  const d = new Date(anchor + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = startOfMonthISO(year, month);
  const leading = weekdayIndex(firstDay);
  const totalDays = daysInMonth(year, month);
  const cells: (string | null)[] = [...Array(leading).fill(null), ...Array.from({ length: totalDays }, (_, i) => addDaysISO(firstDay, i))];
  const today = todayISO();

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
            className={`month-cell ${date === today ? 'today' : ''}`}
            style={cellStyle(date)}
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
}: {
  start: string;
  end: string;
  cellStyle: (date: string) => React.CSSProperties;
}) {
  const columns: string[][] = [];
  let cursor = start;
  while (cursor <= end) {
    const week = Array.from({ length: 7 }, (_, i) => addDaysISO(cursor, i)).filter((d) => d <= end);
    columns.push(week);
    cursor = addDaysISO(cursor, 7);
  }

  return (
    <div className="year-heatmap">
      {columns.map((week, wi) => (
        <div key={wi} className="year-heatmap-col">
          {week.map((date) => (
            <div key={date} className="year-heatmap-cell" style={cellStyle(date)} title={date} />
          ))}
        </div>
      ))}
    </div>
  );
}
