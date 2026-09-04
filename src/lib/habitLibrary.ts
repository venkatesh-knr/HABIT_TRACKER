import type { TargetType } from '../types';

export interface LibraryHabit {
  name: string;
  color: string;
  category: string;
  quickStart?: boolean;
  target_type?: TargetType;
  target_value?: number;
  target_unit?: string;
}

const GREEN = '#3F6C51';
const AMBER = '#9C6B26';
const SLATE = '#4C5A4F';
const PLUM = '#7A4C6D';
const TEAL = '#2F5A73';

export const HABIT_LIBRARY: LibraryHabit[] = [
  // Health
  { name: 'Drink water', color: GREEN, category: 'Health', quickStart: true, target_type: 'count', target_value: 8, target_unit: 'glasses' },
  { name: 'Sleep 8 hours', color: SLATE, category: 'Health', quickStart: true },
  { name: 'Take vitamins', color: GREEN, category: 'Health' },
  { name: 'Eat a vegetable', color: GREEN, category: 'Health' },
  { name: 'No junk food', color: AMBER, category: 'Health' },

  // Fitness
  { name: 'Exercise', color: AMBER, category: 'Fitness', quickStart: true },
  { name: 'Stretch', color: AMBER, category: 'Fitness', quickStart: true },
  { name: 'Walking', color: SLATE, category: 'Fitness', quickStart: true, target_type: 'count', target_value: 6000, target_unit: 'steps' },
  { name: 'Push-ups', color: AMBER, category: 'Fitness', target_type: 'count', target_value: 20, target_unit: 'reps' },
  { name: 'Yoga', color: PLUM, category: 'Fitness' },

  // Mindfulness
  { name: 'Meditate', color: GREEN, category: 'Mindfulness', quickStart: true, target_type: 'count', target_value: 10, target_unit: 'minutes' },
  { name: 'Journal', color: PLUM, category: 'Mindfulness' },
  { name: 'Gratitude note', color: PLUM, category: 'Mindfulness' },
  { name: 'Deep breathing', color: TEAL, category: 'Mindfulness' },

  // Productivity
  { name: 'Read', color: GREEN, category: 'Productivity', quickStart: true, target_type: 'count', target_value: 20, target_unit: 'pages' },
  { name: 'Plan tomorrow', color: TEAL, category: 'Productivity' },
  { name: 'Inbox zero', color: SLATE, category: 'Productivity' },
  { name: 'No phone before bed', color: SLATE, category: 'Productivity' },

  // Learning
  { name: 'Practice language', color: TEAL, category: 'Learning', target_type: 'count', target_value: 15, target_unit: 'minutes' },
  { name: 'Practice instrument', color: TEAL, category: 'Learning', target_type: 'count', target_value: 20, target_unit: 'minutes' },
  { name: 'Learn something new', color: TEAL, category: 'Learning' },

  // Social / Finance
  { name: 'Call a friend or family', color: PLUM, category: 'Social' },
  { name: 'Track spending', color: SLATE, category: 'Finance' },
  { name: 'No impulse buys', color: SLATE, category: 'Finance' },
];

export const LIBRARY_CATEGORIES = Array.from(new Set(HABIT_LIBRARY.map((h) => h.category)));

export const QUICK_START_HABITS = HABIT_LIBRARY.filter((h) => h.quickStart);
