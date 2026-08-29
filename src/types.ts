export type Schedule = 'daily' | 'weekdays' | 'custom';
export type TargetType = 'boolean' | 'count';

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  schedule: Schedule;
  color: string;
  is_archived: boolean;
  created_at: string;
  target_type: TargetType;
  target_value: number | null;
  target_unit: string | null;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  user_id: string;
  log_date: string;
  completed: boolean;
  value: number | null;
  created_at: string;
}

export interface StreakSummary {
  current_streak: number;
  longest_streak: number;
}
