export type TargetType = 'boolean' | 'count';

export interface Habit {
  id: string;
  user_id: string;
  name: string;
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

export type AgeRange = '18-29' | '30-44' | '45-59' | '60+';
export type Gender = 'male' | 'female' | 'prefer_not_to_say';

export interface Profile {
  id: string;
  display_name: string;
  avatar_emoji: string;
  timezone: string;
  age_range: AgeRange | null;
  gender: Gender | null;
  created_at: string;
}
