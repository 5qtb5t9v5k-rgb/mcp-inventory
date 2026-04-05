export interface OuraResponse<T> {
  data: T[];
  next_token?: string;
}

export interface DailySleep {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  contributors: {
    deep_sleep: number | null;
    efficiency: number | null;
    latency: number | null;
    rem_sleep: number | null;
    restfulness: number | null;
    timing: number | null;
    total_sleep: number | null;
  };
}

export interface SleepPeriod {
  id: string;
  day: string;
  bedtime_start: string;
  bedtime_end: string;
  duration: number;
  total_sleep_duration: number;
  awake_time: number;
  light_sleep_duration: number;
  deep_sleep_duration: number;
  rem_sleep_duration: number;
  restless_periods: number;
  efficiency: number;
  average_heart_rate: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
  type: string;
}

export interface DailyActivity {
  id: string;
  day: string;
  score: number | null;
  active_calories: number;
  total_calories: number;
  steps: number;
  equivalent_walking_distance: number;
  high_activity_time: number;
  medium_activity_time: number;
  low_activity_time: number;
  sedentary_time: number;
  resting_time: number;
}

export interface DailyReadiness {
  id: string;
  day: string;
  score: number | null;
  temperature_deviation: number | null;
  temperature_trend_deviation: number | null;
  timestamp: string;
  contributors: {
    activity_balance: number | null;
    body_temperature: number | null;
    hrv_balance: number | null;
    previous_day_activity: number | null;
    previous_night: number | null;
    recovery_index: number | null;
    resting_heart_rate: number | null;
    sleep_balance: number | null;
  };
}

export interface HeartRate {
  bpm: number;
  source: string;
  timestamp: string;
}

export interface DailySpO2 {
  id: string;
  day: string;
  spo2_percentage: {
    average: number;
  } | null;
}

export interface DailyStress {
  id: string;
  day: string;
  stress_high: number | null;
  recovery_high: number | null;
  day_summary: string | null;
}

export interface PersonalInfo {
  id: string;
  age: number | null;
  weight: number | null;
  height: number | null;
  biological_sex: string | null;
  email: string | null;
}
