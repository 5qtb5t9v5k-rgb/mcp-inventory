import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StravaClient } from "../sources/strava/client.js";
import type {
  StravaActivitySummary,
  StravaActivityDetail,
  StravaStats,
  StravaZones,
  StravaGear,
  StravaStream,
  StravaAthlete,
} from "../sources/strava/types.js";
import { config } from "../config.js";

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

function noCredentialsError() {
  return textResult(
    {
      error:
        "Strava credentials not configured. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN.",
    },
    true
  );
}

/**
 * Trim an activity down to the fields an LLM actually needs.
 * Raw Strava responses are huge — polylines, segment efforts, photos etc.
 * blow up the context. Keep map.summary_polyline only for detail calls.
 */
function summarizeActivity(a: StravaActivitySummary) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    sport_type: a.sport_type,
    start_date_local: a.start_date_local,
    distance_km: +(a.distance / 1000).toFixed(2),
    moving_time_min: Math.round(a.moving_time / 60),
    elapsed_time_min: Math.round(a.elapsed_time / 60),
    elevation_gain_m: Math.round(a.total_elevation_gain),
    avg_speed_kmh: a.average_speed ? +(a.average_speed * 3.6).toFixed(2) : undefined,
    max_speed_kmh: a.max_speed ? +(a.max_speed * 3.6).toFixed(2) : undefined,
    avg_heartrate: a.average_heartrate,
    max_heartrate: a.max_heartrate,
    avg_watts: a.average_watts,
    weighted_avg_watts: a.weighted_average_watts,
    kilojoules: a.kilojoules,
    calories: a.calories,
    suffer_score: a.suffer_score,
    trainer: a.trainer,
    commute: a.commute,
    gear_id: a.gear_id,
  };
}

