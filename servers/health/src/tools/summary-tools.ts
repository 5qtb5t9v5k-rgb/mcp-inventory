import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { OuraClient } from "../sources/oura/client.js";
import { StravaClient } from "../sources/strava/client.js";
import type { StravaActivitySummary, StravaStats } from "../sources/strava/types.js";
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

const STRAVA_DATA_TYPES = [
  "activities",
  "activity_detail",
  "activity_streams",
  "athlete_stats",
  "zones",
  "gear",
  "athlete",
];

/**
 * Load Apple Health modules lazily so better-sqlite3 / sax never load
 * unless APPLE_HEALTH_ENABLED=true.
 */
async function loadAppleHealth() {
  if (!config.appleHealthEnabled) return null;
  const [cache, query] = await Promise.all([
    import("../sources/apple-health/cache.js"),
    import("../sources/apple-health/query.js"),
  ]);
  return { ...cache, ...query };
}

function hasStravaCreds(): boolean {
  return !!(config.stravaClientId && config.stravaClientSecret && config.stravaRefreshToken);
}

export function registerSummaryTools(server: McpServer): void {
  server.tool(
    "list_data_types",
    "List all available data types from Oura, Strava, and optionally Apple Health.",
    {
      source: z
        .enum(["oura", "strava", "apple_health", "all"])
        .optional()
        .describe("Filter by source (default: all)"),
    },
    async ({ source }) => {
      const result: Record<string, unknown> = {};
      const filter = source ?? "all";

      if (filter === "oura" || filter === "all") {
        result.oura = {
          configured: !!config.ouraToken,
          data_types: OURA_DATA_TYPES,
        };
      }

      if (filter === "strava" || filter === "all") {
        result.strava = {
          configured: hasStravaCreds(),
          data_types: STRAVA_DATA_TYPES,
        };
      }

      if (filter === "apple_health" || filter === "all") {
        if (!config.appleHealthEnabled) {
          result.apple_health = {
            enabled: false,
            message: "Apple Health is disabled. Set APPLE_HEALTH_ENABLED=true to enable (local use only).",
          };
        } else {
          try {
            const ah = await loadAppleHealth();
            if (!ah) throw new Error("not loaded");
            const db = ah.getDb();
            const meta = ah.getImportMetadata(db);
            const recordTypes = ah.listRecordTypes(db);
            const workoutTypes = ah.listWorkoutTypes(db);
            result.apple_health = {
              enabled: true,
              imported: !!meta,
              import_date: meta?.import_date ?? null,
              record_count: meta?.record_count ?? 0,
              record_types: recordTypes,
              workout_types: workoutTypes,
            };
          } catch {
            result.apple_health = {
              enabled: true,
              imported: false,
              message: "Run apple_health_import first to load data.",
            };
          }
        }
      }

      return textResult(result);
    }
  );

  server.tool(
    "health_summary",
    "Get a combined health summary from Oura, Strava, and (optionally) Apple Health for a date range.",
    {
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 7 days ago."),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async ({ start_date, end_date }) => {
      const { start_date: s, end_date: e } = defaultDateRange(start_date, end_date);
      const summary: Record<string, unknown> = { period: { start: s, end: e } };

      // Oura
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
              avg_steps: steps.length > 0 ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : null,
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

      // Strava
      if (hasStravaCreds()) {
        try {
          const stravaClient = new StravaClient({
            clientId: config.stravaClientId,
            clientSecret: config.stravaClientSecret,
            refreshToken: config.stravaRefreshToken,
          });
          const after = Math.floor(new Date(s).getTime() / 1000);
          const before = Math.floor((new Date(e).getTime() + 86400_000) / 1000);
          const activities = await stravaClient.getPaginated<StravaActivitySummary>(
            "/athlete/activities",
            { after, before },
            3,
            100
          );
          const totalDistance = activities.reduce((a, b) => a + (b.distance ?? 0), 0);
          const totalTime = activities.reduce((a, b) => a + (b.moving_time ?? 0), 0);
          const totalElev = activities.reduce((a, b) => a + (b.total_elevation_gain ?? 0), 0);
          const byType: Record<string, number> = {};
          for (const a of activities) byType[a.type] = (byType[a.type] ?? 0) + 1;
          summary.strava = {
            activity_count: activities.length,
            total_distance_km: +(totalDistance / 1000).toFixed(1),
            total_moving_time_hours: +(totalTime / 3600).toFixed(1),
            total_elevation_gain_m: Math.round(totalElev),
            by_type: byType,
          };
        } catch (err) {
          summary.strava = { error: String(err) };
        }
      }

      // Apple Health (only when enabled)
      if (config.appleHealthEnabled) {
        try {
          const ah = await loadAppleHealth();
          if (ah) {
            const db = ah.getDb();
            const stepData = ah.aggregateRecords(db, {
              recordType: "HKQuantityTypeIdentifierStepCount",
              startDate: s,
              endDate: e,
              aggregation: "daily",
            });
            const hrData = ah.aggregateRecords(db, {
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
          }
        } catch {
          // Apple Health cache not available, skip
        }
      }

      return textResult(summary);
    }
  );

  server.tool(
    "health_trends",
    "Get trend analysis for a specific metric over time. Supported: oura_sleep_score, oura_steps, oura_readiness_score, oura_activity_score, strava_distance, strava_elevation, or an Apple Health record type.",
    {
      metric: z.string().describe("Metric to analyze"),
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
        } else if (metric.startsWith("strava_") && hasStravaCreds()) {
          const stravaClient = new StravaClient({
            clientId: config.stravaClientId,
            clientSecret: config.stravaClientSecret,
            refreshToken: config.stravaRefreshToken,
          });
          const after = Math.floor(new Date(startD).getTime() / 1000);
          const before = Math.floor((new Date(endD).getTime() + 86400_000) / 1000);
          const activities = await stravaClient.getPaginated<StravaActivitySummary>(
            "/athlete/activities",
            { after, before },
            3,
            100
          );
          // Group activities by date
          const byDate = new Map<string, number>();
          for (const a of activities) {
            const date = a.start_date_local.slice(0, 10);
            let v = 0;
            if (metric === "strava_distance") v = a.distance / 1000;
            else if (metric === "strava_elevation") v = a.total_elevation_gain;
            else if (metric === "strava_moving_time") v = a.moving_time / 60;
            byDate.set(date, (byDate.get(date) ?? 0) + v);
          }
          dataPoints = [...byDate.entries()].map(([date, value]) => ({ date, value }));
        } else if (config.appleHealthEnabled) {
          const ah = await loadAppleHealth();
          if (ah) {
            const db = ah.getDb();
            const aggregated = ah.aggregateRecords(db, {
              recordType: metric,
              startDate: startD,
              endDate: endD,
              aggregation: "daily",
            });
            dataPoints = aggregated.map((d) => ({ date: d.period, value: d.avg }));
          }
        }

        if (dataPoints.length === 0) {
          return textResult({ metric, message: "No data found for this metric and date range." });
        }

        dataPoints.sort((a, b) => a.date.localeCompare(b.date));

        const values = dataPoints.map((d) => d.value);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        const mid = Math.floor(values.length / 2);
        const firstHalf = values.slice(0, mid);
        const secondHalf = values.slice(mid);
        const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : avg;
        const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : avg;
        const changePercent = firstAvg !== 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

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
