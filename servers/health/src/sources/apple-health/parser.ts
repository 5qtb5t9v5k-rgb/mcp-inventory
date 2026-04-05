import sax from "sax";
import { createReadStream, statSync } from "fs";
import type Database from "better-sqlite3";
import type { HealthRecord, Workout } from "./types.js";
import {
  clearCache,
  insertRecordsBatch,
  insertWorkoutsBatch,
  setImportMetadata,
} from "./cache.js";

const BATCH_SIZE = 5000;

export async function parseAppleHealthExport(
  filePath: string,
  db: Database.Database
): Promise<{ records: number; workouts: number }> {
  clearCache(db);

  let recordCount = 0;
  let workoutCount = 0;
  let recordBatch: HealthRecord[] = [];
  let workoutBatch: Workout[] = [];

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const parser = sax.createStream(true, { trim: true });

    parser.on("opentag", (node) => {
      if (node.name === "Record") {
        const attrs = node.attributes as Record<string, string>;
        recordBatch.push({
          record_type: attrs.type ?? "",
          source_name: attrs.sourceName ?? null,
          unit: attrs.unit ?? null,
          value: attrs.value ?? null,
          start_date: attrs.startDate ?? "",
          end_date: attrs.endDate ?? null,
        });
        recordCount++;

        if (recordBatch.length >= BATCH_SIZE) {
          insertRecordsBatch(db, recordBatch);
          recordBatch = [];
        }
      } else if (node.name === "Workout") {
        const attrs = node.attributes as Record<string, string>;
        workoutBatch.push({
          activity_type: attrs.workoutActivityType ?? "",
          duration: attrs.duration ? parseFloat(attrs.duration) : null,
          duration_unit: attrs.durationUnit ?? null,
          total_distance: attrs.totalDistance ? parseFloat(attrs.totalDistance) : null,
          distance_unit: attrs.totalDistanceUnit ?? null,
          total_energy: attrs.totalEnergyBurned ? parseFloat(attrs.totalEnergyBurned) : null,
          energy_unit: attrs.totalEnergyBurnedUnit ?? null,
          start_date: attrs.startDate ?? "",
          end_date: attrs.endDate ?? null,
          source_name: attrs.sourceName ?? null,
        });
        workoutCount++;

        if (workoutBatch.length >= BATCH_SIZE) {
          insertWorkoutsBatch(db, workoutBatch);
          workoutBatch = [];
        }
      }
    });

    parser.on("end", () => {
      if (recordBatch.length > 0) insertRecordsBatch(db, recordBatch);
      if (workoutBatch.length > 0) insertWorkoutsBatch(db, workoutBatch);

      const stat = statSync(filePath);
      setImportMetadata(db, {
        file_path: filePath,
        file_size: stat.size,
        file_modified: stat.mtime.toISOString(),
        import_date: new Date().toISOString(),
        record_count: recordCount + workoutCount,
      });

      resolve({ records: recordCount, workouts: workoutCount });
    });

    parser.on("error", (err) => {
      reject(new Error(`XML parse error: ${err.message}`));
    });

    stream.pipe(parser);
  });
}