export function registerStravaTools(server: McpServer): void {
  if (!config.stravaClientId || !config.stravaClientSecret || !config.stravaRefreshToken) {
    const toolNames = [
      "strava_get_activities",
      "strava_get_activity_detail",
      "strava_get_activity_streams",
      "strava_get_athlete_stats",
      "strava_get_zones",
      "strava_get_gear",
      "strava_get_athlete",
    ];
    for (const name of toolNames) {
      server.tool(name, `Strava: ${name} (credentials not configured)`, {}, async () => noCredentialsError());
    }
    return;
  }

  const client = new StravaClient({
    clientId: config.stravaClientId,
    clientSecret: config.stravaClientSecret,
    refreshToken: config.stravaRefreshToken,
  });

  server.tool(
    "strava_get_activities",
    "List recent Strava activities (runs, rides, workouts). Returns a compact summary per activity.",
    {
      after: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD) — only activities after this date."),
      before: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD) — only activities before this date."),
      per_page: z.number().int().min(1).max(200).optional().describe("Items per page (default 30, max 200)."),
      max_pages: z.number().int().min(1).max(10).optional().describe("Max pages to fetch (default 3)."),
    },
    async ({ after, before, per_page, max_pages }) => {
      try {
        const params: Record<string, string | number> = {};
        if (after) params.after = Math.floor(new Date(after).getTime() / 1000);
        if (before) params.before = Math.floor(new Date(before).getTime() / 1000);
        const activities = await client.getPaginated<StravaActivitySummary>(
          "/athlete/activities",
          params,
          max_pages ?? 3,
          per_page ?? 30
        );
        return textResult(activities.map(summarizeActivity));
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "strava_get_activity_detail",
    "Get detailed data for one activity: splits, segment efforts, laps, best efforts.",
    {
      activity_id: z.number().int().describe("Strava activity ID."),
      include_all_efforts: z.boolean().optional().describe("Include all segment efforts (default false)."),
    },
    async ({ activity_id, include_all_efforts }) => {
      try {
        const params: Record<string, string | number> = {};
        if (include_all_efforts) params.include_all_efforts = "true";
        const data = await client.get<StravaActivityDetail>(`/activities/${activity_id}`, params);
        return textResult({
          ...summarizeActivity(data),
          description: data.description,
          segment_efforts: data.segment_efforts?.map((e) => ({
            name: e.name,
            elapsed_time_s: e.elapsed_time,
            moving_time_s: e.moving_time,
            distance_m: e.distance,
            avg_heartrate: e.average_heartrate,
            avg_watts: e.average_watts,
            pr_rank: e.pr_rank,
            kom_rank: e.kom_rank,
            segment: {
              id: e.segment.id,
              name: e.segment.name,
              distance_m: e.segment.distance,
              avg_grade: e.segment.average_grade,
            },
          })),
          splits_metric: data.splits_metric,
          laps: data.laps?.map((l) => ({
            index: l.lap_index,
            distance_m: l.distance,
            moving_time_s: l.moving_time,
            avg_speed_kmh: +(l.average_speed * 3.6).toFixed(2),
            avg_heartrate: l.average_heartrate,
          })),
          best_efforts: data.best_efforts?.map((b) => ({
            name: b.name,
            distance_m: b.distance,
            moving_time_s: b.moving_time,
          })),
          map_polyline: data.map?.summary_polyline,
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "strava_get_activity_streams",
    "Get time-series streams for one activity (heart rate, power, speed, altitude, etc). Downsamples to keep response manageable.",
    {
      activity_id: z.number().int().describe("Strava activity ID."),
      keys: z
        .array(z.string())
        .optional()
        .describe(
          "Stream types: time, distance, heartrate, cadence, watts, temp, altitude, velocity_smooth, latlng, grade_smooth"
        ),
      resolution: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("low=100pts, medium=1000pts, high=10000pts. Default medium."),
    },
    async ({ activity_id, keys, resolution }) => {
      try {
        const streamKeys = keys ?? ["time", "heartrate", "watts", "velocity_smooth", "altitude"];
        const params: Record<string, string | number> = {
          keys: streamKeys.join(","),
          key_by_type: "true",
          resolution: resolution ?? "medium",
        };
        const data = await client.get<Record<string, StravaStream>>(
          `/activities/${activity_id}/streams`,
          params
        );
        // Return as { heartrate: [...], watts: [...] } with counts
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data)) {
          out[k] = {
            resolution: v.resolution,
            original_size: v.original_size,
            sample_count: Array.isArray(v.data) ? v.data.length : 0,
            data: v.data,
          };
        }
        return textResult(out);
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "strava_get_athlete_stats",
    "Get athlete-level stats: recent (4 weeks), YTD, and all-time totals for rides/runs/swims.",
    {},
    async () => {
      try {
        const me = await client.get<StravaAthlete>("/athlete");
        const stats = await client.get<StravaStats>(`/athletes/${me.id}/stats`);
        const fmt = (t: { count: number; distance: number; moving_time: number; elevation_gain: number }) => ({
          count: t.count,
          distance_km: +(t.distance / 1000).toFixed(1),
          moving_time_hours: +(t.moving_time / 3600).toFixed(1),
          elevation_gain_m: Math.round(t.elevation_gain),
        });
        return textResult({
          recent_4_weeks: {
            ride: fmt(stats.recent_ride_totals),
            run: fmt(stats.recent_run_totals),
            swim: fmt(stats.recent_swim_totals),
          },
          ytd: {
            ride: fmt(stats.ytd_ride_totals),
            run: fmt(stats.ytd_run_totals),
            swim: fmt(stats.ytd_swim_totals),
          },
          all_time: {
            ride: fmt(stats.all_ride_totals),
            run: fmt(stats.all_run_totals),
            swim: fmt(stats.all_swim_totals),
          },
          biggest_ride_km: stats.biggest_ride_distance
            ? +(stats.biggest_ride_distance / 1000).toFixed(1)
            : undefined,
          biggest_climb_m: stats.biggest_climb_elevation_gain
            ? Math.round(stats.biggest_climb_elevation_gain)
            : undefined,
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "strava_get_zones",
    "Get the athlete's heart rate and power zones.",
    {},
    async () => {
      try {
        const data = await client.get<StravaZones>("/athlete/zones");
        return textResult(data);
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "strava_get_gear",
    "Get details for a specific piece of gear (bike/shoe) including total distance.",
    {
      gear_id: z.string().describe("Gear ID from an activity (e.g. 'b12345' for bike, 'g12345' for shoes)."),
    },
    async ({ gear_id }) => {
      try {
        const data = await client.get<StravaGear>(`/gear/${gear_id}`);
        return textResult({
          ...data,
          distance_km: +(data.distance / 1000).toFixed(1),
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "strava_get_athlete",
    "Get the authenticated athlete's profile (name, weight, city).",
    {},
    async () => {
      try {
        const data = await client.get<StravaAthlete>("/athlete");
        return textResult(data);
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );
}
