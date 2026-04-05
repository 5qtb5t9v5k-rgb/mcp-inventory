import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, getImportMetadata } from "../sources/apple-health/cache.js";
import { listRecordTypes, listWorkoutTypes, aggregateRecords } from "../sources/apple-health/query.js";
import { OuraClient } from "../sources/oura/client.js";
import { defaultDateRange } from "../utils/dates.js";

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

const OURA_DATA_TYPES = [
  "daily_sleep",
  "sleep_periods",
  "daily_activity",
  "daily_readiness",
  "heart_rate",
  "spo2",
  "body_temperature",
  "daily_stress",
  "personal_info",
];

export function registerSummaryTools(server: McpServer): void {
  server.tool(
    "list_data_types",
    "List all available data types from Oura and/or Apple Health",
    {
      source: z
        .enum(["oura", "apple_health", "all"])
        .optional()
        .describe("Filter by source (default: all)"),
    },
    async ({ source }) => {
      const result: Record<string, unknown> = {};
      const filterSource = source ?? "all";

      if (filterSource === "oura" || filterSource === "all") {
        result.oura = {
          configured: !!config.ouraToken,
          data_types: OURA_DATA_TYPES,
        };
      }

      if (filterSource === "apple_health" || filterSource === "all") {
        try {
          const db = getDb();
          const meta = getImportMetadata(db);
          const recordTypes = listRecordTypes(db);
          const workoutTypes = listWorkoutTypes(db);
          result.apple_health = {
            imported: !!meta,
            import_date: meta?.import_date ?? null,
            record_count: meta?.record_count ?? 0,
            record_types: recordTypes,
            workout_types: workoutTypes,
          };
        } catch {
          result.apple_health = {
            imported: false,
            message: "Run apple_health_import first to load data.",
          };
        }
      }

      return textResult(result);
    }
  );

  server.tool(
    "health_summary",
    "Get a combined health summary from both Oura and Apple Health for a date range",
    {
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 7 days ago."),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async ({ start_date, end_date }) => {
      const { start_date: s, end_date: e } = defaultDateRange(start_date, end_date);
      const summary: Record<string, unknown> = { period: { start: s, end: e } };

      // Oura data
      if (config.ouraToken) {
        const client = new OuraClient(config.ouraToken, config.ouraBaseUrl);
        try {
          const [sleep, activity, readiness] = await Promise.all([
            client.getAll<Record<string, unknown>>("/v2/usercollection/daily_sleep", { start_date: s, end_date: e }),
            client.getAll<Record<string, unknown>>("/v2/usercollection/daily_activity", { start_date: s, end_date: e }),
            client.getAll<Record<string, unknown>>("/v2/usercollection/daily_readiness", { start_date: s, end_date: e }),
          ]);

          const sleepScores = sleep.map((d) => d.score).filter((s): s is number => s != null);
          const activityScores = activity.map((d) => d.score).filter((s): s is number => s != null);
          const readinessScores = readiness.map((d) => d.score).filter((s): s is number => s != null);
          const steps = activity.map((d) => d.steps).filter((s): s is number => s != null);

          summary.oura = {
            days: sleep.length,
            sleep: sleepScores.length > 0 ? {
              avg_score: Math.round(sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length),
              min_score: Math.min(...sleepScores),
              max_score: Math.max(...sleepScores),
            } : null,
            activity: activityScores.length > 0 ? {
              avg_score: Math.round(activityScores.reduce((a, b) => a + b, 0) / activityScores.length),
              avg_steps: Math.round(steps.reduce((a, b) => a + b, 0) / steps.length),
              total_steps: steps.reduce((a, b) => a + b, 0),
            } : null,
            readiness: readinessScores.length > 0 ? {
              avg_score: Math.round(readinessScores.reduce((a, b) => a + b, 0) / readinessScores.length),
              min_score: Math.min(...readinessScores),
              max_score: Math.max(...readinessScores),
            } : null,
          };
        } catch (err) {
          summary.oura = { error: String(err) };
        }
      }

      // Apple Health data
      try {
        const db = getDb();
        const stepData = aggregateRecords(db, {
          recordType: "HKQuantityTypeIdentifierStepCount",
          startDate: s,
          endDate: e,
          aggregation: "daily",
        });

        const hrData = aggregateRecords(db, {
          recordType: "HKQuantityTypeIdentifierHeartRate",
          startDate: s,
          endDate: e,
          aggregation: "daily",
        });

        if (stepData.length > 0 || hrData.length > 0) {
          summary.apple_health = {
            steps: stepData.length > 0 ? {
              days: stepData.length,
              avg_daily: Math.round(stepData.reduce((a, b) => a + b.avg * b.count, 0) / stepData.length),
              total: Math.round(stepData.reduce((a, b) => a + b.avg * b.count, 0)),
            } : null,
            heart_rate: hrData.length > 0 ? {
              days: hrData.length,
              avg_bpm: Math.round(hrData.reduce((a, b) => a + b.avg, 0) / hrData.length),
              min_bpm: Math.round(Math.min(...hrData.map((d) => d.min))),
              max_bpm: Math.round(Math.max(...hrData.map((d) => d.max))),
            } : null,
          };
        }
      } catch {
        // Apple Health cache not available, skip
      }

      return textResult(summary);
    }
  );

  server.tool(
    "health_trends",
    "Get trend analysis for a specific health metric over time",
    {
      metric: z.string().describe("Metric to analyze (e.g. 'oura_sleep_score', 'oura_steps', 'HKQuantityTypeIdentifierHeartRate')"),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async ({ metric, start_date, end_date }) => {
      const endD = end_date ?? new Date().toISOString().slice(0, 10);
      const startD = start_date ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      try {
        let dataPoints: { date: string; value: number }[] = [];

        if (metric.startsWith("oura_") && config.ouraToken) {
          const client = new OuraClient(config.ouraToken, config.ouraBaseUrl);

          if (metric === "oura_sleep_score") {
            const data = await client.getAll<Record<string, unknown>>("/v2/usercollection/daily_sleep", { start_date: startD, end_date: endD });
            dataPoints = data.filter((d) => d.score != null).map((d) => ({ date: d.day as string, value: d.score as number }));
          } else if (metric === "oura_steps") {
            const data = await client.getAll<Record<string, unknown>>("/v2/usercollection/daily_activity", { start_date: startD, end_date: endD });
            dataPoints = data.filter((d) => d.steps != null).map((d) => ({ date: d.day as string, value: d.steps as number }));
          } else if (metric === "oura_readiness_score") {
            const data = await client.getAll<Record<string, unknown>>("/v2/usercollection/daily_readiness", { start_date: startD, end_date: endD });
            dataPoints = data.filter((d) => d.score != null).map((d) => ({ date: d.day as string, value: d.score as number }));
          } else if (metric === "oura_activity_score") {
            const data = await client.getAll<Record<string, unknown>>("/v2/usercollection/daily_activity", { start_date: startD, end_date: endD });
            dataPoints = data.filter((d) => d.score != null).map((d) => ({ date: d.day as string, value: d.score as number }));
          }
        } else {
          // Treat as Apple Health record type
          const db = getDb();
          const aggregated = aggregateRecords(db, {
            recordType: metric,
            startDate: startD,
            endDate: endD,
            aggregation: "daily",
          });
          dataPoints = aggregated.map((d) => ({ date: d.period, value: d.avg }));
        }

        if (dataPoints.length === 0) {
          return textResult({ metric, message: "No data found for this metric and date range." });
        }

        // Sort chronologically
        dataPoints.sort((a, b) => a.date.localeCompare(b.date));

        const values = dataPoints.map((d) => d.value);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        // Simple trend: compare first half avg to second half avg
        const mid = Math.floor(values.length / 2);
        const firstHalf = values.slice(0, mid);
        const secondHalf = values.slice(mid);
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

        let direction: string;
        if (Math.abs(changePercent) < 2) direction = "stable";
        else if (changePercent > 0) direction = "increasing";
        else direction = "decreasing";

        return textResult({
          metric,
          period: { start: startD, end: endD },
          data_points: dataPoints.length,
          average: Math.round(avg * 100) / 100,
          min: Math.round(Math.min(...values) * 100) / 100,
          max: Math.round(Math.max(...values) * 100) / 100,
          trend: {
            direction,
            change_percent: Math.round(changePercent * 10) / 10,
            first_half_avg: Math.round(firstAvg * 100) / 100,
            second_half_avg: Math.round(secondAvg * 100) / 100,
          },
          data: dataPoints,
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );
}
