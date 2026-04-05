import type Database from "better-sqlite3";
import type { HealthRecord, Workout } from "./types.js";

export function queryRecords(
  db: Database.Database,
  options: {
    recordType: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): HealthRecord[] {
  let sql = "SELECT * FROM health_records WHERE record_type = ?";
  const params: (string | number)[] = [options.recordType];

  if (options.startDate) {
    sql += " AND start_date >= ?";
    params.push(options.startDate);
  }
  if (options.endDate) {
    sql += " AND start_date <= ?";
    params.push(options.endDate);
  }
  sql += " ORDER BY start_date DESC";
  sql += " LIMIT ?";
  params.push(options.limit ?? 100);

  return db.prepare(sql).all(...params) as HealthRecord[];
}

export function queryWorkouts(
  db: Database.Database,
  options: {
    workoutType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Workout[] {
  let sql = "SELECT * FROM workouts WHERE 1=1";
  const params: (string | number)[] = [];

  if (options.workoutType) {
    sql += " AND activity_type = ?";
    params.push(options.workoutType);
  }
  if (options.startDate) {
    sql += " AND start_date >= ?";
    params.push(options.startDate);
  }
  if (options.endDate) {
    sql += " AND start_date <= ?";
    params.push(options.endDate);
  }
  sql += " ORDER BY start_date DESC";
  sql += " LIMIT ?";
  params.push(options.limit ?? 100);

  return db.prepare(sql).all(...params) as Workout[];
}

export function listRecordTypes(db: Database.Database): { type: string; count: number }[] {
  return db
    .prepare(
      "SELECT record_type as type, COUNT(*) as count FROM health_records GROUP BY record_type ORDER BY count DESC"
    )
    .all() as { type: string; count: number }[];
}

export function listWorkoutTypes(db: Database.Database): { type: string; count: number }[] {
  return db
    .prepare(
      "SELECT activity_type as type, COUNT(*) as count FROM workouts GROUP BY activity_type ORDER BY count DESC"
    )
    .all() as { type: string; count: number }[];
}

export function aggregateRecords(
  db: Database.Database,
  options: {
    recordType: string;
    startDate?: string;
    endDate?: string;
    aggregation: "daily" | "hourly";
  }
): { period: string; avg: number; min: number; max: number; count: number }[] {
  const dateExpr =
    options.aggregation === "daily"
      ? "SUBSTR(start_date, 1, 10)"
      : "SUBSTR(start_date, 1, 13)";

  let sql = `SELECT ${dateExpr} as period,
    AVG(CAST(value AS REAL)) as avg,
    MIN(CAST(value AS REAL)) as min,
    MAX(CAST(value AS REAL)) as max,
    COUNT(*) as count
    FROM health_records
    WHERE record_type = ? AND value IS NOT NULL`;
  const params: (string | number)[] = [options.recordType];

  if (options.startDate) {
    sql += " AND start_date >= ?";
    params.push(options.startDate);
  }
  if (options.endDate) {
    sql += " AND start_date <= ?";
    params.push(options.endDate);
  }
  sql += ` GROUP BY ${dateExpr} ORDER BY period DESC`;

  return db.prepare(sql).all(...params) as {
    period: string;
    avg: number;
    min: number;
    max: number;
    count: number;
  }[];
}
