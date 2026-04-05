import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, isCacheStale } from "../sources/apple-health/cache.js";
import { parseAppleHealthExport } from "../sources/apple-health/parser.js";
import { queryRecords, queryWorkouts, aggregateRecords } from "../sources/apple-health/query.js";

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

export function registerAppleHealthTools(server: McpServer): void {
  server.tool(
    "apple_health_import",
    "Parse Apple Health XML export and cache it to SQLite for fast queries. Run this before querying Apple Health data.",
    {
      file_path: z
        .string()
        .optional()
        .describe("Path to export.xml. Defaults to APPLE_HEALTH_EXPORT_PATH env var."),
      force: z
        .boolean()
        .optional()
        .describe("Force re-import even if cache is up to date."),
    },
    async ({ file_path, force }) => {
      const exportPath = file_path ?? config.appleHealthExportPath;
      if (!exportPath) {
        return textResult(
          { error: "No Apple Health export path. Set APPLE_HEALTH_EXPORT_PATH or pass file_path." },
          true
        );
      }

      try {
        const db = getDb();
        if (!force && !isCacheStale(db, exportPath)) {
          return textResult({ message: "Cache is up to date. Use force=true to re-import." });
        }

        const result = await parseAppleHealthExport(exportPath, db);
        return textResult({
          message: "Import completed successfully",
          records: result.records,
          workouts: result.workouts,
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "apple_health_query",
    "Query Apple Health records by type and date range. Run apple_health_import first if you haven't yet.",
    {
      record_type: z
        .string()
        .describe(
          "The record type to query (e.g. HKQuantityTypeIdentifierStepCount, HKQuantityTypeIdentifierHeartRate)"
        ),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
      limit: z.number().optional().describe("Max records to return (default 100)"),
      aggregate: z
        .enum(["none", "daily", "hourly"])
        .optional()
        .describe("Aggregate results by period instead of returning raw records (default: none)"),
    },
    async ({ record_type, start_date, end_date, limit, aggregate }) => {
      try {
        const db = getDb();

        if (aggregate && aggregate !== "none") {
          const data = aggregateRecords(db, {
            recordType: record_type,
            startDate: start_date,
            endDate: end_date,
            aggregation: aggregate,
          });
          return textResult(data);
        }

        const data = queryRecords(db, {
          recordType: record_type,
          startDate: start_date,
          endDate: end_date,
          limit,
        });
        return textResult(data);
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "apple_health_workouts",
    "Query Apple Health workout records by type and date range",
    {
      workout_type: z
        .string()
        .optional()
        .describe(
          "Filter by workout type (e.g. HKWorkoutActivityTypeRunning). Omit for all types."
        ),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
      limit: z.number().optional().describe("Max records to return (default 100)"),
    },
    async ({ workout_type, start_date, end_date, limit }) => {
      try {
        const db = getDb();
        const data = queryWorkouts(db, {
          workoutType: workout_type,
          startDate: start_date,
          endDate: end_date,
          limit,
        });
        return textResult(data);
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );
}
