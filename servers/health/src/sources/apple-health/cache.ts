import Database from "better-sqlite3";
import { mkdirSync, statSync } from "fs";
import { dirname, join } from "path";
import { config } from "../../config.js";
import type { HealthRecord, Workout, ImportMetadata } from "./types.js";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(config.cacheDir, { recursive: true });
  const dbPath = join(config.cacheDir, "apple_health.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL,
      source_name TEXT,
      unit TEXT,
      value TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_records_type_date ON health_records(record_type, start_date);

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_type TEXT NOT NULL,
      duration REAL,
      duration_unit TEXT,
      total_distance REAL,
      distance_unit TEXT,
      total_energy REAL,
      energy_unit TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      source_name TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_workouts_type_date ON workouts(activity_type, start_date);

    CREATE TABLE IF NOT EXISTS import_metadata (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      file_path TEXT NOT NULL,
      file_size INTEGER,
      file_modified TEXT,
      import_date TEXT NOT NULL,
      record_count INTEGER
    );
  `);
}

export function insertRecordsBatch(db: Database.Database, records: HealthRecord[]): void {
  const stmt = db.prepare(
    `INSERT INTO health_records (record_type, source_name, unit, value, start_date, end_date)
     VALUES (@record_type, @source_name, @unit, @value, @start_date, @end_date)`
  );
  const tx = db.transaction((rows: HealthRecord[]) => {
    for (const row of rows) stmt.run(row);
  });
  tx(records);
}

export function insertWorkoutsBatch(db: Database.Database, workouts: Workout[]): void {
  const stmt = db.prepare(
    `INSERT INTO workouts (activity_type, duration, duration_unit, total_distance, distance_unit, total_energy, energy_unit, start_date, end_date, source_name)
     VALUES (@activity_type, @duration, @duration_unit, @total_distance, @distance_unit, @total_energy, @energy_unit, @start_date, @end_date, @source_name)`
  );
  const tx = db.transaction((rows: Workout[]) => {
    for (const row of rows) stmt.run(row);
  });
  tx(workouts);
}

export function clearCache(db: Database.Database): void {
  db.exec("DELETE FROM health_records; DELETE FROM workouts; DELETE FROM import_metadata;");
}

export function setImportMetadata(db: Database.Database, meta: ImportMetadata): void {
  db.prepare(
    `INSERT OR REPLACE INTO import_metadata (id, file_path, file_size, file_modified, import_date, record_count)
     VALUES (1, @file_path, @file_size, @file_modified, @import_date, @record_count)`
  ).run(meta);
}

export function getImportMetadata(db: Database.Database): ImportMetadata | undefined {
  return db.prepare("SELECT * FROM import_metadata WHERE id = 1").get() as ImportMetadata | undefined;
}

export function isCacheStale(db: Database.Database, exportPath: string): boolean {
  const meta = getImportMetadata(db);
  if (!meta) return true;

  try {
    const stat = statSync(exportPath);
    return (
      meta.file_path !== exportPath ||
      meta.file_size !== stat.size ||
      meta.file_modified !== stat.mtime.toISOString()
    );
  } catch {
    return true;
  }
}
