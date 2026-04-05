export interface HealthRecord {
  id?: number;
  record_type: string;
  source_name: string | null;
  unit: string | null;
  value: string | null;
  start_date: string;
  end_date: string | null;
}

export interface Workout {
  id?: number;
  activity_type: string;
  duration: number | null;
  duration_unit: string | null;
  total_distance: number | null;
  distance_unit: string | null;
  total_energy: number | null;
  energy_unit: string | null;
  start_date: string;
  end_date: string | null;
  source_name: string | null;
}

export interface ImportMetadata {
  file_path: string;
  file_size: number;
  file_modified: string;
  import_date: string;
  record_count: number;
}
