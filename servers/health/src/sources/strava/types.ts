/**
 * Strava API types. Only the fields we actually surface — Strava responses
 * are huge, so we keep this focused and typed loosely where needed.
 */

export interface StravaAthlete {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  sex?: string;
  weight?: number;
  city?: string;
  country?: string;
  created_at: string;
}

export interface StravaActivitySummary {
  id: number;
  name: string;
  type: string; // Ride, Run, Hike, Workout, WeightTraining, etc.
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  average_speed?: number; // m/s
  max_speed?: number; // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  suffer_score?: number;
  calories?: number;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  device_name?: string;
  gear_id?: string;
  map?: {
    id: string;
    summary_polyline?: string;
  };
}

export interface StravaActivityDetail extends StravaActivitySummary {
  description?: string;
  calories?: number;
  segment_efforts?: StravaSegmentEffort[];
  splits_metric?: StravaSplit[];
  splits_standard?: StravaSplit[];
  laps?: StravaLap[];
  best_efforts?: StravaBestEffort[];
  photos?: { primary?: { urls?: Record<string, string> }; count: number };
}

export interface StravaSegmentEffort {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  segment: {
    id: number;
    name: string;
    activity_type: string;
    distance: number;
    average_grade: number;
    maximum_grade: number;
    elevation_high: number;
    elevation_low: number;
  };
  kom_rank?: number;
  pr_rank?: number;
}

export interface StravaSplit {
  distance: number;
  elapsed_time: number;
  elevation_difference: number;
  moving_time: number;
  split: number;
  average_speed: number;
  average_heartrate?: number;
  pace_zone?: number;
}

export interface StravaLap {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  lap_index: number;
  split: number;
}

export interface StravaBestEffort {
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
}

export interface StravaStats {
  biggest_ride_distance?: number;
  biggest_climb_elevation_gain?: number;
  recent_ride_totals: StravaTotals;
  recent_run_totals: StravaTotals;
  recent_swim_totals: StravaTotals;
  ytd_ride_totals: StravaTotals;
  ytd_run_totals: StravaTotals;
  ytd_swim_totals: StravaTotals;
  all_ride_totals: StravaTotals;
  all_run_totals: StravaTotals;
  all_swim_totals: StravaTotals;
}

export interface StravaTotals {
  count: number;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number;
  elevation_gain: number; // meters
  achievement_count?: number;
}

export interface StravaZones {
  heart_rate?: {
    custom_zones: boolean;
    zones: { min: number; max: number }[];
  };
  power?: {
    zones: { min: number; max: number }[];
  };
}

export interface StravaGear {
  id: string;
  primary: boolean;
  name: string;
  nickname?: string;
  distance: number;
  brand_name?: string;
  model_name?: string;
  description?: string;
}

/** Strava activity stream. Each stream is its own request but we return them together. */
export type StravaStreamType =
  | "time"
  | "distance"
  | "heartrate"
  | "cadence"
  | "watts"
  | "temp"
  | "altitude"
  | "velocity_smooth"
  | "latlng"
  | "grade_smooth";

export interface StravaStream {
  type: StravaStreamType;
  data: number[] | [number, number][];
  series_type: string;
  original_size: number;
  resolution: string;
}
